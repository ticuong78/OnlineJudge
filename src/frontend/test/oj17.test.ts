import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionResultsDto } from '@oj/contracts';
import { clampSplit, FONT_SIZES, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN, stepFontSize } from '../src/lib/editor-prefs';
import { solvedByProblem, sortResults } from '../src/lib/results';

// OJ-17: editor comfort on the solve page, and the results board.

test('font size steps through the offered sizes and stops at both ends', () => {
  assert.equal(stepFontSize(14, 1), 15);
  assert.equal(stepFontSize(14, -1), 13);
  assert.equal(stepFontSize(FONT_SIZES[0], -1), FONT_SIZES[0]);
  assert.equal(stepFontSize(20, 1), 20);
  assert.equal(stepFontSize(17, 1), 20, 'a stored size between steps moves to the next offered one');
});

test('the statement/editor split stays usable on both sides', () => {
  assert.equal(clampSplit(10), SPLIT_MIN);
  assert.equal(clampSplit(90), SPLIT_MAX);
  assert.equal(clampSplit(42.345), 42.3);
  assert.equal(clampSplit(Number.NaN), SPLIT_DEFAULT, 'a damaged stored value falls back to half and half');
});

const problems: SessionResultsDto['problems'] = [
  { key: 'A', code: 'P1', title: 'A', points: 50 },
  { key: 'B', code: 'P2', title: 'B', points: 50 },
];
const row = (displayName: string, a: number, b: number, last: string | null): SessionResultsDto['rows'][number] => ({
  userId: displayName,
  displayName,
  total: a + b,
  solvedCount: Number(a === 50) + Number(b === 50),
  completed: a === 50 && b === 50,
  scores: { A: a, B: b },
  lastSubmissionAt: last,
});
const rows = [
  row('Bình', 50, 0, '2026-11-13T08:00:00Z'),
  row('An', 50, 50, '2026-11-13T09:00:00Z'),
  row('Châu', 0, 50, null),
  row('Dũng', 50, 0, '2026-11-13T07:00:00Z'),
];

test('the results board sorts by any column, with the name breaking ties', () => {
  const names = (r: typeof rows) => r.map((x) => x.displayName);
  assert.deepEqual(names(sortResults(rows, { by: 'total' }, 'desc')), ['An', 'Bình', 'Châu', 'Dũng']);
  assert.deepEqual(names(sortResults(rows, { by: 'name' }, 'asc')), ['An', 'Bình', 'Châu', 'Dũng']);
  assert.deepEqual(names(sortResults(rows, { by: 'problem', key: 'B' }, 'desc')), ['An', 'Châu', 'Bình', 'Dũng']);
  assert.deepEqual(names(sortResults(rows, { by: 'last' }, 'desc')), ['An', 'Bình', 'Dũng', 'Châu']);
  assert.notEqual(sortResults(rows, { by: 'total' }, 'desc'), rows, 'a copy: the loaded data is not reordered');
});

test('"solved by" counts students with full points on each problem', () => {
  assert.deepEqual(solvedByProblem(rows, problems), { A: 3, B: 2 });
});
