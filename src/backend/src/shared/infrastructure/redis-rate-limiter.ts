import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { RateLimiter, type RateLimitDecision, type RateLimitPolicy } from '../application/rate-limiter.js';

/**
 * Sliding window per key: a sorted set of hit timestamps. Prune, count, then record only when under the limit,
 * all inside one script, so concurrent requests (and several backend instances) cannot slip past it.
 * Returns { allowed (1/0), remaining, retryAfterMs }.
 */
const HIT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local wait = tonumber(oldest[2]) + window - now
  if wait < 1 then wait = 1 end
  return {0, 0, wait}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {1, limit - count - 1, 0}
`;

/**
 * Rate limits kept in Redis (the instance BullMQ already uses).
 *
 * Unlike the in-memory table, keys are never evicted to make room: each expires on its own when its window is
 * over. So nobody can wipe a victim's counter by flooding the limiter with other keys, and limits survive a
 * restart and hold across backend instances. If Redis cannot be reached the call fails (and the request with
 * it) rather than letting attempts through uncounted.
 */
export class RedisRateLimiter extends RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now,
    private readonly prefix = 'oj:rl:',
  ) {
    super();
  }

  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const member = `${this.now()}-${randomBytes(6).toString('hex')}`;
    const [allowed, remaining, retryAfterMs] = (await this.redis.eval(
      HIT, 1, this.prefix + key, this.now(), policy.windowMs, policy.limit, member,
    )) as [number, number, number];
    return { allowed: allowed === 1, remaining, retryAfterMs };
  }

  async refund(key: string): Promise<void> {
    await this.redis.zpopmax(this.prefix + key);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
