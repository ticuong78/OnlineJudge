import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldTag, normalizeTag, TOPIC_ALIASES, TopicIds, Topics, type ProblemSetType } from '@oj/contracts';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { ProblemService } from '../src/modules/catalog/application/problem.service.js';
import { retagged } from '../src/modules/catalog/application/topic-normalization.js';
import { UnshareChecks } from '../src/modules/catalog/application/unshare-checks.js';
import { Problem, ResourceLimits } from '../src/modules/catalog/domain/problem.js';
import { ProblemQueries, type ProblemListFilter, type ProblemScopeFilter } from '../src/modules/catalog/domain/problem.repository.js';
import type { RecordProgress, RecordSession } from '../src/modules/assessment/application/ports.js';
import { SessionService } from '../src/modules/assessment/application/session.service.js';
import { Attempt, Session, SessionSettings, TimeWindow, type SessionProblem } from '../src/modules/assessment/domain/session.js';
import type { SessionFilter } from '../src/modules/assessment/domain/repositories.js';
import { backfillRecordProblems, backfillSessionProblems } from '../src/modules/assessment/application/topic-backfill.js';
import { CatalogProblemCatalog } from '../src/modules/assessment/infrastructure/adapters.js';
import { toSession } from '../src/modules/assessment/infrastructure/repositories.js';
import { CatalogFacade } from '../src/modules/catalog/application/catalog.facade.js';
import { ProblemRepository } from '../src/modules/catalog/domain/problem.repository.js';

/** OJ-20: topics. */

const codeOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

// ------------------------------------------------------------------ the topic list and tag normalisation

test('standard topics in any spelling, and known aliases, become the topic id', () => {
  const cases: [string, string][] = [
    ['Quy hoạch động', 'dp'], ['QHĐ', 'dp'], ['qhd', 'dp'], ['Dynamic Programming', 'dp'], ['dp', 'dp'],
    ['Prefix-Sums', 'prefix-sums'], ['prefix sums', 'prefix-sums'], ['Mảng con', 'prefix-sums'], ['subarrays', 'prefix-sums'],
    ['Mảng', 'arrays'], ['two pointers', 'two-pointers'], ['Tìm kiếm nhị phân', 'binary-search'], ['Hình học', 'geometry'],
    ['  Đồ   thị ', 'graphs'], ['BFS', 'bfs-dfs'], ['Chuỗi', 'strings'], ['số học', 'math'],
  ];
  for (const [raw, id] of cases) assert.equal(normalizeTag(raw), id, raw);
});

test('other tags stay as written: trimmed, lowercased, single spaces, diacritics kept', () => {
  assert.equal(normalizeTag('  Bài   Thi HSG '), 'bài thi hsg');
  assert.equal(normalizeTag('Olympic 30/4'), 'olympic 30/4');
});

test('the topic list is consistent: unique ids, every alias points at a topic and is in folded form', () => {
  assert.equal(new Set(TopicIds).size, Topics.length);
  for (const [alias, id] of Object.entries(TOPIC_ALIASES)) {
    assert.ok(TopicIds.includes(id), `${alias} -> ${id}`);
    assert.equal(foldTag(alias), alias, `alias "${alias}" must be folded`);
  }
  assert.ok(TopicIds.includes('arrays') && TopicIds.includes('prefix-sums') && TopicIds.includes('dp'));
});

// ------------------------------------------------------------------ catalog

const teacher: Actor = { id: 't1', role: 'TEACHER', name: 'Lan', organizations: [{ id: 'org1', role: 'TEACHER' }] };
const content = (tags: string[]) => ({
  title: 'Tổng', difficulty: 'EASY' as const, tags, statement: 'Đề', inputFormat: '', outputFormat: '', constraints: '',
});

test('a problem stores topics by id, without duplicates, and refuses tags over 40 characters', () => {
  const p = Problem.create(1, { id: 't1', name: 'Lan' }, content(['Mảng', 'arrays', 'Quy hoạch động', 'Bài khó']), ResourceLimits.of(1000, 256));
  assert.deepEqual(p.content.tags, ['arrays', 'dp', 'bài khó']);
  assert.throws(() => Problem.create(2, { id: 't1', name: 'Lan' }, content(['x'.repeat(41)]), ResourceLimits.of(1000, 256)),
    (e: DomainError) => e.code === 'catalog.tag_too_long');
});

class RecordingQueries extends ProblemQueries {
  lastList?: ProblemListFilter;
  lastCounts?: ProblemScopeFilter;
  async list(filter: ProblemListFilter) { this.lastList = filter; return { rows: [], total: 0 }; }
  async tagCounts(filter: ProblemScopeFilter) { this.lastCounts = filter; return [{ tag: 'dp', count: 2 }]; }
}
const problemService = (queries: ProblemQueries) =>
  new ProblemService({} as never, queries, {} as never, {} as never, {} as never, {} as never, new UnshareChecks());

test('the bank filter accepts several topics in any spelling and asks for problems with all of them', async () => {
  const queries = new RecordingQueries();
  await problemService(queries).list(teacher, { scope: 'mine', tags: ['Mảng', 'Tổng tiền tố'], page: 1, pageSize: 20 });
  assert.deepEqual(queries.lastList?.tags, ['arrays', 'prefix-sums']);
  assert.equal(queries.lastList?.viewerId, 't1');
});

test('tag counts follow the same scope rules as the list', async () => {
  const queries = new RecordingQueries();
  const service = problemService(queries);
  assert.deepEqual(await service.tagCounts(teacher, 'mine'), [{ tag: 'dp', count: 2 }]);
  assert.deepEqual(queries.lastCounts, { scope: 'mine', viewerId: 't1', organizationIds: ['org1'] });
  await service.tagCounts(teacher, 'organization', 'someone-elses-org');
  assert.deepEqual(queries.lastCounts?.organizationIds, [], 'an organization the teacher is not in counts nothing');
  assert.equal(await codeOf(service.tagCounts(teacher, 'all')), 'catalog.scope_all');
});

test('the normalize script rewrites only what changes, and a second run changes nothing', () => {
  const rows = [
    { id: 'a', tags: ['quy hoạch động', 'tìm kiếm nhị phân'] },
    { id: 'b', tags: ['dp'] },
    { id: 'c', tags: ['mảng', 'arrays'] },
  ];
  const changes = retagged(rows);
  assert.deepEqual(changes.map((c) => [c.id, c.to]), [['a', ['dp', 'binary-search']], ['c', ['arrays']]]);
  const after = rows.map((r) => ({ id: r.id, tags: changes.find((c) => c.id === r.id)?.to ?? r.tags }));
  assert.deepEqual(retagged(after), []);
});

// ------------------------------------------------------------------ assessment: who sees topics

const student: Actor = { id: 's1', role: 'STUDENT', name: 'Học sinh' };
const owner: Actor = { id: 't1', role: 'TEACHER', name: 'Lan' };
const HOUR = 3_600_000;

function sessionOf(type: ProblemSetType, closed = false, classId: string | null = 'c1') {
  const problem = (sourceProblemId: string, title: string, tags: string[]): Omit<SessionProblem, 'key'> => ({
    sourceProblemId, code: sourceProblemId, title, difficulty: 'EASY', tags, points: 10, statement: '', inputFormat: '',
    outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256,
    testCases: [{ input: '1', expectedOutput: '1', isSample: true, points: 10 }],
  });
  const now = Date.now();
  return Session.create({
    title: `${type} session`, description: '', type, classId, sourceSetId: null, assignmentKey: null,
    window: closed ? TimeWindow.of(new Date(now - 3 * HOUR), new Date(now - HOUR)) : TimeWindow.of(null, null),
    settings: SessionSettings.defaults, createdBy: { id: 't1', name: 'Lan' },
    problems: [problem('p1', 'Tổng', ['arrays', 'prefix-sums']), problem('p2', 'Dãy con', ['dp'])],
  });
}

function assessment(sessions: Session[], progress: RecordProgress[] = [], records: RecordSession[] = [], catalog: unknown = {}) {
  const repo = {
    // A full load (with every hidden test) per session is what the review found on học bạ: it must not be used there.
    findById: async (id: string) => { fullLoads.push(id); return sessions.find((s) => s.id === id) ?? null; },
    findListing: async (ids: string[]) => sessions.filter((s) => ids.includes(s.id)),
    list: async (f: SessionFilter) => sessions.filter((s) => s.snapshot.classId === null
      && (!f.types || f.types.includes(s.snapshot.type))
      && (!f.openAt || s.snapshot.window.stateAt(f.openAt) === 'OPEN')),
    findByAssignmentKey: async () => null,
    save: async (s: Session) => { if (!sessions.includes(s)) sessions.push(s); },
  };
  const fullLoads: string[] = [];
  const attempts = { find: async () => null as Attempt | null, findForUser: async () => [] as Attempt[] };
  const classes = {
    getClasses: async (ids: string[]) => new Map(ids.map((id) => [id, { id, name: 'Lớp', teacherId: 't1', status: 'ACTIVE' as const }])),
    canManage: async (actor: Actor) => actor.id === 't1',
    membership: async () => 'current' as const,
    classIdsOfStudent: async () => ['c1'],
  };
  const record = {
    progressOfUser: async (_u: string, ids?: string[]) => progress.filter((p) => !ids || ids.includes(p.sessionId)),
    getSessions: async (ids: string[]) => new Map(records.filter((r) => ids.includes(r.sessionId)).map((r) => [r.sessionId, r])),
    putSession: async (r: RecordSession) => { records.splice(0, records.length, ...records.filter((x) => x.sessionId !== r.sessionId), r); },
  };
  const none = {} as never;
  const service = new SessionService(repo as never, attempts as never, none, catalog as never, classes as never, record as never, none);
  return Object.assign(service, { fullLoads, records });
}

test('the domain rule: tests and exams hide topics from students until closed; managers always see them', () => {
  for (const type of ['TEST', 'EXAM'] as const) {
    const s = sessionOf(type);
    assert.equal(s.topicsVisibleTo(false, 'OPEN'), false);
    assert.equal(s.topicsVisibleTo(false, 'UPCOMING'), false);
    assert.equal(s.topicsVisibleTo(false, 'CLOSED'), true);
    assert.equal(s.topicsVisibleTo(true, 'OPEN'), true);
  }
  for (const type of ['PRACTICE', 'HOMEWORK'] as const) assert.equal(sessionOf(type).topicsVisibleTo(false, 'OPEN'), true);
});

test('a student gets no topics on a running test (problem and session list), and gets them once it closed', async () => {
  const running = sessionOf('TEST');
  const service = assessment([running]);
  assert.deepEqual((await service.getProblem(student, running.id, 'A')).tags, []);
  assert.deepEqual((await service.get(student, running.id)).problems.map((p) => p.tags), [[], []]);
  assert.deepEqual((await service.getProblem(owner, running.id, 'A')).tags, ['arrays', 'prefix-sums'], 'the teacher sees them');

  const closed = sessionOf('TEST', true);
  assert.deepEqual((await assessment([closed]).getProblem(student, closed.id, 'B')).tags, ['dp']);
  const homework = sessionOf('HOMEWORK');
  assert.deepEqual((await assessment([homework]).getProblem(student, homework.id, 'B')).tags, ['dp']);
});

test('practice by topic lists the open public sessions\' problems of that topic, marking the solved ones', async () => {
  const practice = sessionOf('PRACTICE', false, null);
  const exam = sessionOf('EXAM', false, null); // public but running: its topics must not leak through this list
  const ended = sessionOf('PRACTICE', true, null);
  const progress: RecordProgress[] = [{ userId: 's1', userDisplayName: 'Học sinh', sessionId: practice.id, problemKey: 'B', bestScore: 100, solvedAt: new Date(), lastSubmittedAt: new Date(), attempts: 1 }];
  const service = assessment([practice, exam, ended], progress);
  const dp = await service.practiceProblems(student, 'Quy hoạch động');
  assert.deepEqual(dp.map((p) => [p.sessionId, p.key, p.solved]), [[practice.id, 'B', true]]);
  assert.equal((await service.practiceProblems(student)).length, 2, 'without a topic: every problem of open practice');
  assert.deepEqual(await service.practiceTopics(student), [
    { tag: 'arrays', count: 1 }, { tag: 'dp', count: 1 }, { tag: 'prefix-sums', count: 1 },
  ]);
});

test('practice by topic never lists a running exam, also not for its creator or an administrator (review)', async () => {
  const exam = sessionOf('EXAM', false, null); // created by t1
  const admin: Actor = { id: 'a1', role: 'ADMIN', name: 'Quản trị' };
  for (const actor of [owner, admin]) {
    assert.deepEqual(await assessment([exam]).practiceProblems(actor), [], actor.role);
    assert.deepEqual(await assessment([exam]).practiceTopics(actor), [], actor.role);
  }
});

test('học bạ counts attempted and solved per topic, leaving out a running test', async () => {
  const homework = sessionOf('HOMEWORK');
  const runningTest = sessionOf('TEST');
  const row = (sessionId: string, problemKey: string, solved: boolean): RecordProgress => ({
    userId: 's1', userDisplayName: 'Học sinh', sessionId, problemKey, bestScore: solved ? 100 : 20,
    solvedAt: solved ? new Date() : null, lastSubmittedAt: new Date(), attempts: 1,
  });
  const record = (s: Session): RecordSession => ({
    sessionId: s.id, title: s.snapshot.title, type: s.snapshot.type, classId: 'c1', className: 'Lớp', available: true, classDeleted: false,
    problems: s.snapshot.problems.map((p) => ({ key: p.key, title: p.title, points: p.points, tags: p.tags })),
  });
  const progress = [row(homework.id, 'A', true), row(homework.id, 'B', false), row(runningTest.id, 'B', true)];
  const service = assessment([homework, runningTest], progress, [record(homework), record(runningTest)]);
  const { topics } = await service.learningRecord(student);
  assert.deepEqual(topics, [
    { tag: 'arrays', attempted: 1, solved: 1 },
    { tag: 'dp', attempted: 1, solved: 0 },
    { tag: 'prefix-sums', attempted: 1, solved: 1 },
  ]);
});

test('records written before topics were copied (no tags) count nothing and break nothing', async () => {
  const homework = sessionOf('HOMEWORK');
  const old: RecordSession = {
    sessionId: homework.id, title: 'cũ', type: 'HOMEWORK', classId: 'c1', className: 'Lớp', available: true, classDeleted: false,
    problems: [{ key: 'A', title: 'Tổng', points: 10 }],
  };
  const progress: RecordProgress[] = [{ userId: 's1', userDisplayName: 'Học sinh', sessionId: homework.id, problemKey: 'A', bestScore: 100, solvedAt: new Date(), lastSubmittedAt: new Date(), attempts: 1 }];
  const record = await assessment([homework], progress, [old]).learningRecord(student);
  assert.deepEqual(record.topics, []);
  assert.equal(record.totals.solvedProblems, 1);
});

test('học bạ checks tests and exams with listing loads only, never a full load with hidden tests (review)', async () => {
  const runningTest = sessionOf('TEST');
  const record: RecordSession = {
    sessionId: runningTest.id, title: 't', type: 'TEST', classId: 'c1', className: 'Lớp', available: true, classDeleted: false,
    problems: runningTest.snapshot.problems.map((p) => ({ key: p.key, title: p.title, points: p.points, tags: p.tags })),
  };
  const progress: RecordProgress[] = [{ userId: 's1', userDisplayName: 'Học sinh', sessionId: runningTest.id, problemKey: 'A', bestScore: 100, solvedAt: new Date(), lastSubmittedAt: new Date(), attempts: 1 }];
  const service = assessment([runningTest], progress, [record]);
  assert.deepEqual((await service.learningRecord(student)).topics, []);
  assert.deepEqual(service.fullLoads, []);
});

// ------------------------------------------------------------------ tags reach sessions (review: the path was untested)

test('a session created from the bank copies each problem\'s topics, through the catalog facade and adapter', async () => {
  const p = Problem.create(1, { id: 't1', name: 'Lan' }, content(['Mảng', 'Quy hoạch động']), ResourceLimits.of(1000, 256));
  p.addTestCase({ input: '1', expectedOutput: '1', isSample: true, points: 1 });
  const problems = { findByIds: async (ids: string[]) => (ids.includes(p.id) ? [p] : []) } as unknown as ProblemRepository;
  const catalog = new CatalogProblemCatalog(new CatalogFacade(problems, {} as never, new UnshareChecks()));
  const sessions: Session[] = [];
  const service = assessment(sessions, [], [], catalog);
  await service.create(owner, { source: { kind: 'PROBLEM', problemId: p.id }, classId: null, opensAt: null, closesAt: null });
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].snapshot.problems[0].tags, ['arrays', 'dp']);
  assert.deepEqual(service.records[0].problems[0].tags, ['arrays', 'dp'], 'and the learning record copy');

  // "Refresh from the bank" brings changed topics too.
  p.update(content(['Tham lam']), ResourceLimits.of(1000, 256));
  await service.refresh(owner, sessions[0].id);
  assert.deepEqual(sessions[0].snapshot.problems[0].tags, ['greedy']);
});

test('a stored session row without tags (created before OJ-20) reads as no topics', () => {
  const s = sessionOf('HOMEWORK');
  const row = {
    id: s.id, title: 'cũ', description: '', type: 'HOMEWORK', classId: 'c1', sourceSetId: null, assignmentKey: null,
    opensAt: null, closesAt: null, settings: { durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: null, feedback: 'FULL' },
    createdById: 't1', createdByName: 'Lan', createdAt: new Date(), retiredKeys: [],
    problems: s.snapshot.problems.map(({ testCases: _t, tags: _tags, ...p }) => p),
  };
  assert.deepEqual(toSession(row as never, {}).snapshot.problems.map((p) => p.tags), [[], []]);
});

test('the backfill fills missing session topics from the bank, keeps frozen ones, and repeats as a no-op', () => {
  const bank = new Map([['p1', ['arrays']], ['p2', ['dp']]]);
  const old = [{ sourceProblemId: 'p1', key: 'A' }, { sourceProblemId: 'p2', key: 'B', tags: ['greedy'] }, { sourceProblemId: 'gone', key: 'C' }];
  const filled = backfillSessionProblems(old, bank)!;
  assert.deepEqual(filled.map((p) => p.tags), [['arrays'], ['greedy'], []]);
  assert.equal(backfillSessionProblems(filled, bank), null);
  const record = backfillRecordProblems([{ key: 'A', title: 't', points: 1 }], new Map([['A', ['arrays']]]))!;
  assert.deepEqual(record[0].tags, ['arrays']);
  assert.equal(backfillRecordProblems(record, new Map()), null);
});

// ------------------------------------------------------------------ tag rules from the review

test('a tag typed with combining marks (NFD) and with precomposed letters (NFC) is one tag', () => {
  const nfc = 'Thi học sinh giỏi'.normalize('NFC');
  assert.equal(normalizeTag(nfc.normalize('NFD')), normalizeTag(nfc));
  assert.equal(normalizeTag(nfc.normalize('NFD')), 'thi học sinh giỏi'.normalize('NFC'));
});

test('tags from before the 40-character limit: copying still works, and the script cuts them', () => {
  const long = 'x'.repeat(60);
  const p = Problem.create(1, { id: 't1', name: 'Lan' }, content(['dp']), ResourceLimits.of(1000, 256));
  const legacy = Problem.rehydrate(p.id, { ...(p as unknown as { state: object }).state, content: { ...p.content, tags: ['dp', long] } } as never);
  const copy = legacy.copyFor({ id: 't1', role: 'TEACHER', name: 'Lan' }, 2);
  assert.deepEqual(copy.content.tags, ['dp', 'x'.repeat(40)]);
  assert.deepEqual(retagged([{ id: 'a', tags: ['dp', long] }])[0].to, ['dp', 'x'.repeat(40)]);
});
