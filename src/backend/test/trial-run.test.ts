import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JudgeJob, JudgeResultMessage } from '@oj/contracts';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { InMemoryRateLimiter } from '../src/shared/infrastructure/memory-rate-limiter.js';
import { SessionService } from '../src/modules/assessment/application/session.service.js';
import { Session, SessionSettings, TimeWindow } from '../src/modules/assessment/domain/session.js';
import { JudgeQueue, SessionGateway, type SubmissionTarget } from '../src/modules/judging/application/ports.js';
import { displayText, TRIAL_MAX_SAMPLES, TRIAL_RATE, TrialRunService } from '../src/modules/judging/application/trial-run.service.js';
import { BullMqJudgeQueue, routeResult, trialJobId } from '../src/modules/judging/infrastructure/bullmq-judge-queue.js';
import { MemoryTrialStore, trialStoreContract } from './support/trial-store-contract.js';

/** OJ-18: trial runs on the sample tests. */

trialStoreContract('Memory trial store', () => new MemoryTrialStore());

// ------------------------------------------------------------------ fakes

const SESSION = '4f9c1a52-0000-4000-8000-000000000001';
const student = (n = 1): Actor => ({ id: `student-${n}`, role: 'STUDENT', name: `Học sinh ${n}` });

const sampleTarget = (): SubmissionTarget => ({
  sessionTitle: 'Kiểm tra', problemTitle: 'A. Tổng', timeLimitMs: 1000, memoryLimitMb: 256, allowedLanguages: [], maxSubmissions: null,
  testCases: [
    { id: 'A-1', input: '1 2', expectedOutput: '3', points: 0, isSample: true },
    { id: 'A-2', input: '5 5', expectedOutput: '10', points: 0, isSample: true },
  ],
});

class FakeGateway extends SessionGateway {
  target: SubmissionTarget = sampleTarget();
  denied: DomainError | null = null;
  readonly calls: string[] = [];
  async prepareSubmission(): Promise<SubmissionTarget> { throw new Error('a trial must not prepare a submission'); }
  async trialTarget(_actor: Actor, sessionId: string, key: string) {
    this.calls.push(`${sessionId}/${key}`);
    if (this.denied) throw this.denied;
    return this.target;
  }
  async canReview() { return false; }
  async judgeTarget() { return null; }
  async visibility() { return new Map(); }
}

class FakeQueue extends JudgeQueue {
  readonly jobs: JudgeJob[] = [];
  readonly discardedTrials: string[] = [];
  fail = false;
  async enqueue(job: JudgeJob) {
    if (this.fail) throw new Error('redis is down');
    this.jobs.push(job);
  }
  async inspect() { return null; }
  async discard() {}
  async discardTrial(id: string) { this.discardedTrials.push(id); }
}

function setup() {
  const gateway = new FakeGateway();
  const queue = new FakeQueue();
  const store = new MemoryTrialStore();
  const limiter = new InMemoryRateLimiter();
  const service = new TrialRunService(gateway, queue, store, limiter);
  return { gateway, queue, store, limiter, service };
}

const tryAs = (t: ReturnType<typeof setup>, actor = student(), sourceCode = 'print(sum(map(int, input().split())))') =>
  t.service.start(actor, SESSION, 'a', { language: 'python', sourceCode });
const codeOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const finished = (id: string, output = '3'): JudgeResultMessage => ({
  type: 'finished', trial: true, submissionId: id, judgeRun: 1, verdict: 'WA',
  testResults: [
    { testCaseId: 'A-1', verdict: 'AC', timeMs: 12, memoryKb: 900, points: 0, isSample: true, output },
    { testCaseId: 'A-2', verdict: 'WA', timeMs: 11, memoryKb: 900, points: 0, isSample: true, output: '11' },
  ],
});

// ------------------------------------------------------------------ the use case

test('a trial runs the sample tests only, flagged as a trial, through the judge queue', async () => {
  const t = setup();
  t.gateway.target = { ...sampleTarget(), testCases: [...sampleTarget().testCases, { id: 'A-3', input: 'x', expectedOutput: 'y', points: 5, isSample: false }] };
  const dto = await tryAs(t);
  assert.deepEqual(t.gateway.calls, [`${SESSION}/A`], 'the viewing right is checked, with the key upper-cased');
  assert.equal(t.queue.jobs.length, 1);
  const job = t.queue.jobs[0];
  assert.equal(job.trial, true);
  assert.equal(job.submissionId, dto.id);
  assert.deepEqual(job.testCases.map((c) => c.id), ['A-1', 'A-2'], 'a hidden test that slipped through is dropped');
  assert.ok(job.testCases.every((c) => c.isSample));
  assert.equal(dto.status, 'PENDING');
  assert.deepEqual(dto.tests.map((x) => [x.input, x.expectedOutput, x.output]), [['1 2', '3', null], ['5 5', '10', null]]);
});

test('at most TRIAL_MAX_SAMPLES samples are run', async () => {
  const t = setup();
  t.gateway.target = { ...sampleTarget(), testCases: Array.from({ length: 15 }, (_, i) => ({ id: `A-${i + 1}`, input: `${i}`, expectedOutput: `${i}`, points: 0, isSample: true })) };
  await tryAs(t);
  assert.equal(t.queue.jobs[0].testCases.length, TRIAL_MAX_SAMPLES);
});

test('a new trial drops the previous one from the queue, so nobody\'s abandoned trials pile up behind submissions', async () => {
  const t = setup();
  const first = await tryAs(t);
  t.store.slots.clear(); // the slot expired while the first trial was still queued
  const second = await tryAs(t);
  assert.deepEqual(t.queue.discardedTrials, [first.id]);
  assert.notEqual(second.id, first.id);
});

test('large samples are cut for display, but the judge still gets them whole', async () => {
  const t = setup();
  const big = 'x'.repeat(50_000);
  t.gateway.target = { ...sampleTarget(), testCases: [{ id: 'A-1', input: big, expectedOutput: big, points: 0, isSample: true }] };
  const dto = await tryAs(t);
  assert.equal(t.queue.jobs[0].testCases[0].input.length, 50_000);
  assert.ok(dto.tests[0].input.length < 4_010 && dto.tests[0].input.endsWith('…'));
  assert.equal(displayText('short'), 'short');
});

test('a trial needs the statement viewing right: a refusal from Assessment stops it before anything is queued', async () => {
  const t = setup();
  const { DomainError } = await import('../src/shared/domain/domain-error.js');
  t.gateway.denied = DomainError.forbidden('assessment.not_started', 'Bắt đầu trước');
  assert.equal(await codeOf(tryAs(t)), 'assessment.not_started');
  assert.equal(t.queue.jobs.length, 0);
  assert.equal(t.store.slots.size, 0, 'no slot is left taken');
});

test('a problem without sample tests cannot be tried; a language the session forbids is refused', async () => {
  const t = setup();
  t.gateway.target = { ...sampleTarget(), testCases: [{ id: 'A-1', input: '1', expectedOutput: '1', points: 10, isSample: false }] };
  assert.equal(await codeOf(tryAs(t)), 'judging.no_samples');
  t.gateway.target = { ...sampleTarget(), allowedLanguages: ['cpp'] };
  assert.equal(await codeOf(tryAs(t)), 'judging.language_not_allowed');
  assert.equal(await codeOf(tryAs(t, student(), '   ')), 'judging.empty_source');
  assert.equal(t.queue.jobs.length, 0);
});

test('one trial in flight per user; the result frees the slot', async () => {
  const t = setup();
  const first = await tryAs(t);
  assert.equal(await codeOf(tryAs(t)), 'judging.trial_pending');
  assert.equal(await codeOf(tryAs(t, student(2))), 'ok', 'other users are not affected');
  await t.service.applyResult(finished(first.id));
  assert.equal(await codeOf(tryAs(t)), 'ok');
});

test('parallel trials of one user: exactly one gets through', async () => {
  const t = setup();
  const results = await Promise.all(Array.from({ length: 8 }, () => codeOf(tryAs(t))));
  assert.equal(results.filter((r) => r === 'ok').length, 1);
  assert.equal(t.queue.jobs.length, 1);
});

test(`at most ${TRIAL_RATE.limit} trials per ${TRIAL_RATE.windowMs / 60_000} minutes per user`, async () => {
  const t = setup();
  for (let i = 0; i < TRIAL_RATE.limit; i++) {
    const dto = await tryAs(t);
    await t.service.applyResult(finished(dto.id));
  }
  assert.equal(await codeOf(tryAs(t)), 'judging.too_many_trials');
  assert.equal(t.store.slots.size, 0, 'a refused trial does not keep the slot');
});

test('a queue failure is reported and leaves no trial or slot behind', async () => {
  const t = setup();
  t.queue.fail = true;
  assert.equal(await codeOf(tryAs(t)), 'judging.trial_unavailable');
  assert.equal(t.store.states.size, 0);
  assert.equal(t.store.slots.size, 0);
});

test('results come back per sample with the program output; only the owner can read them', async () => {
  const t = setup();
  const dto = await tryAs(t);
  await t.service.applyResult({ type: 'started', trial: true, submissionId: dto.id, judgeRun: 1 });
  assert.equal((await t.service.get(student(), dto.id)).status, 'JUDGING');
  await t.service.applyResult(finished(dto.id));
  const done = await t.service.get(student(), dto.id);
  assert.equal(done.status, 'DONE');
  assert.equal(done.verdict, 'WA');
  assert.deepEqual(done.tests.map((x) => [x.verdict, x.output]), [['AC', '3'], ['WA', '11']]);

  assert.equal(await codeOf(t.service.get(student(2), dto.id)), 'judging.trial_not_found', 'another student');
  assert.equal(await codeOf(t.service.get({ id: 'teacher', role: 'TEACHER', name: 'GV' }, dto.id)), 'judging.trial_not_found', 'even staff');
  assert.equal(await codeOf(t.service.get(student(), '00000000-0000-4000-8000-000000000000')), 'judging.trial_not_found');
});

test('a user with a trial in flight is turned away before any session lookup', async () => {
  const t = setup();
  await tryAs(t);
  t.gateway.calls.length = 0;
  assert.equal(await codeOf(tryAs(t)), 'judging.trial_pending');
  assert.deepEqual(t.gateway.calls, []);
});

test('a compile error comes back with the compiler output and no test results', async () => {
  const t = setup();
  const dto = await tryAs(t);
  await t.service.applyResult({ type: 'finished', trial: true, submissionId: dto.id, judgeRun: 1, verdict: 'CE', compileOutput: 'SyntaxError', testResults: [] });
  const done = await t.service.get(student(), dto.id);
  assert.equal(done.verdict, 'CE');
  assert.equal(done.compileOutput, 'SyntaxError');
  assert.deepEqual(done.tests.map((x) => x.verdict), [null, null]);
});

// ------------------------------------------------------------------ routing and queueing

test('the results consumer sends trial messages to the trial store and never to submissions', async () => {
  const seen: string[] = [];
  const judging = { applyJudgeResult: async (m: JudgeResultMessage) => void seen.push(`submission:${m.submissionId}`) };
  const trials = { applyResult: async (m: JudgeResultMessage) => void seen.push(`trial:${m.submissionId}`) };
  await routeResult({ type: 'started', submissionId: 's1', judgeRun: 1 }, judging, trials);
  await routeResult({ type: 'started', trial: true, submissionId: 't1', judgeRun: 1 }, judging, trials);
  await routeResult({ ...finished('t2') }, judging, trials);
  await routeResult({ ...finished('s2'), trial: undefined }, judging, trials);
  assert.deepEqual(seen, ['submission:s1', 'trial:t1', 'trial:t2', 'submission:s2']);
});

test('trial jobs are queued behind submissions, tried once, and leave nothing in the queue', async () => {
  const added: { name: string; opts: Record<string, unknown> }[] = [];
  const queue = Object.create(BullMqJudgeQueue.prototype) as BullMqJudgeQueue;
  Object.assign(queue, { queue: { add: async (name: string, _job: JudgeJob, opts: Record<string, unknown>) => void added.push({ name, opts }) } });
  const job = { submissionId: 'abc', judgeRun: 1, language: 'python', sourceCode: 'x', timeLimitMs: 1, memoryLimitMb: 1, testCases: [] } as JudgeJob;
  await queue.enqueue({ ...job, trial: true });
  await queue.enqueue(job);
  const [trial, submission] = added;
  assert.equal(trial.opts.jobId, trialJobId('abc'));
  assert.ok((trial.opts.priority as number) > 0, 'prioritized jobs run after the plain ones in BullMQ');
  assert.equal(trial.opts.attempts, 1);
  assert.equal(trial.opts.removeOnComplete, true);
  assert.equal(submission.opts.priority, undefined, 'submissions are not slowed down');
  assert.notEqual(submission.opts.jobId, trial.opts.jobId);
});

// ------------------------------------------------------------------ Assessment: who may try

function sessionService(session: Session, opts: { member: boolean; attempt: boolean }) {
  const sessions = { findById: async (id: string) => (id === session.id ? session : null) };
  const attempts = { find: async () => (opts.attempt ? {} : null) };
  const classes = {
    getClasses: async (ids: string[]) => new Map(ids.map((id) => [id, { id, name: 'Lớp', teacherId: 't1', status: 'ACTIVE' as const }])),
    canManage: async (actor: Actor) => actor.id === 't1',
    membership: async () => (opts.member ? ('current' as const) : null),
  };
  const none = {} as never;
  return new SessionService(sessions as never, attempts as never, none, none, classes as never, none, none);
}

function session(timed: boolean) {
  const testCases = [
    { input: '1 2', expectedOutput: '3', isSample: true, points: 0 },
    { input: '9 9', expectedOutput: '18', isSample: false, points: 10 },
  ];
  return Session.create({
    title: 'Đề 1', description: '', type: 'TEST', classId: 'c1', sourceSetId: 's1', assignmentKey: null,
    window: TimeWindow.of(null, null),
    settings: timed ? SessionSettings.of({ durationMinutes: 30, allowedLanguages: ['python'], maxSubmissionsPerProblem: 1, feedback: 'FULL' }) : SessionSettings.defaults,
    createdBy: { id: 't1', name: 'Lan' },
    problems: [{ sourceProblemId: 'p1', code: 'P-1', title: 'Tổng', difficulty: 'EASY', tags: ['dp'], statement: 'Đề', inputFormat: '', outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256, testCases, points: 10 }],
  });
}

test('Assessment returns only the sample tests, to a class member, with no submission limit', async () => {
  const s = session(true);
  const target = await sessionService(s, { member: true, attempt: true }).trialTarget(student(), s.id, 'A');
  assert.deepEqual(target.testCases.map((c) => [c.input, c.isSample]), [['1 2', true]]);
  assert.deepEqual(target.allowedLanguages, ['python']);
  assert.equal(target.maxSubmissions, null);
});

test('Assessment refuses a trial to a non-member, and in a timed session before the student started', async () => {
  const s = session(true);
  assert.equal(await codeOf(sessionService(s, { member: false, attempt: false }).trialTarget(student(), s.id, 'A')), 'assessment.session_not_found');
  assert.equal(await codeOf(sessionService(s, { member: true, attempt: false }).trialTarget(student(), s.id, 'A')), 'assessment.not_started');
  const open = session(false);
  assert.equal(await codeOf(sessionService(open, { member: true, attempt: false }).trialTarget(student(), open.id, 'A')), 'ok', 'untimed: no start needed');
  assert.equal(await codeOf(sessionService(open, { member: true, attempt: false }).trialTarget(student(), open.id, 'Z')), 'assessment.problem_not_in_session');
});
