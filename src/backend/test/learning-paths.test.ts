import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PATHS_PAGE_SIZE, type ProblemSetType } from '@oj/contracts';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PathListQuery } from '../src/modules/assessment/presentation/assessment.controllers.js';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import type { RecordProgress } from '../src/modules/assessment/application/ports.js';
import { LearningPathService } from '../src/modules/assessment/application/learning-path.service.js';
import { LearningPath, type LearningPathContent } from '../src/modules/assessment/domain/learning-path.js';
import { LearningPathRepository, type PathPage } from '../src/modules/assessment/domain/repositories.js';
import { Session, SessionSettings, TimeWindow, type SessionProblem } from '../src/modules/assessment/domain/session.js';

/** OJ-24: learning paths. */

const codeOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const HOUR = 3_600_000;
const teacher: Actor = { id: 't1', role: 'TEACHER', name: 'Lan' };
const other: Actor = { id: 't2', role: 'TEACHER', name: 'Minh' };
const student: Actor = { id: 's1', role: 'STUDENT', name: 'Học sinh' };
const admin: Actor = { id: 'a1', role: 'ADMIN', name: 'Quản trị' };

function session(
  title: string,
  { type = 'PRACTICE', classId = null, hideTopics = false, closed = false }: { type?: ProblemSetType; classId?: string | null; hideTopics?: boolean; closed?: boolean } = {},
) {
  const problem = (id: string, t: string, tags: string[]): Omit<SessionProblem, 'key'> => ({
    sourceProblemId: id, code: id, title: t, difficulty: 'EASY', tags, points: 10, statement: '', inputFormat: '',
    outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256, testCases: [{ input: '1', expectedOutput: '1', isSample: true, points: 10 }],
  });
  const now = Date.now();
  return Session.create({
    title, description: '', type, classId, sourceSetId: null, assignmentKey: null,
    window: closed ? TimeWindow.of(new Date(now - 2 * HOUR), new Date(now - HOUR)) : TimeWindow.of(null, null),
    settings: SessionSettings.of({ durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: null, feedback: 'FULL', hideTopics }),
    createdBy: { id: 't1', name: 'Lan' },
    problems: [problem(`${title}-1`, `${title} dễ`, ['dp']), problem(`${title}-2`, `${title} khó`, ['dp', 'arrays'])],
  });
}

class MemoryPaths extends LearningPathRepository {
  readonly rows = new Map<string, LearningPath>();
  async findById(id: string) { return this.rows.get(id) ?? null; }
  async list(f: { publicOnly?: boolean; ownerId?: string }, { limit, before }: PathPage) {
    // Same order as the database: createdAt DESC, then id DESC; strictly after the cursor.
    const key = (p: LearningPath) => [p.snapshot.createdAt.getTime(), p.id] as const;
    const after = (p: LearningPath) => {
      if (!before) return true;
      const [t, id] = key(p);
      return t < before.createdAt.getTime() || (t === before.createdAt.getTime() && id < before.id);
    };
    return [...this.rows.values()]
      .filter((p) => (!f.publicOnly || p.snapshot.isPublic) && (!f.ownerId || p.snapshot.owner.id === f.ownerId) && after(p))
      .sort((a, b) => b.snapshot.createdAt.getTime() - a.snapshot.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }
  async save(p: LearningPath) { this.rows.set(p.id, p); }
  async delete(id: string) { this.rows.delete(id); }
}

function setup(sessions: Session[], progress: RecordProgress[] = []) {
  const paths = new MemoryPaths();
  const repo = { findListing: async (ids: string[]) => sessions.filter((s) => ids.includes(s.id)) };
  const record = { progressOfUser: async (u: string, ids?: string[]) => progress.filter((p) => p.userId === u && (!ids || ids.includes(p.sessionId))) };
  return { paths, service: new LearningPathService(paths, repo as never, record as never) };
}

const content = (sessions: Session[], over: Partial<LearningPathContent> = {}) => ({
  title: '  Quy hoạch động từ dễ đến khó ', description: 'Từng bước.', topic: 'Quy hoạch động', isPublic: true,
  steps: sessions.map((s, i) => ({ sessionId: s.id, title: `Bước ${i + 1}`, note: i ? 'Thêm một chiều.' : 'Làm quen.' })),
  ...over,
});
const solvedRow = (sessionId: string, problemKey: string): RecordProgress => ({
  userId: 's1', userDisplayName: 'HS', sessionId, problemKey, bestScore: 100, solvedAt: new Date(), lastSubmittedAt: new Date(), attempts: 1,
});

// ------------------------------------------------------------------ rules

test('a path is built from public practice or homework sessions only; class sessions and tests are refused', async () => {
  const practice = session('A');
  const homework = session('B', { type: 'HOMEWORK' });
  const classOnly = session('C', { classId: 'class-1' });
  const exam = session('D', { type: 'EXAM' });
  const { service } = setup([practice, homework, classOnly, exam]);
  const created = await service.create(teacher, content([practice, homework]));
  assert.equal(created.title, 'Quy hoạch động từ dễ đến khó', 'trimmed');
  assert.equal(created.topic, 'dp', 'the topic is normalised like a tag');
  assert.equal(await codeOf(service.create(teacher, content([practice, classOnly]))), 'assessment.path_step_not_public');
  assert.equal(await codeOf(service.create(teacher, content([exam]))), 'assessment.path_step_not_public');
  assert.equal(await codeOf(service.create(teacher, content([practice], { steps: [] }))), 'assessment.invalid_path_steps');
  assert.equal(await codeOf(service.create(teacher, content([practice, practice]))), 'assessment.duplicate_path_step');
  assert.equal(await codeOf(service.create(student, content([practice]))), 'assessment.not_staff');
  const unknown = { ...content([practice]), steps: [{ sessionId: '00000000-0000-4000-8000-000000000000', title: 'x', note: '' }] };
  assert.equal(await codeOf(service.create(teacher, unknown)), 'assessment.path_step_missing', 'a session that does not exist');
});

test('only the owner or an administrator can edit or delete; a private path is not found for anyone else', async () => {
  const practice = session('A');
  const { service } = setup([practice]);
  const draft = await service.create(teacher, content([practice], { isPublic: false }));
  assert.equal(await codeOf(service.get(student, draft.id)), 'assessment.path_not_found');
  assert.equal(await codeOf(service.get(other, draft.id)), 'assessment.path_not_found');
  assert.equal((await service.get(admin, draft.id)).canEdit, true);
  assert.deepEqual((await service.list(student, { scope: 'public' })).items, [], 'a private path is not listed');
  assert.equal((await service.list(teacher, { scope: 'mine' })).items.length, 1);
  assert.deepEqual(await service.list(student, { scope: 'mine' }), { items: [], next: null }, 'students have no paths of their own');

  const published = await service.update(teacher, draft.id, content([practice], { isPublic: true }));
  assert.equal((await service.get(student, published.id)).canEdit, false);
  assert.equal(await codeOf(service.update(other, draft.id, content([practice]))), 'assessment.not_path_owner');
  assert.equal(await codeOf(service.delete(other, draft.id)), 'assessment.not_path_owner');
  assert.equal(await codeOf(service.delete(admin, draft.id)), 'ok');
  assert.equal(await codeOf(service.get(teacher, draft.id)), 'assessment.path_not_found');
});

// ------------------------------------------------------------------ what a student sees

test('a student sees their progress per step and the next unsolved problem', async () => {
  const step1 = session('A');
  const step2 = session('B');
  const { service } = setup([step1, step2], [solvedRow(step1.id, 'A'), solvedRow(step1.id, 'B'), solvedRow(step2.id, 'A')]);
  const path = await service.create(teacher, content([step1, step2]));
  const mine = await service.get(student, path.id);
  assert.deepEqual(mine.steps.map((s) => [s.solved, s.total]), [[2, 2], [1, 2]]);
  assert.deepEqual([mine.solved, mine.total], [3, 4]);
  assert.deepEqual(mine.next, { sessionId: step2.id, key: 'B', title: 'B khó', stepIndex: 1 });
  assert.deepEqual(mine.steps[0].problems.map((p) => p.tags), [['dp'], ['dp', 'arrays']], 'practice shows topics');
  const [summary] = (await service.list(student, { scope: 'public' })).items;
  assert.deepEqual([summary.solved, summary.total, summary.stepCount], [3, 4, 2]);
});

test('a review step (the session hides topics) shows no topics to students while open; the owner still sees them', async () => {
  const learn = session('A');
  const review = session('R', { hideTopics: true });
  const { service } = setup([learn, review]);
  const path = await service.create(teacher, content([learn, review]));
  const asStudent = await service.get(student, path.id);
  assert.equal(asStudent.steps[1].review, true);
  assert.deepEqual(asStudent.steps[1].problems.map((p) => p.tags), [[], []]);
  assert.deepEqual((await service.get(teacher, path.id)).steps[1].problems[0].tags, ['dp'], 'the session creator');
});

test('a step whose session is gone or closed stays listed; "next" skips it', async () => {
  const closed = session('A', { closed: true });
  const open = session('B');
  const sessions = [closed, open];
  const { service } = setup(sessions);
  const path = await service.create(teacher, content([closed, open]));
  sessions.splice(1, 1); // the second session is deleted later
  const view = await service.get(student, path.id);
  assert.deepEqual(view.steps.map((s) => [s.available, s.state]), [[true, 'CLOSED'], [false, 'CLOSED']]);
  assert.equal(view.next, null);
});

test('hideTopics: a practice session hides topics from students until it closes', () => {
  const s = session('A', { hideTopics: true });
  assert.equal(s.topicsVisibleTo(false, 'OPEN'), false);
  assert.equal(s.topicsVisibleTo(true, 'OPEN'), true);
  assert.equal(s.topicsVisibleTo(false, 'CLOSED'), true);
  assert.equal(session('B').topicsVisibleTo(false, 'OPEN'), true, 'off by default');
});

test('a review session (hideTopics) is never listed by practice by topic, so its topics are not given away', async () => {
  const { SessionService } = await import('../src/modules/assessment/application/session.service.js');
  const open = session('A');
  const review = session('R', { hideTopics: true });
  const repo = { list: async () => [open, review], findListing: async () => [] };
  const record = { progressOfUser: async () => [] };
  const service = new SessionService(repo as never, {} as never, {} as never, {} as never, {} as never, record as never, {} as never);
  assert.deepEqual((await service.practiceProblems(student)).map((p) => p.sessionId), [open.id, open.id]);
  assert.deepEqual(await service.practiceTopics(student), [{ tag: 'dp', count: 2 }, { tag: 'arrays', count: 1 }]);
});

test('học bạ does not count the topics of a running review session (hideTopics)', async () => {
  const { SessionService } = await import('../src/modules/assessment/application/session.service.js');
  const review = session('R', { hideTopics: true });
  const record = {
    progressOfUser: async () => [solvedRow(review.id, 'A')],
    getSessions: async () => new Map([[review.id, {
      sessionId: review.id, title: 'R', type: 'PRACTICE' as const, classId: null, className: null, available: true, classDeleted: false,
      problems: review.snapshot.problems.map((p) => ({ key: p.key, title: p.title, points: p.points, tags: p.tags })),
    }]]),
  };
  const repo = { findListing: async () => [review], findById: async () => review };
  const access = { getClasses: async () => new Map(), canManage: async () => false, membership: async () => null };
  const attempts = { find: async () => null, findForUser: async () => [] };
  const service = new SessionService(repo as never, attempts as never, {} as never, {} as never, access as never, record as never, {} as never);
  const result = await service.learningRecord(student);
  assert.deepEqual(result.topics, []);
  assert.equal(result.totals.solvedProblems, 1, 'the solve still counts, only its topic is hidden');
});

test('review N7/N2: links are removed from path text shown to students; an over-long topic is cut to the tag limit', async () => {
  const practice = session('A');
  const { service } = setup([practice]);
  const created = await service.create(teacher, {
    ...content([practice]),
    description: 'Xem thêm tại https://example.com/khoa-hoc rồi làm bài.',
    topic: 'x'.repeat(40),
    steps: [{ sessionId: practice.id, title: 'Bước 1', note: 'Tham gia nhóm Zalo https://zalo.me/g/abc để hỏi.' }],
  });
  assert.doesNotMatch(created.description, /https?:/);
  assert.doesNotMatch(created.steps[0].note, /https?:/);
  assert.ok((created.topic ?? '').length <= 40);
});

test('review S2: a step whose session is no longer public practice is shown as unavailable, without its problems', async () => {
  const practice = session('A');
  const sessions = [practice];
  const { service } = setup(sessions);
  const path = await service.create(teacher, content([practice]));
  sessions[0] = session('A', { classId: 'class-1' }); // as if the same id now pointed at a class session
  Object.defineProperty(sessions[0], 'id', { value: practice.id });
  const view = await service.get(student, path.id);
  assert.deepEqual([view.steps[0].available, view.steps[0].problems.length], [false, 0]);
});

test('OJ-27/28: pages chained by `next` list every public path once; mine stays scoped to the caller', async () => {
  const practice = session('A');
  const { service } = setup([practice]);
  for (let i = 0; i < PATHS_PAGE_SIZE + 3; i++) await service.create(teacher, content([practice], { title: `Lộ trình ${i}` }));
  await service.create(other, content([practice], { title: 'Của người khác' }));
  await service.create(teacher, content([practice], { title: 'Nháp', isPublic: false }));

  const first = await service.list(student, { scope: 'public' });
  assert.equal(first.items.length, PATHS_PAGE_SIZE, 'one default page');
  assert.ok(first.next);
  const rest = await service.list(student, { scope: 'public', before: first.next! });
  assert.equal(rest.items.length, 4, 'the remaining public paths, never the private one');
  assert.equal(rest.next, null, 'the last page says so');
  assert.equal(new Set([...first.items, ...rest.items].map((p) => p.id)).size, PATHS_PAGE_SIZE + 4);
  const mine = await service.list(other, { scope: 'mine', limit: 100 });
  assert.deepEqual(mine.items.map((p) => p.title), ['Của người khác']);
});

test('OJ-28 (R3): editing or removing paths between pages neither skips nor repeats one', async () => {
  const practice = session('A');
  const { service } = setup([practice]);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push((await service.create(teacher, content([practice], { title: `P${i}` }))).id);
  const page1 = await service.list(student, { scope: 'public', limit: 2 });
  // Meanwhile: an unseen path is edited (with offset paging by update time it jumped to the top and was never shown),
  // and a path already shown is removed (with offsets the next page shifted and skipped one).
  await service.update(teacher, ids[1], content([practice], { title: 'P1 sửa' }));
  await service.delete(teacher, page1.items[0].id);
  const seen = [...page1.items];
  for (let next = page1.next; next; ) {
    const page = await service.list(student, { scope: 'public', limit: 2, before: next });
    seen.push(...page.items);
    next = page.next;
  }
  assert.equal(seen.length, 6, 'every path that existed at the start, once');
  assert.equal(new Set(seen.map((p) => p.id)).size, 6);
});

test('OJ-28 (R12): no "next" when the total is an exact multiple of the page size; a bad cursor is a 400', async () => {
  const practice = session('A');
  const { service } = setup([practice]);
  for (let i = 0; i < 4; i++) await service.create(teacher, content([practice], { title: `P${i}` }));
  const first = await service.list(student, { scope: 'public', limit: 2 });
  const second = await service.list(student, { scope: 'public', limit: 2, before: first.next! });
  assert.equal(second.items.length, 2);
  assert.equal(second.next, null, 'no empty extra page behind a "show more" button');
  for (const bad of ['xyz', Buffer.from('not-a-date|x').toString('base64url'), Buffer.from(`${new Date().toISOString()}|${teacher.id}|x`).toString('base64url')]) {
    assert.equal(await codeOf(service.list(student, { scope: 'public', before: bad })), 'assessment.invalid_cursor');
  }
});

test('OJ-27: the query accepts a limit of 1 to 100 and a cursor string', () => {
  const errors = (q: Record<string, string>) => validateSync(plainToInstance(PathListQuery, q)).map((e) => e.property);
  assert.deepEqual(errors({ scope: 'public', limit: '24', before: 'abc' }), []);
  assert.deepEqual(errors({ before: 'x'.repeat(201) }), ['before']);
  assert.deepEqual(errors({ limit: '0' }), ['limit']);
  assert.deepEqual(errors({ limit: '101' }), ['limit']);
  assert.deepEqual(errors({ limit: 'abc' }), ['limit']);
});

