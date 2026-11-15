import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { Problem, ResourceLimits, Sharing } from '../src/modules/catalog/domain/problem.js';
import { SourceCode, Submission } from '../src/modules/judging/domain/submission.js';
import { ProblemSet } from '../src/modules/assessment/domain/problem-set.js';
import { Attempt, Session, SessionSettings, TimeWindow } from '../src/modules/assessment/domain/session.js';

const lan: Actor = { id: 't1', role: 'TEACHER', name: 'Cô Lan' };
const minh: Actor = { id: 't2', role: 'TEACHER', name: 'Thầy Minh' };
const admin: Actor = { id: 'a', role: 'ADMIN', name: 'Admin' };
const student: Actor = { id: 's1', role: 'STUDENT', name: 'Bình' };

const content = {
  title: 'A + B', difficulty: 'EASY' as const, tags: ['Math', 'math'],
  statement: '', inputFormat: '', outputFormat: '', constraints: '',
};
const newProblem = (seq = 7) => Problem.create(seq, { id: lan.id, name: lan.name }, content, ResourceLimits.of(1000, 256));

test('problem keeps test case order and rejects giving it out without tests', () => {
  const problem = newProblem();
  assert.equal(problem.code, 'P0007');
  assert.deepEqual(problem.content.tags, ['math']);
  assert.throws(() => problem.ensureJudgeable(), DomainError);
  const t1 = problem.addTestCase({ input: '1', expectedOutput: '1', isSample: true, points: 1 });
  problem.addTestCase({ input: '2', expectedOutput: '2', isSample: false, points: 3 });
  problem.removeTestCase(t1.id);
  assert.deepEqual(problem.testCases.map((t) => t.order), [1]);
  assert.equal(problem.totalPoints, 3);
});

test('a private problem is visible only to its owner and the admin', () => {
  const problem = newProblem();
  assert.ok(problem.canView(lan) && problem.canView(admin));
  assert.ok(!problem.canView(minh) && !problem.canView(student));
  assert.throws(() => problem.copyFor(minh, 8), /Không tìm thấy/);
});

test('sharing levels: tests and solution only with the statement; copies take only what is shared', () => {
  assert.throws(() => Sharing.of(false, true, false), /công khai/);
  const problem = newProblem();
  problem.addTestCase({ input: '1', expectedOutput: '1', isSample: true, points: 1 });
  problem.addTestCase({ input: '2', expectedOutput: '2', isSample: false, points: 1 });
  problem.setSolution(null);

  problem.share(Sharing.of(true, false, false));
  assert.ok(problem.canView(minh) && !problem.canEdit(minh) && !problem.canSeeHiddenTests(minh));
  assert.ok(!problem.canView(student), 'students never browse banks');
  const copy = problem.copyFor(minh, 8);
  assert.equal(copy.owner.id, minh.id);
  assert.equal(copy.testCases.length, 1, 'only the sample');
  assert.equal(copy.copiedFrom?.code, 'P0007');
  assert.ok(!copy.sharing.isPublic, 'copies start private');

  problem.share(Sharing.of(true, true, false));
  assert.equal(problem.copyFor(minh, 9).testCases.length, 2);
});

test('submission score is proportional to earned test points and emits an event', () => {
  const s = Submission.submit({
    userId: 'u', userDisplayName: 'An', sessionId: 's', sessionTitle: 'Kiểm tra', problemKey: 'A',
    problemTitle: 'A. Tổng', source: SourceCode.of('python', 'print(1)'), totalPoints: 4,
  });
  s.startJudging();
  s.complete('WA', [
    { testCaseId: 'A-1', verdict: 'AC', timeMs: 1, memoryKb: 1, points: 3 },
    { testCaseId: 'A-2', verdict: 'WA', timeMs: 1, memoryKb: 1, points: 0 },
  ], null);
  assert.equal(s.snapshot.status, 'DONE');
  assert.equal(s.snapshot.score, 75);
  const [event] = s.pullEvents() as unknown as { name: string; sessionId: string; problemKey: string }[];
  assert.equal(event.name, 'judging.submission-judged');
  assert.equal(event.problemKey, 'A');
});

test('set blueprint: staff only, no duplicates, public only when all problems are public', () => {
  const details = { title: 'Kiểm tra 15 phút', description: '', type: 'TEST' as const };
  assert.throws(() => ProblemSet.compose(student, details, []));
  assert.throws(() => ProblemSet.compose(lan, details, [{ problemId: 'a', points: 5 }, { problemId: 'a', points: 5 }]));

  const set = ProblemSet.compose(lan, details, [{ problemId: 'a', points: 6 }, { problemId: 'b', points: 4 }]);
  assert.ok(set.canEdit(lan) && set.canEdit(admin) && !set.canView(minh));
  assert.throws(() => set.share(true, false), /công khai đề bài/);
  set.share(true, true);
  assert.ok(set.canView(minh) && !set.canEdit(minh));

  const copy = set.copyFor(minh, new Map([['a', 'a2'], ['b', 'b2']]));
  assert.deepEqual(copy.snapshot.items.map((i) => i.problemId), ['a2', 'b2']);
  assert.equal(copy.snapshot.owner.id, minh.id);
  assert.ok(!copy.snapshot.isPublic);
  assert.equal(copy.snapshot.copiedFrom?.ownerName, 'Cô Lan');

  assert.ok(set.dropProblem('a'));
  assert.equal(set.totalPoints, 4);
});

test('session: frozen problems get keys A, B, ...; time window decides the state', () => {
  const frozen = (title: string) => ({
    sourceProblemId: title, code: 'P0001', title, difficulty: 'EASY' as const, tags: [], points: 5,
    statement: '', inputFormat: '', outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256,
    testCases: [{ input: '1', expectedOutput: '1', isSample: true, points: 1 }],
  });
  const t0 = new Date('2026-01-10T00:00:00Z');
  const session = Session.create({
    title: 'Bài tập tuần 1', description: '', type: 'HOMEWORK', classId: 'c1', sourceSetId: null, assignmentKey: null,
    window: TimeWindow.of(t0, new Date(t0.getTime() + 10 * 86_400_000)),
    settings: SessionSettings.defaults,
    createdBy: { id: lan.id, name: lan.name },
    problems: [frozen('Tổng'), frozen('Hiệu'), frozen('Tích')],
  });
  assert.deepEqual(session.snapshot.problems.map((p) => p.key), ['A', 'B', 'C']);
  assert.equal(session.problem('b').title, 'Hiệu');
  assert.equal(session.totalPoints, 15);
  assert.equal(session.stateAt(new Date(t0.getTime() - 1), true), 'UPCOMING');
  assert.equal(session.stateAt(new Date(t0.getTime() + 1), true), 'OPEN');
  assert.equal(session.stateAt(new Date(t0.getTime() + 1), false), 'CLOSED', 'archived class closes the session');
  assert.equal(session.stateAt(new Date(t0.getTime() + 11 * 86_400_000), true), 'CLOSED');
  assert.throws(() => TimeWindow.of(t0, t0), /sau thời gian mở/);
});

const frozenProblem = (id: string, title: string) => ({
  sourceProblemId: id, code: 'P0001', title, difficulty: 'EASY' as const, tags: [] as string[], points: 10,
  statement: 'cũ', inputFormat: '', outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256,
  testCases: [{ input: '1', expectedOutput: '1', isSample: true, points: 1 }],
});

function timedSession(durationMinutes: number | null, closesAt: Date | null, feedback: 'FULL' | 'SCORE_ONLY' | 'HIDDEN_UNTIL_CLOSED' = 'FULL') {
  return Session.create({
    title: 'Kiểm tra', description: '', type: 'TEST', classId: 'c1', sourceSetId: null, assignmentKey: null,
    window: TimeWindow.of(null, closesAt),
    settings: SessionSettings.of({ durationMinutes, allowedLanguages: ['cpp', 'cpp'], maxSubmissionsPerProblem: 3, feedback }),
    createdBy: { id: lan.id, name: lan.name },
    problems: [frozenProblem('p1', 'Tổng'), frozenProblem('p2', 'Hiệu')],
  });
}

test('session settings are validated; languages deduplicated', () => {
  assert.throws(() => SessionSettings.of({ durationMinutes: 0, allowedLanguages: [], maxSubmissionsPerProblem: null, feedback: 'FULL' }), /1 phút/);
  assert.throws(() => SessionSettings.of({ durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: 0, feedback: 'FULL' }), /1 đến 1000/);
  const s = timedSession(45, null).snapshot.settings;
  assert.deepEqual(s.allowedLanguages, ['cpp']);
  assert.ok(s.allows('cpp') && !s.allows('python') && SessionSettings.defaults.allows('python'));
});

test('attempt: personal timer ends after the duration, or at the session close if sooner', () => {
  const now = new Date('2026-03-01T08:00:00Z');
  const a = Attempt.start(timedSession(45, null), 'u1', now);
  assert.equal(a.endsAt.toISOString(), '2026-03-01T08:45:00.000Z');
  assert.ok(a.isRunning(new Date('2026-03-01T08:44:59Z')) && !a.isRunning(new Date('2026-03-01T08:45:00Z')));
  const late = Attempt.start(timedSession(45, new Date('2026-03-01T08:30:00Z')), 'u1', now);
  assert.equal(late.endsAt.toISOString(), '2026-03-01T08:30:00.000Z');
  assert.throws(() => Attempt.start(timedSession(null, null), 'u1', now), /không tính giờ/);
});

test('feedback: managers and closed sessions see everything; otherwise the mode decides', () => {
  const hidden = timedSession(null, null, 'HIDDEN_UNTIL_CLOSED');
  assert.equal(hidden.visibilityFor(false, 'OPEN'), 'HIDDEN');
  assert.equal(hidden.visibilityFor(true, 'OPEN'), 'FULL');
  assert.equal(hidden.visibilityFor(false, 'CLOSED'), 'FULL');
  assert.equal(timedSession(null, null, 'SCORE_ONLY').visibilityFor(false, 'OPEN'), 'SCORE_ONLY');
});

test('refresh re-freezes problems still in the bank, keeping keys and points', () => {
  const session = timedSession(null, null);
  const changed = session.refresh(new Map([['p2', { ...frozenProblem('p2', 'Hiệu (sửa)'), statement: 'mới' }]]));
  assert.deepEqual(changed, ['B']);
  const b = session.problem('B');
  assert.equal(b.title, 'Hiệu (sửa)');
  assert.equal(b.points, 10);
  assert.equal(session.problem('A').statement, 'cũ');
});

test('rejudge resets a submission and only accepts results of the new run', () => {
  const s = Submission.submit({
    userId: 'u', userDisplayName: 'An', sessionId: 's', sessionTitle: 'Kiểm tra', problemKey: 'A',
    problemTitle: 'A. Tổng', source: SourceCode.of('python', 'print(1)'), totalPoints: 2,
  });
  s.complete('WA', [{ testCaseId: 'A-1', verdict: 'WA', timeMs: 1, memoryKb: 1, points: 0 }], null);
  s.pullEvents();
  const run = s.rejudge(3);
  assert.equal(run, 2);
  assert.equal(s.snapshot.status, 'PENDING');
  assert.ok(!s.isCurrentRun(1) && s.isCurrentRun(2));
  s.complete('AC', [{ testCaseId: 'A-1', verdict: 'AC', timeMs: 1, memoryKb: 1, points: 3 }], null);
  assert.equal(s.snapshot.score, 100);
});
