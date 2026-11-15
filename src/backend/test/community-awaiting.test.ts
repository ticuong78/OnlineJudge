import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClassStatus, Role } from '@oj/contracts';
import type { Actor } from '../src/shared/application/actor.js';
import { AWAITING_LIMIT, CommunityService } from '../src/modules/community/application/community.service.js';
import { ClassMembership, SessionDirectory, ThreadRepository } from '../src/modules/community/application/ports.js';
import { Thread } from '../src/modules/community/domain/thread.js';

// OJ-13 review: the teacher home lists waiting questions with one request, scoped to the classes the caller runs.

class MemoryThreads extends ThreadRepository {
  constructor(readonly all: Thread[]) {
    super();
  }
  async findById(id: string) {
    return this.all.find((t) => t.id === id) ?? null;
  }
  async listByClass(classId: string) {
    return this.all.filter((t) => t.snapshot.classId === classId);
  }
  queries: { classIds: string[]; limit: number }[] = [];
  async listAwaitingQuestions(classIds: string[], limit: number) {
    this.queries.push({ classIds, limit });
    return this.all
      .filter((t) => t.awaitsAnswer && classIds.includes(t.snapshot.classId))
      .sort((a, b) => b.snapshot.createdAt.getTime() - a.snapshot.createdAt.getTime())
      .slice(0, limit);
  }
  async save() {}
  async delete() {}
  async deleteByClass() {}
}

class FakeClasses extends ClassMembership {
  constructor(private readonly managed: Record<string, string[] | 'ALL'>, private readonly byClass: Record<string, ClassStatus>) {
    super();
  }
  async status(classId: string) {
    return this.byClass[classId] ?? null;
  }
  async canManage() {
    return false;
  }
  async membership() {
    return null;
  }
  async activeManagedClassIds(actor: Actor) {
    const managed = this.managed[actor.id] ?? [];
    const ids = managed === 'ALL' ? Object.keys(this.byClass) : managed;
    return ids.filter((id) => this.byClass[id] === 'ACTIVE');
  }
}

class NoSessions extends SessionDirectory {
  async summary() {
    return null;
  }
}

const student = (id: string) => ({ id, name: id, role: 'STUDENT' as Role });
const question = (classId: string, title: string, at: string) => {
  const t = Thread.start({ classId, kind: 'QUESTION', title, body: 'Em bị WA', author: student('s'), topic: null });
  (t.snapshot as { createdAt: Date }).createdAt = new Date(at);
  return t;
};
const actor = (id: string, role: Role): Actor => ({ id, role, organizations: [] }) as unknown as Actor;

function setup() {
  const answered = question('c1', 'Đã trả lời', '2026-11-12T07:00:00Z');
  answered.reply({ id: 't1', name: 'Cô Lan', role: 'TEACHER' }, 'Kiểm tra tràn số');
  const threads = new MemoryThreads([
    question('c1', 'Cũ', '2026-11-10T08:00:00Z'),
    question('c1', 'Mới', '2026-11-12T08:00:00Z'),
    answered,
    question('c2', 'Lớp khác', '2026-11-12T09:00:00Z'),
    question('c3', 'Lớp đã lưu trữ', '2026-11-12T10:00:00Z'),
  ]);
  const classes = new FakeClasses(
    { t1: ['c1', 'c3'], admin: 'ALL' },
    { c1: 'ACTIVE', c2: 'ACTIVE', c3: 'ARCHIVED' },
  );
  return new CommunityService(threads, classes, new NoSessions());
}

test('a teacher sees only waiting questions from their own active classes, newest first', async () => {
  const list = await setup().awaiting(actor('t1', 'TEACHER'));
  assert.deepEqual(list.map((t) => t.title), ['Mới', 'Cũ'], 'not answered ones, not other classes, not archived ones');
  assert.ok(list.every((t) => t.awaitingAnswer));
});

test('an administrator sees waiting questions from every active class', async () => {
  const list = await setup().awaiting(actor('admin', 'ADMIN'));
  assert.deepEqual(list.map((t) => t.title), ['Lớp khác', 'Mới', 'Cũ']);
});

test('someone who runs no class gets nothing', async () => {
  assert.deepEqual(await setup().awaiting(actor('t9', 'TEACHER')), []);
});

test('OJ-26/28: at most the 50 newest, in one query over active classes only', async () => {
  const minute = (i: number) => new Date(Date.UTC(2026, 10, 12, 0, 0) + i * 60_000).toISOString();
  // The newest 150 questions are in an archived class; 60 older ones are in an active class.
  const archived = Array.from({ length: 150 }, (_, i) => question('old', `A${i}`, minute(1000 + i)));
  const active = Array.from({ length: 60 }, (_, i) => question('c1', `Q${i}`, minute(i)));
  const threads = new MemoryThreads([...archived, ...active]);
  const service = new CommunityService(threads, new FakeClasses({ admin: 'ALL' }, { c1: 'ACTIVE', old: 'ARCHIVED' }), new NoSessions());
  const list = await service.awaiting(actor('admin', 'ADMIN'));
  assert.equal(list.length, AWAITING_LIMIT);
  assert.equal(list[0].title, 'Q59', 'newest active question first');
  assert.ok(list.every((t) => t.title.startsWith('Q')));
  assert.deepEqual(threads.queries, [{ classIds: ['c1'], limit: AWAITING_LIMIT }], 'one query, archived classes left out up front');
});
