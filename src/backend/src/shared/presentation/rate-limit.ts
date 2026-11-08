import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiter, waitText, type RateLimitPolicy } from '../application/rate-limiter.js';
import { DomainError } from '../domain/domain-error.js';
import { clientAddress } from './client-address.js';

export const RATE_LIMIT = 'oj:rateLimit';

export interface RouteRateLimit {
  /** Names the limit; also namespaces its keys. */
  name: string;
  /** How often one client IP may call the route. */
  perIp: RateLimitPolicy;
  /**
   * Optionally also limit what the call is about (the verification being guessed, the mailbox being written to),
   * read from the not yet validated request. Calls without such an identifier are only limited per IP.
   */
  perTarget?: { policy: RateLimitPolicy; of: (req: RequestLike) => string | undefined };
}

/** The slice of the HTTP request the guard looks at. */
export interface RequestLike {
  ip?: string;
  body?: unknown;
}

/** Limits how often a client may call this (public) route. Not for routes that already need a login. */
export const RateLimit = (spec: RouteRateLimit) => SetMetadata(RATE_LIMIT, spec);

/** Reads a string field of the (not yet validated) JSON body. */
export function bodyField(req: RequestLike, field: string): string | undefined {
  const value = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'string' && value.length <= 320 ? value.trim().toLowerCase() : undefined;
}

/**
 * Global guard that applies `@RateLimit()`. A request over any of its limits is answered with 429 and
 * `Retry-After` before anything expensive (password hashing, email) happens.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<RouteRateLimit | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    if (!spec) return true;

    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const checks: [string, RateLimitPolicy][] = [[`${spec.name}|ip:${clientAddress(req.ip)}`, spec.perIp]];
    const target = spec.perTarget?.of(req);
    if (spec.perTarget && target) checks.push([`${spec.name}|target:${target}`, spec.perTarget.policy]);

    // A refused call must cost nothing: stop at the first refusal and give back what this call was already
    // charged. Otherwise a client blocked by its own IP limit could keep using up a victim's per-target budget.
    const charged: string[] = [];
    for (const [key, policy] of checks) {
      const decision = await this.limiter.hit(key, policy);
      if (!decision.allowed) {
        for (const done of charged) await this.limiter.refund(done);
        const wait = decision.retryAfterMs;
        throw DomainError.rateLimited('rate.limited', `Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${waitText(wait)}.`, wait / 1000);
      }
      charged.push(key);
    }
    return true;
  }
}
