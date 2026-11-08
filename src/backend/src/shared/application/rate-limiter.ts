/** At most `limit` hits per `windowMs` (sliding window). */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Hits still available in the current window (0 when blocked). */
  remaining: number;
  /** When blocked: how long until a hit is accepted again. */
  retryAfterMs: number;
}

/** "30 giây" / "5 phút": how long a blocked client is asked to wait. */
export function waitText(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds} giây` : `${Math.ceil(seconds / 60)} phút`;
}

/**
 * Port: counts attempts per key.
 *
 * Callers must `hit` BEFORE doing the guarded work and `refund`/`reset` afterwards when the attempt turned
 * out fine. Counting first (rather than check, work, then record) is what keeps the limit true when many
 * requests arrive at once: every one of them has to pass through `hit`.
 */
export abstract class RateLimiter {
  /**
   * Records one attempt. An attempt over the limit is refused and NOT recorded, so a blocked client
   * cannot extend its own block by retrying.
   */
  abstract hit(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
  /** Gives back the most recent attempt of this key (e.g. a login that succeeded). */
  abstract refund(key: string): Promise<void>;
  /** Forgets every attempt of this key. */
  abstract reset(key: string): Promise<void>;
}
