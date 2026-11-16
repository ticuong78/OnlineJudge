import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentSubmissionsHref } from '../src/lib/results-links';

const SESSION = '4f9c1a52-0000-4000-8000-000000000001';
const STUDENT = '7d1e2f30-0000-4000-8000-000000000002';

test("a student's link carries the session and the student, and nothing else (OJ-30)", () => {
  const url = new URL(studentSubmissionsHref(SESSION, STUDENT), 'http://x');
  assert.equal(url.pathname, '/submissions');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['sessionId', 'userId']);
  assert.equal(url.searchParams.get('sessionId'), SESSION);
  assert.equal(url.searchParams.get('userId'), STUDENT);
});

test('a problem key is added and encoded when given (OJ-30)', () => {
  const url = new URL(studentSubmissionsHref(SESSION, STUDENT, 'A&B'), 'http://x');
  assert.equal(url.searchParams.get('problemKey'), 'A&B');
  assert.equal(url.searchParams.get('userId'), STUDENT, 'the key cannot inject another parameter');
});
