import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEmptySync, Session, SessionSettings, TimeWindow, type SetItemSnapshot } from '../src/modules/assessment/domain/session.js';

const content = (id: string, title: string, statement = 'Đề') => ({
  sourceProblemId: id, code: `P-${id}`, title, difficulty: 'EASY' as const, tags: [] as string[],
  statement, inputFormat: '', outputFormat: '', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256,
  testCases: [{ input: '1', expectedOutput: '1', isSample: true, points: 1 }],
});
const item = (id: string, title: string, points: number, statement?: string): SetItemSnapshot => ({ content: content(id, title, statement), points });

function given() {
  return Session.create({
    title: 'Đề 1', description: '', type: 'TEST', classId: 'c1', sourceSetId: 's1', assignmentKey: null,
    window: TimeWindow.of(null, null), settings: SessionSettings.defaults, createdBy: { id: 't1', name: 'Lan' },
    problems: [
      { ...content('p1', 'Tổng'), points: 30 },
      { ...content('p2', 'Hiệu'), points: 30 },
      { ...content('p3', 'Tích'), points: 40 },
    ],
  });
}

test('a session matching its set has nothing to sync', () => {
  const s = given();
  assert.ok(isEmptySync(s.planSync([item('p1', 'Tổng', 30), item('p2', 'Hiệu', 30), item('p3', 'Tích', 40)])));
});

test('sync follows the set: added, removed, order, points, content', () => {
  const s = given();
  // Set now: Tích (50 points, new statement), Tổng, Thương (new). Hiệu was removed.
  const items = [item('p3', 'Tích', 50, 'Đề mới'), item('p1', 'Tổng', 30), item('p4', 'Thương', 20)];
  const preview = s.planSync(items);
  assert.equal(s.snapshot.problems.length, 3, 'a preview changes nothing');

  const plan = s.syncWith(items);
  assert.deepEqual(plan, preview);
  assert.deepEqual(plan.added, [{ code: 'P-p4', title: 'Thương', points: 20 }]);
  assert.deepEqual(plan.removed, [{ key: 'B', code: 'P-p2', title: 'Hiệu' }]);
  assert.deepEqual(plan.pointsChanged, [{ key: 'C', title: 'Tích', from: 40, to: 50 }]);
  assert.deepEqual(plan.contentChanged, [{ key: 'C', title: 'Tích' }]);
  assert.equal(plan.reordered, true);

  // Kept problems keep their key; the removed key B is never reused, so the new problem gets D.
  assert.deepEqual(s.snapshot.problems.map((p) => [p.key, p.title, p.points]), [['C', 'Tích', 50], ['A', 'Tổng', 30], ['D', 'Thương', 20]]);
  assert.equal(s.problem('C').statement, 'Đề mới');
  assert.equal(s.findProblem('B'), undefined);
  assert.deepEqual(s.snapshot.retiredKeys, ['B']);
  assert.equal(s.totalPoints, 100);

  // Syncing again: the next new problem skips the retired B as well.
  s.syncWith([...items, item('p5', 'Dư', 10)]);
  assert.equal(s.problem('E').title, 'Dư');
});

test('a set left empty cannot empty the session', () => {
  assert.throws(() => given().syncWith([]), /ít nhất một bài/);
});
