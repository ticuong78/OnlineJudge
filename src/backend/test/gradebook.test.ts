import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGradebook, type GradebookSession } from '../src/modules/assessment/application/gradebook.js';
import { GradebookService } from '../src/modules/assessment/application/gradebook.service.js';
import { ClassAccess, LearningRecordStore, type ClassInfo, type RecordProgress } from '../src/modules/assessment/application/ports.js';
import { addPoints, earnedPoints } from '../src/modules/assessment/application/scoring.js';
import { SessionRepository } from '../src/modules/assessment/domain/repositories.js';
import { Session } from '../src/modules/assessment/domain/session.js';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';

const day = (d: number) => new Date(Date.UTC(2026, 10, d));
const hw = (id: string, opens: number, problems: { key: string; points: number }[]): GradebookSession => ({
  id, title: `Phiên ${id}`, type: 'HOMEWORK', opensAt: day(opens), closesAt: null, createdAt: day(1), problems,
});
const progress = (userId: string, sessionId: string, problemKey: string, bestScore: number, name = userId): RecordProgress => ({
  userId, userDisplayName: name, sessionId, problemKey, bestScore, solvedAt: bestScore === 100 ? day(5) : null, lastSubmittedAt: day(5), attempts: 1,
});
const roster = [{ id: 'an', displayName: 'An' }, { id: 'binh', displayName: 'Bình' }];

// ------------------------------------------------------------------ the points rule

test('earned points: best score percent of the problem points, to 0.01, as on the results page (OJ-31)', () => {
  assert.equal(earnedPoints(40, 33.33), 13.33);
  assert.equal(earnedPoints(60, 100), 60);
  assert.equal(earnedPoints(30, 0), 0);
  assert.equal(addPoints(0.1, 0.2), 0.3, 'no floating drift');
});

// ------------------------------------------------------------------ the builder

test('a cell is the session total: best score per problem, summed (OJ-31)', () => {
  const book = buildGradebook('c', [hw('s1', 2, [{ key: 'A', points: 40 }, { key: 'B', points: 60 }])], roster, new Set(), [
    progress('an', 's1', 'A', 33.33),
    progress('an', 's1', 'B', 100),
  ]);
  assert.equal(book.rows.find((r) => r.userId === 'an')!.scores.s1, 73.33);
  assert.equal(book.sessions[0].maxPoints, 100);
});

test('a student who never submitted in a session has null there, not 0 (OJ-31)', () => {
  const book = buildGradebook('c', [hw('s1', 2, [{ key: 'A', points: 100 }])], roster, new Set(), [progress('an', 's1', 'A', 50)]);
  assert.equal(book.rows.find((r) => r.userId === 'binh')!.scores.s1, null);
});

test('a retired problem key and a session outside the list do not count (OJ-31)', () => {
  const book = buildGradebook('c', [hw('s1', 2, [{ key: 'A', points: 100 }])], roster, new Set(), [
    progress('an', 's1', 'A', 50),
    progress('an', 's1', 'Z', 100),
    progress('an', 'other', 'A', 100),
  ]);
  assert.deepEqual(book.rows.find((r) => r.userId === 'an')!.scores, { s1: 50 });
});

test('former students with a score stay, marked and listed last; staff who tried a problem are left out (OJ-31)', () => {
  const book = buildGradebook('c', [hw('s1', 2, [{ key: 'A', points: 100 }])], roster, new Set(['cuong']), [
    progress('cuong', 's1', 'A', 100, 'Cường'),
    progress('teacher', 's1', 'A', 100, 'Cô Lan'),
  ]);
  assert.deepEqual(book.rows.map((r) => [r.displayName, r.left]), [['An', false], ['Bình', false], ['Cường', true]]);
});

test('sessions are oldest first; a session with no opening time sorts by when it was created (OJ-31)', () => {
  const late = hw('late', 20, []);
  const early = hw('early', 3, []);
  const atOnce = { ...hw('atOnce', 0, []), opensAt: null, createdAt: day(10) };
  const book = buildGradebook('c', [late, atOnce, early], [], new Set(), []);
  assert.deepEqual(book.sessions.map((s) => s.id), ['early', 'atOnce', 'late']);
});

// ------------------------------------------------------------------ the use case: access and which sessions

const CLASS = '11111111-0000-4000-8000-000000000001';
const teacher: Actor = { id: 'lan', role: 'TEACHER', name: 'Cô Lan' };
const other: Actor = { id: 'minh', role: 'TEACHER', name: 'Thầy Minh' };
const student: Actor = { id: 'an', role: 'STUDENT', name: 'An' };

class FakeClasses extends ClassAccess {
  async getClasses(ids: string[]) {
    return new Map<string, ClassInfo>(ids.filter((i) => i === CLASS).map((i) => [i, { id: i, name: '10A1', teacherId: 'lan', status: 'ACTIVE' }]));
  }
  async managedClassIds() { return [CLASS]; }
  async canManage(actor: Actor, classId: string) { return classId === CLASS && (actor.role === 'ADMIN' || actor.id === 'lan'); }
  async membership(userId: string) { return userId === 'cuong' ? ('former' as const) : null; }
  async classIdsOfStudent() { return [CLASS]; }
  async currentStudents() { return roster; }
}

function sessionAt(id: string, opensAt: Date | null): Session {
  return Session.rehydrate(id, {
    title: id, description: '', type: 'TEST', classId: CLASS, sourceSetId: null, assignmentKey: null,
    window: { opensAt, closesAt: null, stateAt: (now: Date) => (opensAt && now < opensAt ? 'UPCOMING' : 'OPEN') },
    settings: {}, createdBy: { id: 'lan', name: 'Cô Lan' },
    problems: [{ key: 'A', points: 100, title: 'A' }], retiredKeys: [], createdAt: day(1),
  } as never);
}

function service() {
  const sessions = { findByClass: async () => [sessionAt('open', day(2)), sessionAt('upcoming', day(30))] } as unknown as SessionRepository;
  const asked: string[][] = [];
  const record = {
    progressOfSessions: async (ids: string[]) => {
      asked.push(ids);
      return [progress('an', 'open', 'A', 100)];
    },
  } as unknown as LearningRecordStore;
  return { svc: new GradebookService(sessions, new FakeClasses(), record), asked };
}
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

test('only the class managers and admins get the gradebook; an unknown class is not found (OJ-31)', async () => {
  const { svc } = service();
  assert.equal(await code(svc.gradebook(teacher, CLASS, day(10))), 'ok');
  assert.equal(await code(svc.gradebook({ id: 'root', role: 'ADMIN', name: 'Admin' }, CLASS, day(10))), 'ok');
  assert.equal(await code(svc.gradebook(other, CLASS, day(10))), 'assessment.not_class_teacher');
  assert.equal(await code(svc.gradebook(student, CLASS, day(10))), 'assessment.not_class_teacher');
  assert.equal(await code(svc.gradebook(teacher, '11111111-0000-4000-8000-000000000999', day(10))), 'classroom.not_found');
});

test('a session that has not opened is not a column and its progress is not read (OJ-31)', async () => {
  const { svc, asked } = service();
  const book = await svc.gradebook(teacher, CLASS, day(10));
  assert.deepEqual(book.sessions.map((s) => s.id), ['open']);
  assert.deepEqual(asked, [['open']]);
  assert.equal(book.rows.find((r) => r.userId === 'an')!.scores.open, 100);
});
