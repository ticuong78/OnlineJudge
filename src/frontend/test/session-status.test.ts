import assert from 'node:assert/strict';
import { test } from 'node:test';
import { problemStatus } from '../src/lib/session-status';

const student = { manager: false, hidden: false, solved: false, best: undefined, submissions: 0, points: 40 };

test('a teacher sees the class progress per problem, never their own empty progress (OJ-34)', () => {
  assert.deepEqual(problemStatus({ ...student, manager: true, classProgress: { solved: 5, total: 8 } }), { kind: 'class', solved: 5, total: 8 });
  // While the results load: nothing yet, rather than "Chưa làm".
  assert.equal(problemStatus({ ...student, manager: true }), null);
});

test("a student's labels are unchanged (OJ-34)", () => {
  assert.deepEqual(problemStatus(student), { kind: 'notStarted' });
  assert.deepEqual(problemStatus({ ...student, solved: true }), { kind: 'solved' });
  assert.deepEqual(problemStatus({ ...student, best: 33.33 }), { kind: 'best', earned: 13.33, max: 40 });
  assert.deepEqual(problemStatus({ ...student, hidden: true, submissions: 2 }), { kind: 'hidden', submissions: 2 });
  assert.deepEqual(problemStatus({ ...student, hidden: true }), { kind: 'notStarted' });
});
