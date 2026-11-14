import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Redis } from 'ioredis';
import { RateLimiter } from '../src/shared/application/rate-limiter.js';
import { RedisRateLimiter } from '../src/shared/infrastructure/redis-rate-limiter.js';
import { SharedModule } from '../src/shared/shared.module.js';
import { RecentSignIns } from '../src/modules/identity/application/recent-sign-ins.js';
import { IdentityModule } from '../src/modules/identity/identity.module.js';
import { RedisRecentSignIns } from '../src/modules/identity/infrastructure/redis-recent-sign-ins.js';

type FactoryProvider = { provide: unknown; useFactory: (...deps: unknown[]) => unknown };

function built(module: object, token: unknown) {
  const providers = Reflect.getMetadata('providers', module) as FactoryProvider[];
  const provider = providers.find((p) => p.provide === token);
  assert.ok(provider, 'provider is registered');
  return provider.useFactory({} as Redis);
}

test('the running app keeps rate limits in Redis, not in a process-local table that can be flooded (R2-F1)', () => {
  assert.ok(built(SharedModule, RateLimiter) instanceof RedisRateLimiter);
});

test('the running app keeps recent sign-ins in Redis, so exemptions survive restarts (R2-F2)', () => {
  assert.ok(built(IdentityModule, RecentSignIns) instanceof RedisRecentSignIns);
});

test('the running app keeps trial runs in Redis with an expiry, never in the database (OJ-18)', async () => {
  const { JudgingModule } = await import('../src/modules/judging/judging.module.js');
  const { TrialStore } = await import('../src/modules/judging/application/trial-store.js');
  const { RedisTrialStore } = await import('../src/modules/judging/infrastructure/redis-trial-store.js');
  assert.ok(built(JudgingModule, TrialStore) instanceof RedisTrialStore);
});
