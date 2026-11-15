import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import { aiLimitsFrom, aiPeriod, aiRateFrom, DEFAULT_ADMIN_AI_RATE, DEFAULT_AI_LIMITS, DEFAULT_AI_RATE, type AiLimits } from '../src/shared/application/ai-quota.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { checkEnvironment } from '../src/config/environment.js';
import { DisplayName, Email, User } from '../src/modules/identity/domain/user.js';
import { AiUsageController } from '../src/modules/identity/presentation/ai-usage.controller.js';
import { ImportService } from '../src/modules/importing/application/import.service.js';
import { IntegrityService } from '../src/modules/integrity/application/integrity.service.js';
import { quotaFor } from './support/ai-fakes.js';
import { skipLogKey } from '../src/modules/integrity/application/integrity.service.js';

/** OJ-21: monthly AI allowances. */

const codeOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const account = (address: string) => ({ email: Email.of(address), displayName: DisplayName.of('Lan'), phone: null, passwordHash: 'h' });

// ------------------------------------------------------------------ plans

test('plans: students none, regular teachers free, VIP or organization AI plus, administrators unlimited', () => {
  const teacher = User.acceptTeacherInvitation(account('gv@truong.edu.vn'));
  assert.equal(User.registerStudent(account('hs@truong.edu.vn')).aiPlan(), 'NONE');
  assert.equal(User.registerStudent(account('hs2@truong.edu.vn')).aiPlan(true), 'NONE', 'an organization never gives students AI');
  assert.equal(teacher.aiPlan(), 'FREE');
  assert.equal(teacher.aiPlan(true), 'PLUS', 'an active organization with AI');
  teacher.setVip(true);
  assert.equal(teacher.aiPlan(), 'PLUS');
  assert.equal(User.bootstrapAdmin(account('admin@truong.edu.vn')).aiPlan(), 'UNLIMITED');
});

test('full AI access (needed for the AI-usage check) stays PLUS and UNLIMITED only', async () => {
  const { quota: _q } = quotaFor();
  const { FakeAiAccess } = await import('./support/ai-fakes.js');
  const access = new FakeAiAccess({ s: 'NONE', f: 'FREE', p: 'PLUS', a: 'UNLIMITED' });
  assert.deepEqual(await Promise.all(['s', 'f', 'p', 'a'].map((id) => access.allows(id))), [false, false, true, true]);
});

// ------------------------------------------------------------------ allowances

test('a free teacher gets exactly the allowance; other features and other teachers are separate', async () => {
  const { quota } = quotaFor();
  for (let i = 0; i < 3; i++) assert.equal(await codeOf(quota.reserve('t1', 'TESTS')), 'ok');
  assert.equal(await codeOf(quota.reserve('t1', 'TESTS')), 'ai.quota_exceeded');
  assert.equal(await codeOf(quota.reserve('t1', 'SECTION')), 'ok', 'another feature');
  assert.equal(await codeOf(quota.reserve('t2', 'TESTS')), 'ok', 'another teacher');
});

test('parallel requests never exceed the allowance (20 at once against 3)', async () => {
  const { quota } = quotaFor();
  const results = await Promise.all(Array.from({ length: 20 }, () => codeOf(quota.reserve('t1', 'IMPORT'))));
  assert.equal(results.filter((r) => r === 'ok').length, 3);
});

test('a refund gives the use back, and never goes below zero', async () => {
  const { quota, store } = quotaFor();
  const ticket = await quota.reserve('t1', 'TESTS');
  await quota.refund(ticket);
  await quota.refund(ticket);
  assert.deepEqual([...store.counts.values()], [0]);
});

test('administrators have no monthly limit and a higher per-minute ceiling; students have no allowance at all', async () => {
  const { quota } = quotaFor({ admin: 'UNLIMITED', hs: 'NONE' }, { perMinute: 2, adminPerMinute: 50 });
  for (let i = 0; i < 50; i++) assert.equal(await codeOf(quota.reserve('admin', 'TESTS')), 'ok');
  assert.equal(await codeOf(quota.reserve('hs', 'SECTION')), 'ai.vip_required');
});

test('review: a stolen admin token cannot spend without bound, the admin per-minute ceiling still applies', async () => {
  let now = new Date('2026-11-13T03:00:00Z');
  const { quota } = quotaFor({ admin: 'UNLIMITED' }, { perMinute: 2, adminPerMinute: 5, clock: () => now });
  for (let i = 0; i < 5; i++) assert.equal(await codeOf(quota.reserve('admin', 'SECTION')), 'ok');
  assert.equal(await codeOf(quota.reserve('admin', 'SECTION')), 'rate.limited');
  now = new Date(now.getTime() + 61_000);
  assert.equal(await codeOf(quota.reserve('admin', 'SECTION')), 'ok', 'the next minute is open again');
  // Background work (the AI-usage check) is still exempt from the burst guard, as for teachers.
  const ran = await quota.tryReserve('admin', 'AI_USAGE_CHECK', { rateLimit: false });
  assert.ok('ticket' in ran);
});

test('the per-minute guard refuses a burst with rate.limited, before any monthly use is spent', async () => {
  let now = new Date('2026-11-13T03:00:00Z');
  const { quota, store } = quotaFor({ v: 'PLUS' }, { perMinute: 10, clock: () => now });
  for (let i = 0; i < 10; i++) await quota.reserve('v', 'SECTION');
  const burst = await quota.reserve('v', 'SECTION').then(() => null, (e: DomainError) => e);
  assert.equal(burst?.code, 'rate.limited');
  assert.ok(Number(burst?.details?.retryAfterSeconds) > 0);
  assert.equal([...store.counts.values()][0], 10, 'the refused request did not count');
  now = new Date(now.getTime() + 61_000);
  assert.equal(await codeOf(quota.reserve('v', 'SECTION')), 'ok', 'a minute later it works again');
});

test('the refusal says the limit and the reset date, and carries them for the interface', async () => {
  const now = new Date('2026-11-13T03:00:00Z');
  const { quota } = quotaFor({}, { clock: () => now });
  for (let i = 0; i < 3; i++) await quota.reserve('t1', 'TESTS');
  const e = await quota.reserve('t1', 'TESTS').then(() => null, (err: DomainError) => err);
  assert.equal(e?.kind, 'rate_limited');
  assert.deepEqual({ feature: e?.details?.feature, limit: e?.details?.limit, resetsAt: e?.details?.resetsAt },
    { feature: 'TESTS', limit: '3', resetsAt: '2026-11-30T17:00:00.000Z' });
  assert.match(e!.message, /hết 3 lượt gợi ý test bằng AI của tháng này\. Lượt mới có từ ngày 01\/12\/2026/);
});

// ------------------------------------------------------------------ months (Vietnam time)

test('allowances follow the month in Vietnam time and reset on the 1st', async () => {
  assert.deepEqual(aiPeriod(new Date('2026-11-30T16:59:59Z')), { period: '2026-11', resetsAt: new Date('2026-11-30T17:00:00Z') });
  assert.equal(aiPeriod(new Date('2026-11-30T17:00:00Z')).period, '2026-12', 'midnight in Hà Nội is already December');
  assert.deepEqual(aiPeriod(new Date('2026-12-31T18:00:00Z')), { period: '2027-01', resetsAt: new Date('2027-01-31T17:00:00Z') });

  let now = new Date('2026-11-30T16:00:00Z');
  const { quota } = quotaFor({}, { clock: () => now });
  for (let i = 0; i < 3; i++) await quota.reserve('t1', 'IMPORT');
  assert.equal(await codeOf(quota.reserve('t1', 'IMPORT')), 'ai.quota_exceeded');
  now = new Date('2026-11-30T17:00:01Z');
  assert.equal(await codeOf(quota.reserve('t1', 'IMPORT')), 'ok', 'a new month in Vietnam');
  const usage = await quota.usage('t1', true);
  assert.equal(usage.period, '2026-12');
  assert.deepEqual(usage.features.find((f) => f.feature === 'IMPORT'), { feature: 'IMPORT', limit: 3, used: 1 });
});

// ------------------------------------------------------------------ settings

test('limits come from the environment, "unlimited" included; bad values are refused at startup', () => {
  const limits = aiLimitsFrom((k) => ({ AI_LIMIT_FREE_TESTS: '5', AI_LIMIT_PLUS_SECTION: 'unlimited' } as Record<string, string>)[k]);
  assert.equal(limits.FREE.TESTS, 5);
  assert.equal(limits.PLUS.SECTION, null);
  assert.equal(limits.FREE.IMPORT, DEFAULT_AI_LIMITS.FREE.IMPORT);
  const base = { NODE_ENV: 'development', DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(40) };
  assert.ok(checkEnvironment({ ...base, AI_LIMIT_FREE_TESTS: '-1' }).errors.some((e) => e.includes('AI_LIMIT_FREE_TESTS')));
  assert.ok(checkEnvironment({ ...base, AI_RATE_PER_MINUTE: '0' }).errors.some((e) => e.includes('AI_RATE_PER_MINUTE')));
  assert.ok(checkEnvironment({ ...base, AI_ADMIN_RATE_PER_MINUTE: 'x' }).errors.some((e) => e.includes('AI_ADMIN_RATE_PER_MINUTE')));
  assert.equal(checkEnvironment({ ...base, AI_LIMIT_FREE_TESTS: '0', AI_LIMIT_PLUS_TESTS: 'unlimited' }).errors.filter((e) => e.startsWith('AI_')).length, 0);
});

test('setting the free limits to 0 restores the old behaviour: regular teachers have no AI', async () => {
  const zero: AiLimits = { ...DEFAULT_AI_LIMITS, FREE: { IMPORT: 0, IMAGE_IMPORT: 0, SECTION: 0, TESTS: 0, AI_USAGE_CHECK: 0 } };
  const { quota } = quotaFor({}, { limits: zero });
  assert.equal(await codeOf(quota.reserve('t1', 'TESTS')), 'ai.vip_required');
});

// ------------------------------------------------------------------ import

const teacher: Actor = { id: 't1', role: 'TEACHER', name: 'Lan' };
const pasted = 'Bài 1. TỔNG\nTính a + b.\nDữ liệu vào: a, b.\nKết quả: a + b.';

function importService(quota: ReturnType<typeof quotaFor>['quota'], smart: { available: boolean; read?: () => Promise<never[]> }) {
  return new ImportService({} as never, { read: async () => [], ...smart } as never, {} as never, quota);
}

test('import: AI readings count; at the limit the basic reader takes over with a note, never a refusal', async () => {
  const limits: AiLimits = { ...DEFAULT_AI_LIMITS, FREE: { ...DEFAULT_AI_LIMITS.FREE, IMPORT: 2 } };
  const { quota, store } = quotaFor({}, { limits });
  const s = importService(quota, { available: true });
  for (let i = 0; i < 2; i++) assert.equal((await s.parseText(teacher, pasted)).parser, 'AI');
  const third = await s.parseText(teacher, pasted);
  assert.equal(third.parser, 'BASIC');
  assert.equal(third.aiQuotaExhausted, true);
  assert.equal(third.drafts.length, 1, 'the basic reader still found the problem');
  assert.deepEqual([...store.counts.values()], [2]);
});

test('import: a failing AI reader gives its use back; without a key nothing is counted', async () => {
  const { quota, store } = quotaFor();
  const failing = importService(quota, { available: true, read: async () => { throw new Error('bad model output'); } });
  assert.equal((await failing.parseText(teacher, pasted)).parser, 'BASIC');
  const noKey = importService(quota, { available: false });
  const result = await noKey.parseText(teacher, pasted);
  assert.equal(result.parser, 'BASIC');
  assert.equal(result.aiQuotaExhausted, undefined, 'no key is not "used up"');
  assert.deepEqual([...store.counts.values()], [0]);
});

// ------------------------------------------------------------------ the AI-usage check (background)

function integrity(quota: ReturnType<typeof quotaFor>['quota'], reviews: { n: number; fail?: boolean; ids?: string[] }, saves: { fail?: boolean } = {}) {
  const checked = new Set<string>();
  const subs = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `sub-${i}`, userId: `hs${i}`, userDisplayName: 'HS', sessionId: 's1', problemKey: 'A', language: 'python', code: 'print(1)', verdict: 'AC', createdAt: new Date(),
    })),
    // hs0 again: a second accepted solution, a wrong answer, and an accepted solution of another problem.
    { id: 'sub-0b', userId: 'hs0', userDisplayName: 'HS', sessionId: 's1', problemKey: 'A', language: 'python', code: 'print(2)', verdict: 'AC', createdAt: new Date() },
    { id: 'sub-0w', userId: 'hs0', userDisplayName: 'HS', sessionId: 's1', problemKey: 'B', language: 'python', code: 'x', verdict: 'WA', createdAt: new Date() },
    { id: 'sub-0c', userId: 'hs0', userDisplayName: 'HS', sessionId: 's1', problemKey: 'C', language: 'python', code: 'y', verdict: 'AC', createdAt: new Date() },
    // hs3 again: a later accepted solution of problem A (OJ-28).
    { id: 'sub-3b', userId: 'hs3', userDisplayName: 'HS', sessionId: 's1', problemKey: 'A', language: 'python', code: 'print(3)', verdict: 'AC', createdAt: new Date() },
  ];
  const once = (k: string) => (checked.has(k) ? false : (checked.add(k), true));
  const flags = {
    markChecked: async (id: string, kind: string) => once(`${id}/${kind}`),
    claimFirstAiReview: async (s: string, p: string, u: string) => once(`${s}|${p}|${u}`),
    releaseFirstAiReview: async (s: string, p: string, u: string) => { checked.delete(`${s}|${p}|${u}`); },
    save: async () => { if (saves.fail) throw new Error('db down'); },
  };
  return new IntegrityService(
    flags as never,
    { get: async (id: string) => subs.find((s) => s.id === id) ?? null, ofProblem: async () => subs } as never,
    { checkInfo: async () => ({ ownerId: 'owner', checkPlagiarism: false, checkAiUsage: true, sessionTitle: 'S', problemTitle: 'A', statement: '' }) } as never,
    { available: true, review: async (input: { code: string }) => { reviews.n++; reviews.ids?.push(input.code); if (reviews.fail) throw new Error('down'); return { likely: false, confidence: 'LOW', reasons: [] }; } } as never,
    quota,
  );
}

test('AI-usage checks count against the session owner and pause at the limit, without failing', async () => {
  const limits: AiLimits = { ...DEFAULT_AI_LIMITS, PLUS: { ...DEFAULT_AI_LIMITS.PLUS, AI_USAGE_CHECK: 3 } };
  const { quota } = quotaFor({ owner: 'PLUS' }, { limits, perMinute: 1 });
  const reviews = { n: 0 };
  const s = integrity(quota, reviews);
  for (let i = 0; i < 5; i++) await s.check(`sub-${i}`);
  assert.equal(reviews.n, 3, 'three reviews, then paused (and the per-minute guard does not apply to background work)');
  await s.check('sub-0');
  assert.equal(reviews.n, 3, 'a submission already checked is not reviewed or counted again');
});

test('AI-usage checks: a free teacher has none; a failed review gives its use back', async () => {
  const free = { n: 0 };
  await integrity(quotaFor({ owner: 'FREE' }).quota, free).check('sub-0');
  assert.equal(free.n, 0);
  const { quota, store } = quotaFor({ owner: 'PLUS' });
  await assert.rejects(integrity(quota, { n: 0, fail: true }).check('sub-0'), /down/);
  assert.deepEqual([...store.counts.values()], [0]);
});

// ------------------------------------------------------------------ the usage endpoint

test('GET /ai/usage: own usage for teachers; another account only for administrators', async () => {
  const { quota } = quotaFor({ admin: 'UNLIMITED' });
  await quota.reserve('t1', 'SECTION');
  const controller = new AiUsageController(quota, { enabled: true });
  const mine = await controller.usage(teacher, {});
  assert.equal(mine.plan, 'FREE');
  assert.deepEqual(mine.features.find((f) => f.feature === 'SECTION'), { feature: 'SECTION', limit: 20, used: 1 });
  assert.equal(await codeOf(Promise.resolve().then(() => controller.usage(teacher, { userId: 'someone-else' }))), 'ai.usage_forbidden');
  const asAdmin = await controller.usage({ id: 'admin', role: 'ADMIN', name: 'A' }, { userId: 't1' });
  assert.equal(asAdmin.plan, 'FREE');
});

test('AI-usage checks: a submission checked twice (a redelivered event) is reviewed and counted once', async () => {
  const { quota, store } = quotaFor({ owner: 'PLUS' });
  const reviews = { n: 0 };
  const s = integrity(quota, reviews);
  await s.check('sub-0');
  await s.check('sub-0');
  assert.equal(reviews.n, 1);
  assert.deepEqual([...store.counts.values()], [1], 'the second run gave its reserved use back');
});

test('empty settings, as in .env.example, mean the defaults, never 0 (regression: an empty rate refused every request)', () => {
  const empty = (k: string) => (k.startsWith('AI_') ? '' : undefined);
  assert.deepEqual(aiRateFrom(empty), DEFAULT_AI_RATE);
  assert.deepEqual(aiRateFrom(empty, 'AI_ADMIN_RATE_PER_MINUTE'), DEFAULT_ADMIN_AI_RATE);
  assert.deepEqual(aiLimitsFrom(empty), DEFAULT_AI_LIMITS);
  assert.equal(aiRateFrom((k) => (k === 'AI_RATE_PER_MINUTE' ? ' 25 ' : undefined)).limit, 25);
});

test('review A: only a student\'s first accepted solution per problem is reviewed, so resubmitting cannot spend the allowance', async () => {
  const { quota, store } = quotaFor({ owner: 'PLUS' });
  const reviews = { n: 0 };
  const s = integrity(quota, reviews);
  for (const id of ['sub-0', 'sub-0b', 'sub-0w', 'sub-0c']) await s.check(id);
  assert.equal(reviews.n, 2, 'first AC of problem A and of problem C; not the second AC of A, not the WA');
  assert.deepEqual([...store.counts.values()], [2]);
});

test('review C: a rejudge or redelivery of a checked submission takes no use, even at the limit', async () => {
  const limits: AiLimits = { ...DEFAULT_AI_LIMITS, PLUS: { ...DEFAULT_AI_LIMITS.PLUS, AI_USAGE_CHECK: 1 } };
  const { quota, store } = quotaFor({ owner: 'PLUS' }, { limits });
  const reviews = { n: 0 };
  const s = integrity(quota, reviews);
  await s.check('sub-0');
  await s.check('sub-0');
  assert.deepEqual([...store.counts.values()], [1], 'the repeat never reached the allowance');
  await s.check('sub-1');
  assert.equal(reviews.n, 1, 'a new submission at the limit is skipped');
});

test('nit: a review that answered is not refunded when saving the flag fails afterwards', async () => {
  const { quota, store } = quotaFor({ owner: 'PLUS' });
  await assert.rejects(integrity(quota, { n: 0 }, { fail: true }).check('sub-0'), /db down/);
  assert.deepEqual([...store.counts.values()], [1], 'Claude was called and billed: the use stays spent');
});

test('review B: if the allowance cannot be checked (Redis down), import still works with the basic reader', async () => {
  const { quota } = quotaFor();
  const down = Object.assign(Object.create(Object.getPrototypeOf(quota)), quota, { tryReserve: async () => { throw new Error('redis down'); } });
  let aiCalled = false;
  const s = new ImportService({} as never, { available: true, read: async () => { aiCalled = true; return []; } } as never, {} as never, down);
  const result = await s.parseText(teacher, pasted);
  assert.equal(result.parser, 'BASIC');
  assert.equal(aiCalled, false, 'no AI without a counted use');
});

test('env numbers must be plain whole numbers (no 1e2, +5 or 0x10)', () => {
  const base = { NODE_ENV: 'development', DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(40) };
  for (const bad of ['1e2', '+5', '0x10', '2.5']) {
    assert.ok(checkEnvironment({ ...base, AI_LIMIT_FREE_TESTS: bad }).errors.some((e) => e.includes('AI_LIMIT_FREE_TESTS')), bad);
  }
});

test('OJ-26: skipped AI checks are logged per allowance month (Vietnam time), not per UTC month', () => {
  // 18:00 UTC on 30 November is 1 December in Vietnam: a new allowance month, so a new log line.
  const lastNovember = skipLogKey('t1', 'quota', new Date('2026-11-30T16:59:00Z'));
  const firstDecember = skipLogKey('t1', 'quota', new Date('2026-11-30T18:00:00Z'));
  assert.equal(lastNovember, 't1|quota|2026-11');
  assert.equal(firstDecember, 't1|quota|2026-12');
});

test('OJ-28 (R11): when the allowance refuses or the AI call fails, the claim is given back and a later AC is reviewed', async () => {
  // Refused: the month's allowance is used up when hs3's first AC arrives; next month their next AC is reviewed.
  let now = new Date('2026-11-20T03:00:00Z');
  const limits: AiLimits = { ...DEFAULT_AI_LIMITS, PLUS: { ...DEFAULT_AI_LIMITS.PLUS, AI_USAGE_CHECK: 3 } };
  const { quota } = quotaFor({ owner: 'PLUS' }, { limits, clock: () => now });
  const reviews = { n: 0, ids: [] as string[] };
  const s = integrity(quota, reviews);
  for (let i = 0; i < 4; i++) await s.check(`sub-${i}`);
  assert.equal(reviews.n, 3, 'hs3 was refused: no allowance left this month');
  now = new Date('2026-12-02T03:00:00Z');
  await s.check('sub-3b');
  assert.equal(reviews.n, 4, 'next month, hs3’s next accepted solution of problem A is reviewed');
  assert.equal(reviews.ids.at(-1), 'print(3)');

  // Failed: the AI call throws; the use is refunded and the claim released, so a later AC is reviewed.
  const failing = { n: 0, fail: true };
  const second = quotaFor({ owner: 'PLUS' });
  const t = integrity(second.quota, failing);
  await assert.rejects(t.check('sub-3'), /down/);
  failing.fail = false;
  await t.check('sub-3b');
  assert.equal(failing.n, 2, 'reviewed again after the failure');
  assert.deepEqual([...second.store.counts.values()], [1], 'only the successful review was counted');
});

