import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgetAllLastProblems, forgetLastProblem, readLastProblem, writeLastProblem } from '../src/lib/last-problem';

/** A tiny localStorage stand-in. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const last = (sessionId: string) => ({ sessionId, key: 'A', title: 'Tổng hai số', sessionTitle: 'Bài tập về nhà' });

test('K-2: the "Làm tiếp" shortcut belongs to the account that opened the problem', () => {
  const s = memoryStorage();
  writeLastProblem('student-1', last('s1'), s);
  assert.deepEqual(readLastProblem('student-1', s), last('s1'));
  assert.equal(readLastProblem('student-2', s), null, 'another student on the same computer sees nothing');
});

test('K-2: signing out forgets every shortcut, including the old shared one', () => {
  const s = memoryStorage();
  writeLastProblem('student-1', last('s1'), s);
  s.setItem('oj:lastSessionProblem', JSON.stringify(last('old'))); // written by earlier versions, for everyone
  s.setItem('oj:token', 'keep-me-not-a-shortcut');
  forgetAllLastProblems(s);
  assert.equal(readLastProblem('student-1', s), null);
  assert.equal(s.getItem('oj:lastSessionProblem'), null);
  assert.equal(s.getItem('oj:token'), 'keep-me-not-a-shortcut', 'other keys are untouched');
});

test('K-2: a problem that cannot be opened any more is dropped only if it is the remembered one', () => {
  const s = memoryStorage();
  writeLastProblem('student-1', last('s1'), s);
  forgetLastProblem('student-1', 's2', 'A', s);
  assert.ok(readLastProblem('student-1', s));
  forgetLastProblem('student-1', 's1', 'A', s);
  assert.equal(readLastProblem('student-1', s), null);
});

test('K-2: broken or missing storage never breaks the page', () => {
  const s = memoryStorage();
  s.setItem('oj:lastSessionProblem:student-1', '{not json');
  assert.equal(readLastProblem('student-1', s), null);
  assert.equal(readLastProblem('student-1', null), null);
  assert.doesNotThrow(() => writeLastProblem('student-1', last('s1'), null));
});
