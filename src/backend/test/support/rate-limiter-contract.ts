import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RateLimiter } from '../../src/shared/application/rate-limiter.js';

const MIN = 60_000;
const policy = { limit: 3, windowMs: 10 * MIN };

/** A limiter plus the clock it reads, so the window can be moved forward. */
export interface LimiterUnderTest {
  limiter: RateLimiter;
  clock: { now: number };
}

/**
 * What every RateLimiter must do, run against each implementation (in memory always; Redis when available), so
 * swapping one for the other cannot change the limits.
 */
export function rateLimiterContract(name: string, make: () => Promise<LimiterUnderTest> | LimiterUnderTest) {
  const key = () => `contract:${Math.random().toString(36).slice(2)}`;

  test(`${name}: allows the limit, then refuses with the wait until the oldest hit leaves the window`, async () => {
    const { limiter, clock } = await make();
    const k = key();
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(await limiter.hit(k, policy), { allowed: true, remaining: 2 - i, retryAfterMs: 0 });
      clock.now += MIN;
    }
    const refused = await limiter.hit(k, policy);
    assert.equal(refused.allowed, false);
    assert.equal(refused.retryAfterMs, 7 * MIN);
    clock.now += 7 * MIN;
    assert.equal((await limiter.hit(k, policy)).allowed, true, 'the oldest hit left the window');
  });

  test(`${name}: a refused hit is not recorded, so retrying does not extend the block`, async () => {
    const { limiter, clock } = await make();
    const k = key();
    for (let i = 0; i < 3; i++) await limiter.hit(k, policy);
    for (let i = 0; i < 10; i++) assert.equal((await limiter.hit(k, policy)).allowed, false);
    clock.now += 10 * MIN + 1;
    assert.equal((await limiter.hit(k, policy)).allowed, true);
  });

  test(`${name}: keys are independent; refund gives one attempt back and reset all of them`, async () => {
    const { limiter } = await make();
    const [a, b] = [key(), key()];
    for (let i = 0; i < 3; i++) await limiter.hit(a, policy);
    assert.equal((await limiter.hit(b, policy)).allowed, true);
    await limiter.refund(a);
    assert.equal((await limiter.hit(a, policy)).allowed, true);
    assert.equal((await limiter.hit(a, policy)).allowed, false);
    await limiter.reset(a);
    for (let i = 0; i < 3; i++) assert.equal((await limiter.hit(a, policy)).allowed, true);
  });

  test(`${name}: parallel hits on one key are admitted exactly up to the limit`, async () => {
    const { limiter } = await make();
    const k = key();
    const results = await Promise.all(Array.from({ length: 40 }, () => limiter.hit(k, policy)));
    assert.equal(results.filter((r) => r.allowed).length, 3);
  });
}
