import type { AiFeature, AiPlan, AiUsageDto } from '@oj/contracts';
import { AiFeatures } from '@oj/contracts';
import { DomainError } from '../domain/domain-error.js';
import { AiAccess } from './ai-access.js';
import { RateLimiter, waitText, type RateLimitPolicy } from './rate-limiter.js';

/** Uses allowed per month for each plan and feature; null = no limit (OJ-21). */
export type AiLimits = Record<AiPlan, Record<AiFeature, number | null>>;

export const DEFAULT_AI_LIMITS: AiLimits = {
  NONE: { IMPORT: 0, IMAGE_IMPORT: 0, SECTION: 0, TESTS: 0, AI_USAGE_CHECK: 0 },
  FREE: { IMPORT: 3, IMAGE_IMPORT: 0, SECTION: 20, TESTS: 3, AI_USAGE_CHECK: 0 },
  PLUS: { IMPORT: 100, IMAGE_IMPORT: 100, SECTION: 500, TESTS: 100, AI_USAGE_CHECK: 2000 },
  UNLIMITED: { IMPORT: null, IMAGE_IMPORT: null, SECTION: null, TESTS: null, AI_USAGE_CHECK: null },
};

/** Requests a teacher may make per minute, across features (a burst guard, separate from the monthly allowance). */
export const DEFAULT_AI_RATE: RateLimitPolicy = { limit: 10, windowMs: 60_000 };

/**
 * Administrators have no monthly allowance, but still a per-minute ceiling: a stolen admin token must not be able to
 * run up an unbounded bill. Set high enough that no real admin work hits it.
 */
export const DEFAULT_ADMIN_AI_RATE: RateLimitPolicy = { limit: 60, windowMs: 60_000 };

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** The month a moment belongs to in Vietnam time ("2026-11"), and when the next one starts (UTC+7, no DST). */
export function aiPeriod(now: Date): { period: string; resetsAt: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return { period: `${year}-${String(month).padStart(2, '0')}`, resetsAt: new Date(Date.UTC(next.y, next.m - 1, 1, -7)) };
}

/** Port: the monthly counters. `reserve` must be atomic: concurrent calls never take the count past `limit`. */
export abstract class AiUsageStore {
  /** Adds one use if fewer than `limit` were used (`limit` null = always); false when the allowance is used up. */
  abstract reserve(userId: string, feature: AiFeature, period: string, limit: number | null): Promise<boolean>;
  /** Gives one use back (the AI call failed). Never goes below zero. */
  abstract release(userId: string, feature: AiFeature, period: string): Promise<void>;
  abstract used(userId: string, period: string): Promise<Map<AiFeature, number>>;
}

/** A reserved use; hand it back with `refund` when the AI call fails. */
export interface AiTicket {
  userId: string;
  feature: AiFeature;
  period: string;
}

/** Why no use could be reserved: `none` = the plan has no allowance for this feature, `quota` = used up this month. */
export type AiRefusal = 'none' | 'quota' | 'rate';
export interface Refused {
  refused: AiRefusal;
  limit: number;
  retryAfterMs: number;
}

/**
 * Use case: the monthly AI allowances (OJ-21). Every AI call reserves one use first and gives it back when the call
 * fails, so a failure never costs the teacher a use and parallel calls never exceed the allowance.
 */
export class AiQuota {
  constructor(
    private readonly access: AiAccess,
    private readonly store: AiUsageStore,
    private readonly limiter: RateLimiter,
    private readonly limits: AiLimits = DEFAULT_AI_LIMITS,
    private readonly rate: RateLimitPolicy = DEFAULT_AI_RATE,
    private readonly adminRate: RateLimitPolicy = DEFAULT_ADMIN_AI_RATE,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Reserves one use or throws: 403 `ai.vip_required` (no allowance), 429 `ai.quota_exceeded`, 429 `rate.limited`. */
  async reserve(userId: string, feature: AiFeature): Promise<AiTicket> {
    const result = await this.tryReserve(userId, feature);
    if ('ticket' in result) return result.ticket;
    throw this.refusal(feature, result);
  }

  /** The error for a refused reservation, for callers that first try a fallback. */
  refusal(feature: AiFeature, refused: Refused): DomainError {
    if (refused.refused === 'rate') {
      return DomainError.rateLimited('rate.limited', `Bạn dùng AI quá nhanh. Vui lòng thử lại sau ${waitText(refused.retryAfterMs)}.`, refused.retryAfterMs / 1000);
    }
    if (refused.refused === 'none') {
      return DomainError.forbidden('ai.vip_required', 'Tính năng AI này chỉ dành cho tài khoản giáo viên VIP. Hãy liên hệ quản trị viên để nâng cấp.');
    }
    const { resetsAt } = aiPeriod(this.clock());
    return DomainError.rateLimited(
      'ai.quota_exceeded',
      `Bạn đã dùng hết ${refused.limit} lượt ${FEATURE_NAMES[feature]} bằng AI của tháng này. Lượt mới có từ ngày ${resetDay(resetsAt)}; tài khoản VIP có nhiều lượt hơn.`,
      Math.max(1, (resetsAt.getTime() - this.clock().getTime()) / 1000),
      { feature, limit: String(refused.limit), resetsAt: resetsAt.toISOString() },
    );
  }

  /**
   * Reserves one use, or says why not (callers that fall back instead of refusing: import, the AI-usage check).
   * `rateLimit: false` for background work, which no user is waiting on.
   */
  async tryReserve(
    userId: string,
    feature: AiFeature,
    { rateLimit = true }: { rateLimit?: boolean } = {},
  ): Promise<{ ticket: AiTicket } | Refused> {
    const plan = await this.access.plan(userId);
    const limit = this.limits[plan][feature];
    if (limit === 0) return { refused: 'none', limit: 0, retryAfterMs: 0 };
    if (rateLimit) {
      const decision = await this.limiter.hit(`ai|user:${userId}`, plan === 'UNLIMITED' ? this.adminRate : this.rate);
      if (!decision.allowed) return { refused: 'rate', limit: limit ?? 0, retryAfterMs: decision.retryAfterMs };
    }
    const { period } = aiPeriod(this.clock());
    if (!(await this.store.reserve(userId, feature, period, limit))) return { refused: 'quota', limit: limit ?? 0, retryAfterMs: 0 };
    return { ticket: { userId, feature, period } };
  }

  /** The AI call failed: the use is given back. */
  async refund(ticket: AiTicket): Promise<void> {
    await this.store.release(ticket.userId, ticket.feature, ticket.period);
  }

  async usage(userId: string, aiAvailable: boolean): Promise<AiUsageDto> {
    const plan = await this.access.plan(userId);
    const { period, resetsAt } = aiPeriod(this.clock());
    const used = await this.store.used(userId, period);
    return {
      plan,
      period,
      resetsAt: resetsAt.toISOString(),
      aiAvailable,
      features: AiFeatures.map((feature) => ({ feature, limit: this.limits[plan][feature], used: used.get(feature) ?? 0 })),
    };
  }
}

const FEATURE_NAMES: Record<AiFeature, string> = {
  IMPORT: 'đọc đề',
  IMAGE_IMPORT: 'đọc đề từ ảnh chụp',
  SECTION: 'viết lại đề',
  TESTS: 'gợi ý test',
  AI_USAGE_CHECK: 'kiểm tra dùng AI',
};

/** "01/12/2026": the reset day in Vietnam time. */
function resetDay(resetsAt: Date): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(resetsAt);
}

/** Limits from the environment (`AI_LIMIT_FREE_TESTS=3`, `AI_LIMIT_PLUS_SECTION=unlimited`), defaults otherwise. */
export function aiLimitsFrom(get: (key: string) => string | undefined): AiLimits {
  const limits: AiLimits = structuredClone(DEFAULT_AI_LIMITS);
  for (const plan of ['FREE', 'PLUS'] as const) {
    for (const feature of AiFeatures) {
      const raw = get(`AI_LIMIT_${plan}_${feature}`)?.trim();
      if (!raw) continue;
      limits[plan][feature] = raw === 'unlimited' ? null : Number(raw);
    }
  }
  return limits;
}

/**
 * The per-minute guard from `AI_RATE_PER_MINUTE` (teachers) or `AI_ADMIN_RATE_PER_MINUTE` (administrators); empty or
 * missing means the default (an empty value is not 0).
 */
export function aiRateFrom(
  get: (key: string) => string | undefined,
  key: 'AI_RATE_PER_MINUTE' | 'AI_ADMIN_RATE_PER_MINUTE' = 'AI_RATE_PER_MINUTE',
): RateLimitPolicy {
  const fallback = key === 'AI_RATE_PER_MINUTE' ? DEFAULT_AI_RATE : DEFAULT_ADMIN_AI_RATE;
  const raw = get(key)?.trim();
  return { limit: raw ? Number(raw) : fallback.limit, windowMs: fallback.windowMs };
}

/** The environment variables `aiLimitsFrom` reads, for validation. */
export const AI_LIMIT_KEYS = (['FREE', 'PLUS'] as const).flatMap((plan) => AiFeatures.map((f) => `AI_LIMIT_${plan}_${f}`));
