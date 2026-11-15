import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JudgeJob, JudgeResultMessage } from '@oj/contracts';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { JudgeWatchdog, LOST_RESULT_MESSAGE } from '../src/modules/judging/application/judge-watchdog.js';
import { JudgingService, studentView } from '../src/modules/judging/application/judging.service.js';
import {
  JudgeQueue,
  SessionGateway,
  type QueuedRun,
  type ResultVisibility,
  type SubmissionTarget,
} from '../src/modules/judging/application/ports.js';
import { FREE_PROGRAM_ERRORS, SourceCode, Submission } from '../src/modules/judging/domain/submission.js';
import {
  SubmissionQueries,
  SubmissionRepository,
  type Admission,
  type AdmissionLimits,
  type StaleCursor,
} from '../src/modules/judging/domain/submission.repository.js';
import { RecordingEvents, sleep } from './support/identity-fakes.js';

const MIN = 60_000;

// ------------------------------------------------------------------ fakes

const copy = (s: Submission) => Submission.rehydrate(s.id, { ...s.snapshot, testResults: [...s.snapshot.testResults] });

/** Like Postgres: reads return copies; `admit`, `failIfUnfinished` are single atomic steps. */
class MemorySubmissions extends SubmissionRepository {
  readonly rows = new Map<string, Submission>();

  async findById(id: string) { await sleep(1); const s = this.rows.get(id); return s ? copy(s) : null; }
  async save(s: Submission) { await sleep(1); this.rows.set(s.id, copy(s)); }
  async findBySession(sessionId: string, key: string | null) {
    return [...this.rows.values()].filter((s) => s.snapshot.sessionId === sessionId && (!key || s.snapshot.problemKey === key)).map(copy);
  }
  async admit(s: Submission, limits: AdmissionLimits): Promise<Admission> {
    await sleep(1);
    const mine = [...this.rows.values()].filter((x) => x.snapshot.userId === s.snapshot.userId);
    if (mine.filter((x) => x.snapshot.status !== 'DONE').length >= limits.maxPending) return 'TOO_MANY_PENDING';
    if (limits.maxForProblem !== null) {
      const here = mine.filter((x) => x.snapshot.sessionId === s.snapshot.sessionId && x.snapshot.problemKey === s.snapshot.problemKey);
      const programErrors = here.filter((x) => x.snapshot.verdict === 'IE' && x.snapshot.faultSource === 'program');
      const attempts = here.filter((x) => x.snapshot.verdict !== 'IE').length + Math.max(0, programErrors.length - FREE_PROGRAM_ERRORS);
      if (attempts >= limits.maxForProblem) return 'PROBLEM_LIMIT_REACHED';
    }
    this.rows.set(s.id, copy(s));
    return 'ADMITTED';
  }
  async findStale(before: Date, limit: number, after?: StaleCursor) {
    await sleep(1);
    const key = (s: Submission) => [s.snapshot.queuedAt.getTime(), s.id] as const;
    const later = (s: Submission) => !after || key(s)[0] > after.queuedAt.getTime() || (key(s)[0] === after.queuedAt.getTime() && s.id > after.id);
    return [...this.rows.values()]
      .filter((s) => s.snapshot.status !== 'DONE' && s.snapshot.queuedAt < before && later(s))
      .sort((a, b) => key(a)[0] - key(b)[0] || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(copy);
  }
  async failIfUnfinished(id: string, judgeRun: number, reason: string, now = new Date()) {
    await sleep(1);
    const s = this.rows.get(id);
    if (!s || s.snapshot.judgeRun !== judgeRun || s.snapshot.status === 'DONE') return false;
    const failed = copy(s);
    failed.complete('IE', [], reason, 'infrastructure');
    failed.pullEvents(); // a system error is not an event for the scoreboard
    this.rows.set(id, Submission.rehydrate(id, { ...failed.snapshot, judgedAt: now }));
    return true;
  }
  // Same contract as the TypeORM version: conditional on the run (and status), so stale copies change nothing.
  async markJudging(id: string, judgeRun: number) {
    await sleep(1);
    const s = this.rows.get(id);
    if (!s || s.snapshot.judgeRun !== judgeRun || s.snapshot.status !== 'PENDING') return false;
    this.rows.set(id, Submission.rehydrate(id, { ...s.snapshot, status: 'JUDGING' }));
    return true;
  }
  async requeue(next: Submission, fromRun: number) {
    await sleep(1);
    const s = this.rows.get(next.id);
    if (!s || s.snapshot.judgeRun !== fromRun) return false;
    this.rows.set(next.id, copy(next));
    return true;
  }
  async storeResult(done: Submission) {
    await sleep(1);
    const s = this.rows.get(done.id);
    if (!s || s.snapshot.judgeRun !== done.snapshot.judgeRun || s.snapshot.status === 'DONE') return false;
    const d = done.snapshot;
    this.rows.set(done.id, Submission.rehydrate(done.id, {
      ...s.snapshot,
      status: d.status, verdict: d.verdict, score: d.score, compileOutput: d.compileOutput,
      faultSource: d.faultSource, testResults: d.testResults, judgedAt: d.judgedAt,
    }));
    return true;
  }
}

class FakeQueue extends JudgeQueue {
  readonly jobs: JudgeJob[] = [];
  /** Jobs still in the queue, by `submissionId-judgeRun`: waiting, or taken by an engine. */
  live = new Map<string, QueuedRun>();
  readonly discarded: string[] = [];
  rejectEnqueue = false;
  down = false;
  onInspect?: () => Promise<void>;

  async enqueue(job: JudgeJob) {
    if (this.rejectEnqueue) throw new Error('redis is down');
    this.jobs.push(job);
    this.live.set(`${job.submissionId}-${job.judgeRun}`, { state: 'waiting' });
  }
  async inspect(id: string, run: number) {
    await this.onInspect?.();
    if (this.down) throw new Error('redis is down');
    return this.live.get(`${id}-${run}`) ?? null;
  }
  async discardTrial() {}
  async discard(id: string, run: number) {
    this.discarded.push(`${id}-${run}`);
    this.live.delete(`${id}-${run}`);
  }
  /** An engine took the job and announced its own deadline (for this attempt, unless `deadlineStartedAt` says otherwise). */
  take(id: string, run: number, deadlineAt: number | null, activeSince = Date.now(), deadlineStartedAt: number | null = activeSince) {
    this.live.set(`${id}-${run}`, { state: 'active', deadlineAt, deadlineStartedAt: deadlineAt === null ? null : deadlineStartedAt, activeSince });
  }
  /** The engine finished the job; its result is published but may not have been applied yet. */
  finish(id: string, run: number, finishedAt: number) {
    this.live.set(`${id}-${run}`, { state: 'finished', finishedAt });
  }
}

const target = (maxSubmissions: number | null): SubmissionTarget => ({
  sessionTitle: 'Kiểm tra', problemTitle: 'A. Tổng', timeLimitMs: 1000, memoryLimitMb: 256, allowedLanguages: [], maxSubmissions,
  testCases: [{ id: 'A-1', input: '1 2', expectedOutput: '3', points: 10, isSample: false }],
});

class FakeGateway extends SessionGateway {
  maxSubmissions: number | null = null;
  async prepareSubmission() { return target(this.maxSubmissions); }
  /** Who manages the session; everyone by default, as most tests here act as staff or do not care. */
  reviews = (_actor: Actor) => true;
  async canReview(actor: Actor) { return this.reviews(actor); }
  async judgeTarget() { return target(null); }
  async trialTarget() { return target(null); }
  async visibility(_actor: Actor, ids: string[]) { return new Map<string, ResultVisibility>(ids.map((i) => [i, 'FULL'])); }
}

const config = (values: Record<string, unknown> = {}) => ({ get: (key: string, fallback?: unknown) => values[key] ?? fallback }) as unknown as ConfigService;

function setup(values: Record<string, unknown> = {}) {
  const submissions = new MemorySubmissions();
  const queue = new FakeQueue();
  const gateway = new FakeGateway();
  const events = new RecordingEvents();
  const service = new JudgingService(submissions, {} as SubmissionQueries, gateway, queue, events, config({ MAX_PENDING_SUBMISSIONS: 3, ...values }));
  const watchdog = new JudgeWatchdog(submissions, queue, config(values));
  return { submissions, queue, gateway, events, service, watchdog };
}

const student = (n: number): Actor => ({ id: `student-${n}`, role: 'STUDENT', name: `Học sinh ${n}` });
const SESSION = '4f9c1a52-0000-4000-8000-000000000001';
const submitAs = (t: ReturnType<typeof setup>, actor: Actor) =>
  t.service.submit(actor, { sessionId: SESSION, problemKey: 'A', language: 'python', sourceCode: 'print(3)' }).then(() => 'ok', (e: DomainError) => e.code);
const tally = (results: string[]) => results.reduce<Record<string, number>>((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {});

/** Moves a stored submission's queue time into the past. */
function age(t: ReturnType<typeof setup>, id: string, ms: number) {
  const s = t.submissions.rows.get(id)!;
  t.submissions.rows.set(id, Submission.rehydrate(id, { ...s.snapshot, queuedAt: new Date(s.snapshot.queuedAt.getTime() - ms) }));
}

// ------------------------------------------------------------------ admission limits

test('sequentially, a student may have MAX_PENDING submissions waiting and no more', async () => {
  const t = setup();
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await submitAs(t, student(1)));
  assert.deepEqual(tally(results), { ok: 3, 'judging.too_many_pending': 2 });
});

test('parallel submissions cannot exceed MAX_PENDING either (12 at once, 3 allowed)', async () => {
  const t = setup();
  const results = await Promise.all(Array.from({ length: 12 }, () => submitAs(t, student(1))));
  assert.deepEqual(tally(results), { ok: 3, 'judging.too_many_pending': 9 });
  assert.equal(t.queue.jobs.length, 3, 'only admitted submissions reach the judge queue');
});

test('parallel submissions cannot exceed a per-problem limit (10 at once, 1 allowed)', async () => {
  const t = setup({ MAX_PENDING_SUBMISSIONS: 100 });
  t.gateway.maxSubmissions = 1;
  const results = await Promise.all(Array.from({ length: 10 }, () => submitAs(t, student(1))));
  assert.deepEqual(tally(results), { ok: 1, 'judging.submission_limit': 9 });
});

test('the limits are per student', async () => {
  const t = setup();
  const results = await Promise.all([1, 2, 3].flatMap((n) => Array.from({ length: 5 }, () => submitAs(t, student(n)))));
  assert.deepEqual(tally(results), { ok: 9, 'judging.too_many_pending': 6 });
});

/** The engine reports a system error after the program ran (something a program might cause on purpose). */
const engineError = (t: ReturnType<typeof setup>, id: string, systemFault: 'program' | 'infrastructure' = 'program') =>
  t.service.applyJudgeResult({ type: 'finished', submissionId: id, judgeRun: 1, verdict: 'IE', systemFault, compileOutput: 'Hệ thống chấm bài gặp lỗi', testResults: [] });
const latest = (t: ReturnType<typeof setup>) => [...t.submissions.rows.values()].at(-1)!;

test('the first two engine system errors on a problem in a day are free; later ones count as attempts (IE backstop)', async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  for (let i = 0; i < 2; i++) {
    assert.equal(await submitAs(t, student(1)), 'ok');
    await engineError(t, latest(t).id);
  }
  assert.equal(await submitAs(t, student(1)), 'ok', 'two free system errors did not use the single attempt');
  await engineError(t, latest(t).id); // the third in a day
  assert.equal(await submitAs(t, student(1)), 'judging.submission_limit', 'from the third on, a system error is an attempt');
  assert.equal(await submitAs(t, student(2)), 'ok', 'other students are not affected');
});

test('counted system errors keep counting: there is no daily reset to probe again tomorrow (F-3)', async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  for (let i = 0; i < 3; i++) {
    assert.equal(await submitAs(t, student(1)), 'ok');
    await engineError(t, latest(t).id);
    const s = latest(t);
    t.submissions.rows.set(s.id, Submission.rehydrate(s.id, { ...s.snapshot, createdAt: new Date(Date.now() - 25 * 60 * MIN) }));
  }
  assert.equal(await submitAs(t, student(1)), 'judging.submission_limit');
});

test('engine system errors before any of the program ran (infrastructure) never count, however many (F-3)', async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  for (let i = 0; i < 5; i++) {
    assert.equal(await submitAs(t, student(1)), 'ok');
    await engineError(t, latest(t).id, 'infrastructure');
  }
  assert.equal(await submitAs(t, student(1)), 'ok', 'an outage costs no attempts');
});

test('a result that cannot be stored becomes a counted system error, not a lost result that is free (F-2)', async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  const store = t.submissions.storeResult.bind(t.submissions);
  t.submissions.storeResult = async (s) => {
    if (s.snapshot.verdict === 'RE') throw new Error('unsupported Unicode escape sequence');
    return store(s);
  };
  for (let i = 0; i < 3; i++) {
    assert.equal(await submitAs(t, student(1)), 'ok');
    await t.service.applyJudgeResult({ type: 'finished', submissionId: latest(t).id, judgeRun: 1, verdict: 'RE', testResults: [{ testCaseId: 'A-1', verdict: 'RE', timeMs: 1, memoryKb: 1, points: 0 }] });
    const stored = latest(t).snapshot;
    assert.equal(stored.status, 'DONE', 'not left for the watchdog to call "lost" (which never counts)');
    assert.equal(stored.verdict, 'IE');
    assert.equal(stored.faultSource, 'program');
  }
  assert.equal(await submitAs(t, student(1)), 'judging.submission_limit', 'from the third on it counts');
});

test('a NUL that reaches the backend anyway is removed before storing (F-2)', async () => {
  const t = setup();
  assert.equal(await submitAs(t, student(1)), 'ok');
  await t.service.applyJudgeResult({ type: 'finished', submissionId: latest(t).id, judgeRun: 1, verdict: 'RE', compileOutput: 'a\u0000b', testResults: [{ testCaseId: 'A-1', verdict: 'RE', timeMs: 1, memoryKb: 1, points: 0, message: 'x\u0000y' }] });
  const stored = latest(t).snapshot;
  assert.equal(stored.testResults[0].message, 'xy');
  assert.equal(stored.compileOutput, 'ab');
});

test("the backend's own failures (queue down, lost results) never count, however many", async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  t.queue.rejectEnqueue = true;
  for (let i = 0; i < 3; i++) assert.equal(await submitAs(t, student(1)), 'ok');
  t.queue.rejectEnqueue = false;
  for (let i = 0; i < 3; i++) {
    const s = await stuckSubmission(t);
    age(t, s.id, 6 * MIN);
    t.queue.live.delete(`${s.id}-1`);
    assert.equal(await t.watchdog.sweep(), 1);
  }
  assert.equal(await submitAs(t, student(1)), 'ok', 'six system faults, and the single attempt is still there');
});

test('a system error is not an attempt: a student whose only attempt hit one may submit again', async () => {
  const t = setup();
  t.gateway.maxSubmissions = 1;
  t.queue.rejectEnqueue = true; // the judge queue is down: the submission ends as a system error (IE)
  assert.equal(await submitAs(t, student(1)), 'ok');
  const [only] = [...t.submissions.rows.values()];
  assert.equal(only.snapshot.verdict, 'IE');

  t.queue.rejectEnqueue = false;
  assert.equal(await submitAs(t, student(1)), 'ok', 'the failed one did not use up the single attempt');
  assert.equal(await submitAs(t, student(1)), 'judging.submission_limit', 'a real attempt does');
});

test('NEGATIVE CONTROL: counting first and storing afterwards lets a parallel burst through', async () => {
  // The previous implementation: two separate steps. Same burst, same limit.
  const store = new MemorySubmissions();
  const limit = 3;
  const legacy = async () => {
    const pending = [...store.rows.values()].filter((s) => s.snapshot.status !== 'DONE').length;
    await sleep(1); // the check and the insert were separate round trips to the database
    if (pending >= limit) return false;
    await store.save(Submission.submit({ userId: 'u', userDisplayName: 'u', sessionId: SESSION, sessionTitle: 't', problemKey: 'A', problemTitle: 'p', source: SourceCode.of('python', 'print(1)'), totalPoints: 10 }));
    return true;
  };
  const accepted = (await Promise.all(Array.from({ length: 12 }, legacy))).filter(Boolean).length;
  assert.equal(accepted, 12, 'every request saw an empty queue: the limit of 3 was meaningless');
});

// ------------------------------------------------------------------ the watchdog

async function stuckSubmission(t: ReturnType<typeof setup>, actor = student(1)) {
  await submitAs(t, actor);
  return [...t.submissions.rows.values()].filter((s) => s.snapshot.userId === actor.id).at(-1)!;
}

test('a submission whose job is gone is ended with a system error, and the student can submit again', async () => {
  const t = setup();
  const lost = [await stuckSubmission(t), await stuckSubmission(t), await stuckSubmission(t)];
  t.queue.live.clear(); // the queue lost its data
  assert.equal(await submitAs(t, student(1)), 'judging.too_many_pending', 'locked out, as in the incident');

  for (const s of lost) age(t, s.id, 6 * MIN);
  assert.equal(await t.watchdog.sweep(), 3);

  for (const s of lost) {
    const ended = t.submissions.rows.get(s.id)!.snapshot;
    assert.equal(ended.status, 'DONE');
    assert.equal(ended.verdict, 'IE');
    assert.equal(ended.compileOutput, LOST_RESULT_MESSAGE);
  }
  assert.equal(await submitAs(t, student(1)), 'ok', 'the lock-out is over');
  assert.equal(t.events.published.length, 0, 'a system error never reaches the scoreboard');
});

test('submissions that are still queued or running are left alone, however long the backlog', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 20 * MIN); // older than "stale", younger than "give up"
  assert.equal(await t.watchdog.sweep(), 0);
  assert.equal(t.submissions.rows.get(s.id)!.snapshot.status, 'PENDING');
});

test('fresh submissions are never touched', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  t.queue.live.clear();
  age(t, s.id, 4 * MIN);
  assert.equal(await t.watchdog.sweep(), 0);
});

test('a job still waiting in a long backlog is never given up, however old (S1)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 5 * 60 * MIN);
  assert.equal(await t.watchdog.sweep(), 0);
  assert.equal(t.submissions.rows.get(s.id)!.snapshot.status, 'PENDING');
});

test('a running job is given up only after its own deadline, then removed from the queue (S1)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 45 * MIN);
  t.queue.take(s.id, 1, Date.now() + 60 * MIN, Date.now() - 40 * MIN); // a big problem: its deadline is an hour away
  assert.equal(await t.watchdog.sweep(), 0, 'past the old 30-minute give-up, but still within its deadline');

  t.queue.take(s.id, 1, Date.now() - 3 * MIN, Date.now() - 100 * MIN); // the deadline passed and the engine is gone
  assert.equal(await t.watchdog.sweep(), 1);
  assert.equal(t.submissions.rows.get(s.id)!.snapshot.verdict, 'IE');
  assert.deepEqual(t.queue.discarded, [`${s.id}-1`], 'the job will not run again later');
});

test('a running job that announced no deadline (an older engine) is given up after the give-up time from when it started', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 60 * MIN);
  t.queue.take(s.id, 1, null, Date.now() - 10 * MIN);
  assert.equal(await t.watchdog.sweep(), 0, 'it has only been running 10 minutes');
  t.queue.take(s.id, 1, null, Date.now() - 40 * MIN);
  assert.equal(await t.watchdog.sweep(), 1);
});

test('an absurd deadline from an engine does not keep a job alive for ever (S1-a)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 6 * 60 * MIN);
  t.queue.take(s.id, 1, Date.now() + 1000 * 60 * MIN, Date.now() - 5 * 60 * MIN); // clock skew or a bug: ~16 hours away
  assert.equal(await t.watchdog.sweep(), 1, 'no run may last longer than the hard cap');
});

test('a deadline left over from an earlier attempt of the job is not trusted for the new one (S1-b)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 3 * 60 * MIN);
  // The first attempt's deadline passed long ago; an engine has just retried the job and not yet announced its own.
  t.queue.take(s.id, 1, Date.now() - 60 * MIN, Date.now() - 1_000, Date.now() - 120 * MIN);
  assert.equal(await t.watchdog.sweep(), 0);
});

test('a job the engine just finished gets time for its result to be applied before the submission is ended (S1-d)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 10 * MIN);
  t.queue.finish(s.id, 1, Date.now() - MIN);
  assert.equal(await t.watchdog.sweep(), 0, 'the result is probably still on its way');
  t.queue.finish(s.id, 1, Date.now() - 6 * MIN);
  assert.equal(await t.watchdog.sweep(), 1, 'finished long ago and still no result: it was lost');
});

test('a queue that does not answer counts as unknown after a timeout, and sweeps do not pile up (S1-c)', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 40 * MIN);
  t.queue.onInspect = () => new Promise(() => {}); // Redis hangs instead of failing
  const [first, second] = await Promise.all([t.watchdog.sweep(), t.watchdog.sweep()]);
  assert.equal(second, 0, 'a sweep still running is not started twice');
  assert.equal(first, 1, 'past the give-up time an unknown answer ends it');
});

test('jobs that have waited unusually long for an engine are reported in the log', async (ctx) => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 40 * MIN);
  const warn = ctx.mock.method(Logger.prototype, 'warn', () => {});
  assert.equal(await t.watchdog.sweep(), 0);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /waited more than 30 minutes for an engine/);
});

test('newer lost submissions are reached even behind more than one batch of older waiting ones (S2)', async () => {
  const t = setup({ MAX_PENDING_SUBMISSIONS: 1000 });
  const waiting = [];
  for (let i = 0; i < 230; i++) {
    const s = await stuckSubmission(t, student(100 + i));
    age(t, s.id, 60 * MIN + i);
    waiting.push(s);
  }
  const lost = await stuckSubmission(t, student(1));
  age(t, lost.id, 10 * MIN);
  t.queue.live.delete(`${lost.id}-1`);

  assert.equal(await t.watchdog.sweep(), 1);
  assert.equal(t.submissions.rows.get(lost.id)!.snapshot.verdict, 'IE');
  assert.ok(waiting.every((s) => t.submissions.rows.get(s.id)!.snapshot.status === 'PENDING'));
});

test('when the queue cannot be asked, nothing is ended on a guess - until the give-up time', async () => {
  const t = setup();
  t.queue.down = true;
  const s = await stuckSubmission(t);
  age(t, s.id, 10 * MIN);
  assert.equal(await t.watchdog.sweep(), 0);
  age(t, s.id, 30 * MIN);
  assert.equal(await t.watchdog.sweep(), 1);
});

test('a result that arrives while the watchdog is deciding is never overwritten', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 6 * MIN);
  t.queue.live.clear();
  // Between "found stale" and "end it", the engine's AC is applied.
  t.queue.onInspect = async () => {
    const msg: JudgeResultMessage = { type: 'finished', submissionId: s.id, judgeRun: 1, verdict: 'AC', testResults: [{ testCaseId: 'A-1', verdict: 'AC', timeMs: 1, memoryKb: 1, points: 10 }] };
    await t.service.applyJudgeResult(msg);
  };
  assert.equal(await t.watchdog.sweep(), 0);
  assert.equal(t.submissions.rows.get(s.id)!.snapshot.verdict, 'AC');
});

test('a late result for an ended submission is ignored, and a rejudge starts a fresh clock', async () => {
  const t = setup();
  const s = await stuckSubmission(t);
  age(t, s.id, 6 * MIN);
  t.queue.live.clear();
  await t.watchdog.sweep();

  await t.service.applyJudgeResult({ type: 'finished', submissionId: s.id, judgeRun: 1, verdict: 'AC', testResults: [] });
  assert.equal(t.submissions.rows.get(s.id)!.snapshot.verdict, 'IE', 'the student was told to resubmit; a ghost result does not rewrite that');

  await t.service.rejudge({ id: 'teacher', role: 'TEACHER', name: 'Cô Lan' }, SESSION, null);
  const again = t.submissions.rows.get(s.id)!.snapshot;
  assert.equal(again.status, 'PENDING');
  assert.equal(again.judgeRun, 2);
  assert.ok(Date.now() - again.queuedAt.getTime() < 5_000, 'queued now, not 6 minutes ago');
  assert.equal(await t.watchdog.sweep(), 0, 'so the watchdog does not end it again');
});

test('the watchdog never throws: a failing database just means the next pass tries again', async () => {
  const t = setup();
  t.submissions.findStale = async () => { throw new Error('db down'); };
  assert.equal(await t.watchdog.sweep(), 0);
});

// ---------------------------------------------------------------- review B3 (OJ-14): results never overwrite each other

const acFor = (id: string, judgeRun = 1): JudgeResultMessage => ({
  type: 'finished', submissionId: id, judgeRun, verdict: 'AC',
  testResults: [{ testCaseId: 'A-1', verdict: 'AC', timeMs: 1, memoryKb: 1, points: 10 }],
});

test('B3 regression: "started" handled at the same time as the result never puts a finished submission back to JUDGING', async () => {
  for (const order of ['finished first', 'started first'] as const) {
    const t = setup();
    assert.equal(await submitAs(t, student(1)), 'ok');
    const id = latest(t).id;
    const started: JudgeResultMessage = { type: 'started', submissionId: id, judgeRun: 1 };
    const both = order === 'finished first' ? [acFor(id), started] : [started, acFor(id)];
    await Promise.all(both.map((m) => t.service.applyJudgeResult(m)));
    const s = t.submissions.rows.get(id)!.snapshot;
    assert.equal(s.status, 'DONE', order);
    assert.equal(s.verdict, 'AC', order);
    assert.equal(t.events.published.length, 1, `${order}: the scoreboard hears about it once`);
  }
});

test('B3 regression: a duplicate result is stored once and published once', async () => {
  const t = setup();
  assert.equal(await submitAs(t, student(1)), 'ok');
  const id = latest(t).id;
  await Promise.all([t.service.applyJudgeResult(acFor(id)), t.service.applyJudgeResult(acFor(id))]);
  assert.equal(t.submissions.rows.get(id)!.snapshot.verdict, 'AC');
  assert.equal(t.events.published.length, 1);
});

test('B3 regression: a result of the old run that lands during a rejudge does not undo it', async () => {
  const t = setup();
  assert.equal(await submitAs(t, student(1)), 'ok');
  const id = latest(t).id;
  await t.service.applyJudgeResult(acFor(id));
  // The old run's (duplicate) result is being applied while the teacher rejudges.
  await Promise.all([
    t.service.applyJudgeResult(acFor(id, 1)),
    t.service.rejudge({ id: 'teacher', role: 'TEACHER', name: 'Cô Lan' }, SESSION, null),
  ]);
  const s = t.submissions.rows.get(id)!.snapshot;
  assert.equal(s.judgeRun, 2, 'the rejudge stands');
  assert.equal(s.status, 'PENDING');
  await t.service.applyJudgeResult(acFor(id, 2));
  assert.equal(t.submissions.rows.get(id)!.snapshot.verdict, 'AC', 'and its own result is applied');
});

test('B3 follow-up: two rejudges at the same time queue the submission once and keep the stored result', async () => {
  const t = setup();
  assert.equal(await submitAs(t, student(1)), 'ok');
  const id = latest(t).id;
  await t.service.applyJudgeResult(acFor(id));
  const teacher = { id: 'teacher', role: 'TEACHER', name: 'Cô Lan' } as Actor;
  const jobsBefore = t.queue.jobs.length;
  await Promise.all([t.service.rejudge(teacher, SESSION, null), t.service.rejudge(teacher, SESSION, null)]);
  assert.equal(t.submissions.rows.get(id)!.snapshot.judgeRun, 2, 'one new run, not two');
  assert.equal(t.queue.jobs.length - jobsBefore, 1, 'queued once');
  await t.service.applyJudgeResult(acFor(id, 2));
  await t.service.rejudge(teacher, SESSION, null).catch(() => undefined); // a later rejudge is a new, legitimate run
  assert.equal(t.submissions.rows.get(id)!.snapshot.judgeRun, 3);
});

test('B3 follow-up: a queue error after the job was taken never overwrites a result already stored', async () => {
  const t = setup();
  // The queue takes the job, the engine's result is stored, and only then does the enqueue call report a timeout.
  const enqueue = t.queue.enqueue.bind(t.queue);
  t.queue.enqueue = async (job) => {
    await enqueue(job);
    await t.service.applyJudgeResult(acFor(job.submissionId, job.judgeRun));
    throw new Error('Command timed out');
  };
  assert.equal(await submitAs(t, student(1)), 'ok');
  const s = latest(t).snapshot;
  assert.equal(s.verdict, 'AC', 'the real result stands');
  assert.equal(t.events.published.length, 1);
});

// ---------------------------------------------------------------- OJ-15 F1: hidden tests' diagnostics stay hidden

const leak = (id: string, isSample: boolean | undefined) => ({
  testCaseId: id, verdict: 'RE' as const, timeMs: 1, memoryKb: 1, points: 0,
  message: `Exit code 1\nsecret input of ${id}`, ...(isSample === undefined ? {} : { isSample }),
});

test('F1 regression: a student never sees the error output of a hidden test; a teacher does', async () => {
  const t = setup();
  const owner = student(1);
  t.gateway.reviews = (a) => a.id !== owner.id; // the owner is a student, everyone else here manages the session
  assert.equal(await submitAs(t, owner), 'ok');
  const id = latest(t).id;
  await t.service.applyJudgeResult({
    type: 'finished', submissionId: id, judgeRun: 1, verdict: 'RE',
    testResults: [leak('A-1', true), leak('A-2', false), leak('A-3', undefined)],
  });

  const mine = await t.service.get(owner, id);
  assert.equal(mine.testResults.length, 3, 'every test is still listed, with its verdict');
  assert.match(mine.testResults[0].message ?? '', /secret input of A-1/, 'a sample test keeps its diagnostic');
  assert.equal(mine.testResults[1].message, undefined, 'a hidden test does not');
  assert.equal(mine.testResults[2].message, undefined, 'a result stored before the flag counts as hidden');
  assert.ok(!JSON.stringify(mine).includes('secret input of A-2') && !JSON.stringify(mine).includes('secret input of A-3'));

  const teacher = { id: 'teacher', role: 'TEACHER', name: 'Cô Lan' } as Actor;
  const reviewed = await t.service.get(teacher, id);
  assert.ok(reviewed.testResults.every((r) => r.message?.includes('secret input')), 'the teacher sees every diagnostic');
});

test('F1: studentView keeps verdict, time, memory and points, and leaves message-less results alone', () => {
  const hidden = studentView(leak('A-2', false));
  assert.deepEqual(hidden, { testCaseId: 'A-2', verdict: 'RE', timeMs: 1, memoryKb: 1, points: 0, isSample: false });
  const plain = { testCaseId: 'A-4', verdict: 'AC' as const, timeMs: 2, memoryKb: 3, points: 10 };
  assert.equal(studentView(plain), plain);
});

test('a submission never stores program output, even if an engine sent some (OJ-18: output is for trial runs only)', async () => {
  const t = setup();
  assert.equal(await submitAs(t, student(1)), 'ok');
  const id = latest(t).id;
  await t.service.applyJudgeResult({
    type: 'finished', submissionId: id, judgeRun: 1, verdict: 'WA',
    testResults: [{ testCaseId: 'A-1', verdict: 'WA', timeMs: 1, memoryKb: 1, points: 0, isSample: false, output: 'hidden test data' }],
  });
  const stored = t.submissions.rows.get(id)!.snapshot.testResults;
  assert.equal(stored.length, 1);
  assert.equal('output' in stored[0], false);
});
