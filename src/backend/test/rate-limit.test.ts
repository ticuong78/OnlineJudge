import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { waitText } from '../src/shared/application/rate-limiter.js';
import { InMemoryRateLimiter } from '../src/shared/infrastructure/memory-rate-limiter.js';
import { rateLimiterContract } from './support/rate-limiter-contract.js';
import { clientAddress } from '../src/shared/presentation/client-address.js';
import { bodyField, RateLimit, RateLimitGuard } from '../src/shared/presentation/rate-limit.js';

const MIN = 60_000;
const policy = { limit: 3, windowMs: 10 * MIN };

function limiter(start = 1_000_000) {
  const clock = { now: start };
  return { clock, limiter: new InMemoryRateLimiter(() => clock.now) };
}

// ---------------------------------------------------------------- the limiter

rateLimiterContract('in-memory limiter', () => limiter());

test('a sliding window: the limit applies to the last windowMs, and old hits expire one by one', async () => {
  const { clock, limiter: l } = limiter();
  assert.deepEqual(await l.hit('k', policy), { allowed: true, remaining: 2, retryAfterMs: 0 });
  clock.now += 4 * MIN;
  await l.hit('k', policy);
  clock.now += 4 * MIN;
  assert.equal((await l.hit('k', policy)).remaining, 0);

  const blocked = await l.hit('k', policy);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 2 * MIN, 'the oldest hit leaves the window in 2 minutes');

  clock.now += 2 * MIN; // the first hit expired, the other two are still counted
  assert.equal((await l.hit('k', policy)).allowed, true);
  assert.equal((await l.hit('k', policy)).allowed, false);
});

test('a refused hit is not recorded, so retrying does not extend the block', async () => {
  const { clock, limiter: l } = limiter();
  for (let i = 0; i < 3; i++) await l.hit('k', policy);
  for (let i = 0; i < 50; i++) assert.equal((await l.hit('k', policy)).allowed, false);
  clock.now += 10 * MIN + 1;
  assert.equal((await l.hit('k', policy)).allowed, true);
});

test('keys are independent, and refund/reset give attempts back', async () => {
  const { limiter: l } = limiter();
  for (let i = 0; i < 3; i++) await l.hit('a', policy);
  assert.equal((await l.hit('a', policy)).allowed, false);
  assert.equal((await l.hit('b', policy)).allowed, true);

  await l.refund('a');
  assert.equal((await l.hit('a', policy)).allowed, true, 'one attempt was given back');
  assert.equal((await l.hit('a', policy)).allowed, false);
  await l.reset('a');
  assert.equal((await l.hit('a', policy)).remaining, 2);
  await l.refund('never-seen'); // harmless
});

test('memory stays bounded: the table has a size cap and idle keys are swept', async () => {
  const clock = { now: 0 };
  const capped = new InMemoryRateLimiter(() => clock.now, 100);
  for (let i = 0; i < 1000; i++) await capped.hit(`ip:${i}`, policy);
  assert.ok(capped.size <= 100, `size ${capped.size}`);

  const swept = new InMemoryRateLimiter(() => clock.now);
  for (let i = 0; i < 500; i++) await swept.hit(`old:${i}`, policy);
  clock.now += 11 * MIN; // everything above has expired
  for (let i = 0; i < 1000; i++) await swept.hit('busy', policy);
  assert.ok(swept.size < 10, `idle keys were not swept: ${swept.size}`);
});

test('the wait is told in friendly units', () => {
  assert.equal(waitText(1), '1 giây');
  assert.equal(waitText(45_000), '45 giây');
  assert.equal(waitText(61_000), '2 phút');
  assert.equal(waitText(10 * MIN), '10 phút');
});

// ---------------------------------------------------------------- the route guard

class Routes {
  @RateLimit({ name: 'verify', perIp: { limit: 4, windowMs: MIN }, perTarget: { policy: { limit: 2, windowMs: MIN }, of: (req) => bodyField(req, 'verificationId') } })
  verify() {}
  @RateLimit({ name: 'preview', perIp: { limit: 1, windowMs: MIN } })
  preview() {}
  open() {}
}

function contextFor(handler: () => void, req: { ip?: string; body?: unknown }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const call = (guard: RateLimitGuard, handler: () => void, req: { ip?: string; body?: unknown }) =>
  guard.canActivate(contextFor(handler, req)).then(() => 'ok', (e: DomainError) => e);

test('routes without @RateLimit are untouched', async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  for (let i = 0; i < 100; i++) assert.equal(await call(guard, routes.open, { ip: '1.1.1.1' }), 'ok');
});

test('a route is limited per IP; over the limit answers 429 with a wait time', async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  assert.equal(await call(guard, routes.preview, { ip: '1.1.1.1' }), 'ok');
  const refused = await call(guard, routes.preview, { ip: '1.1.1.1' });
  assert.ok(refused instanceof DomainError);
  assert.equal(refused.kind, 'rate_limited');
  assert.equal(refused.code, 'rate.limited');
  assert.equal(refused.details?.retryAfterSeconds, '60');
  assert.match(refused.message, /thử lại sau 1 phút/);
  assert.equal(await call(guard, routes.preview, { ip: '2.2.2.2' }), 'ok', 'another client is not affected');
});

test('what a call is about is limited across IPs (a guesser cannot spread over addresses)', async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  const body = { verificationId: 'ABC-123' };
  assert.equal(await call(guard, routes.verify, { ip: '1.1.1.1', body }), 'ok');
  assert.equal(await call(guard, routes.verify, { ip: '2.2.2.2', body: { verificationId: 'abc-123 ' } }), 'ok', 'case and spaces do not make a new target');
  const third = await call(guard, routes.verify, { ip: '3.3.3.3', body });
  assert.ok(third instanceof DomainError && third.kind === 'rate_limited');
  assert.equal(await call(guard, routes.verify, { ip: '3.3.3.3', body: { verificationId: 'another' } }), 'ok');
});

test("a client blocked by its IP limit cannot use up a victim's per-target budget", async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  for (let i = 0; i < 4; i++) assert.equal(await call(guard, routes.verify, { ip: '6.6.6.6', body: { verificationId: `own-${i}` } }), 'ok');

  for (let i = 0; i < 5; i++) {
    const refused = await call(guard, routes.verify, { ip: '6.6.6.6', body: { verificationId: 'victim' } });
    assert.ok(refused instanceof DomainError && refused.kind === 'rate_limited');
  }
  const victim = { verificationId: 'victim' };
  assert.equal(await call(guard, routes.verify, { ip: '1.1.1.1', body: victim }), 'ok', "the refused calls were not charged to the victim's target");
  assert.equal(await call(guard, routes.verify, { ip: '1.1.1.1', body: victim }), 'ok');
});

test('a call refused for its target does not cost the caller IP budget either', async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  for (const ip of ['2.2.2.2', '3.3.3.3']) assert.equal(await call(guard, routes.verify, { ip, body: { verificationId: 'busy' } }), 'ok');
  for (let i = 0; i < 3; i++) assert.ok((await call(guard, routes.verify, { ip: '1.1.1.1', body: { verificationId: 'busy' } })) instanceof DomainError);
  for (let i = 0; i < 4; i++) assert.equal(await call(guard, routes.verify, { ip: '1.1.1.1', body: { verificationId: `other-${i}` } }), 'ok', 'all 4 of its own calls are still there');
});

test('missing or odd bodies are only limited per IP and never crash the guard', async () => {
  const guard = new RateLimitGuard(new Reflector(), limiter().limiter);
  const routes = new Routes();
  for (const body of [undefined, null, 'text', 42, { verificationId: 7 }, { verificationId: 'x'.repeat(5000) }]) {
    assert.equal(await call(guard, routes.verify, { ip: `9.9.9.${Math.floor(Math.random() * 200)}`, body }), 'ok');
  }
  assert.equal(await call(guard, routes.preview, {}), 'ok', 'an unknown address still counts, under a shared key');
});

// ---------------------------------------------------------------- client addresses

test('anything that is not an IP address is one shared "unknown" client, so a forged header cannot pick a key (R2-F7)', () => {
  for (const forged of ['victim-ip', '203.0.113.7, 10.0.0.1', '', '1.2.3', 'login|acct:x@y']) assert.equal(clientAddress(forged), 'unknown', forged);
  assert.equal(clientAddress(undefined), 'unknown');
});

test('IPv4 clients are keyed by their address, IPv4-mapped IPv6 included', () => {
  assert.equal(clientAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress('::ffff:cb00:7107'), '203.0.113.7', 'the same mapped address written in hex');
  assert.equal(clientAddress('0:0:0:0:0:ffff:203.0.113.7'), '203.0.113.7');
});

test('IPv6 clients are keyed by their /64, so rotating addresses inside it limits nothing', () => {
  const key = clientAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
  assert.equal(key, '2001:db8:1:2::/64');
  assert.equal(clientAddress('2001:db8:1:2::1'), key);
  assert.equal(clientAddress('2001:0DB8:0001:0002:0:0:0:ffff'), key, 'case and leading zeros do not matter');
  assert.equal(clientAddress('2001:db8:1:2:1234:5678:9abc:def0%eth0'), key, 'a zone id is dropped');
  assert.notEqual(clientAddress('2001:db8:1:3::1'), key, 'a different /64 is a different client');
  assert.equal(clientAddress('::1'), '0:0:0:0::/64');
  assert.equal(clientAddress('fe80::1'), 'fe80:0:0:0::/64');
  assert.equal(clientAddress('2001:db8::'), '2001:db8:0:0::/64');
});

test('odd input never throws', () => {
  assert.equal(clientAddress(undefined), 'unknown');
  assert.equal(clientAddress(''), 'unknown');
  assert.equal(clientAddress('not-an-ip'), 'unknown');
  assert.equal(clientAddress('1:2:3'), 'unknown');
});
