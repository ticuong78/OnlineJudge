import type { AiFeature, AiPlan } from '@oj/contracts';
import { AiAccess } from '../../src/shared/application/ai-access.js';
import { AiQuota, AiUsageStore, DEFAULT_AI_LIMITS, type AiLimits } from '../../src/shared/application/ai-quota.js';
import { InMemoryRateLimiter } from '../../src/shared/infrastructure/memory-rate-limiter.js';

/** Plans by user id; anyone else is a regular teacher (FREE). */
export class FakeAiAccess extends AiAccess {
  constructor(readonly plans: Record<string, AiPlan> = {}) {
    super();
  }
  async plan(userId: string): Promise<AiPlan> {
    return this.plans[userId] ?? 'FREE';
  }
}

/** Like the Postgres store: `reserve` is one step that never goes past the limit. */
export class MemoryAiUsageStore extends AiUsageStore {
  readonly counts = new Map<string, number>();
  private key = (u: string, f: AiFeature, p: string) => `${u}|${f}|${p}`;
  async reserve(userId: string, feature: AiFeature, period: string, limit: number | null) {
    const k = this.key(userId, feature, period);
    const used = this.counts.get(k) ?? 0;
    if (limit !== null && used >= limit) return false;
    this.counts.set(k, used + 1);
    return true;
  }
  async release(userId: string, feature: AiFeature, period: string) {
    const k = this.key(userId, feature, period);
    this.counts.set(k, Math.max(0, (this.counts.get(k) ?? 0) - 1));
  }
  async used(userId: string, period: string) {
    const result = new Map<AiFeature, number>();
    for (const [k, n] of this.counts) {
      const [u, f, p] = k.split('|');
      if (u === userId && p === period) result.set(f as AiFeature, n);
    }
    return result;
  }
}

export function quotaFor(
  plans: Record<string, AiPlan> = {},
  {
    limits = DEFAULT_AI_LIMITS,
    clock = () => new Date(),
    perMinute = 1000,
    adminPerMinute = 1000,
  }: { limits?: AiLimits; clock?: () => Date; perMinute?: number; adminPerMinute?: number } = {},
) {
  const store = new MemoryAiUsageStore();
  const limiter = new InMemoryRateLimiter(() => clock().getTime());
  const quota = new AiQuota(new FakeAiAccess(plans), store, limiter, limits, { limit: perMinute, windowMs: 60_000 }, { limit: adminPerMinute, windowMs: 60_000 }, clock);
  return { quota, store, limiter };
}
