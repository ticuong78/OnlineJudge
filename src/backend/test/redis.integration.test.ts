import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { Redis } from 'ioredis';
import { RedisRateLimiter } from '../src/shared/infrastructure/redis-rate-limiter.js';
import { RedisRecentSignIns } from '../src/modules/identity/infrastructure/redis-recent-sign-ins.js';
import { rateLimiterContract } from './support/rate-limiter-contract.js';
import { recentSignInsContract } from './support/recent-sign-ins-contract.js';
import { trialStoreContract } from './support/trial-store-contract.js';
import { RedisTrialStore } from '../src/modules/judging/infrastructure/redis-trial-store.js';
import { throwaway } from './support/throwaway.js';

/**
 * The Redis-backed limiter and sign-in memory against a real Redis. Keys get a random prefix and only those are
 * deleted afterwards. Runs on the throwaway stack (see test/support/throwaway.ts): the flood test writes many keys.
 *   pnpm infra:test:up   then   pnpm test:integration
 */
const { url, skip } = throwaway('TEST_REDIS_URL');

describe('Redis', { skip }, () => {
  const prefix = `oj-test-${randomBytes(4).toString('hex')}:`;
  let redis: Redis;

  before(() => {
    redis = new Redis(url!, { lazyConnect: false, maxRetriesPerRequest: 1 });
  });

  after(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000);
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    await redis.quit();
  });

  const limiterAt = () => {
    const clock = { now: Date.now() };
    return { clock, limiter: new RedisRateLimiter(redis, () => clock.now, `${prefix}rl:`) };
  };

  rateLimiterContract('Redis limiter', limiterAt);
  recentSignInsContract('Redis sign-in memory', () => {
    const clock = { now: Date.now() };
    return { clock, signIns: new RedisRecentSignIns(redis, () => clock.now, `${prefix}si:`) };
  });

  trialStoreContract('Redis trial store', () => new RedisTrialStore(redis, `${prefix}trial:`));

  test('trial runs expire on their own (OJ-18)', async () => {
    const store = new RedisTrialStore(redis, `${prefix}trial:`);
    const id = randomBytes(8).toString('hex');
    await store.create({ id, userId: 'u', sessionId: 's', problemKey: 'A', language: 'python', createdAt: '', samples: [] });
    await store.markStarted(id);
    // The started mark copies the record's remaining time, read a moment before the record's own is read here.
    const startedTtl = await redis.pttl(`${prefix}trial:${id}:started`);
    const ttl = await redis.pttl(`${prefix}trial:${id}`);
    assert.ok(ttl > 14 * 60_000 && ttl <= 15 * 60_000, `record ttl ${ttl}`);
    assert.ok(startedTtl > 0 && startedTtl <= ttl + 50, 'the started mark expires with the record');
    assert.equal(await store.claimSlot('u', id), true);
    const slotTtl = await redis.pttl(`${prefix}trial:slot:u`);
    assert.ok(slotTtl > 0 && slotTtl <= 90_000, `slot ttl ${slotTtl}`);
  });

  test('flooding the limiter with other keys does not wipe a live counter (R2-F1)', async () => {
    const { limiter } = limiterAt();
    const policy = { limit: 3, windowMs: 60 * 60_000 };
    for (let i = 0; i < 3; i++) await limiter.hit('login|acct:victim', policy);

    for (let batch = 0; batch < 60; batch++) {
      await Promise.all(Array.from({ length: 1000 }, (_, i) => limiter.hit(`flood:${batch}:${i}`, policy)));
    }
    assert.equal((await limiter.hit('login|acct:victim', policy)).allowed, false, 'still blocked after 60,000 other keys');
  });

  test('keys expire on their own when their window is over', async () => {
    const { limiter } = limiterAt();
    await limiter.hit('short', { limit: 1, windowMs: 1000 });
    const ttl = await redis.pttl(`${prefix}rl:short`);
    assert.ok(ttl > 0 && ttl <= 1000, `ttl ${ttl}`);
  });
});
