import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClassGradebookDto } from '@oj/contracts';
import { csvCell } from '../src/lib/csv';
import { gradebookCsv, gradebookView } from '../src/lib/gradebook';

const book: ClassGradebookDto = {
  classId: 'c',
  sessions: [
    { id: 'hw', title: 'BTVN tuần 1', type: 'HOMEWORK', opensAt: null, closesAt: null, maxPoints: 100 },
    { id: 'ex', title: 'Thi học kỳ I', type: 'EXAM', opensAt: null, closesAt: null, maxPoints: 100 },
  ],
  rows: [
    { userId: 'chi', displayName: 'Vũ Ngọc Chi', left: false, scores: { hw: 73.33, ex: null } },
    { userId: 'bao', displayName: 'Hoàng Gia Bảo', left: false, scores: { hw: 100, ex: 40 } },
    { userId: 'cuong', displayName: 'Cường', left: true, scores: { hw: 20, ex: null } },
  ],
};

test('totals over every session; never submitted counts 0 (OJ-31)', () => {
  const view = gradebookView(book, []);
  const chi = view.rows.find((r) => r.userId === 'chi')!;
  assert.deepEqual([chi.earned, chi.possible, chi.percent], [73.33, 200, 36.67]);
});

test('filtering by type keeps those columns and recomputes the totals (OJ-31)', () => {
  const view = gradebookView(book, ['EXAM']);
  assert.deepEqual(view.sessions.map((s) => s.id), ['ex']);
  const bao = view.rows.find((r) => r.userId === 'bao')!;
  assert.deepEqual([bao.earned, bao.possible, bao.percent], [40, 100, 40]);
});

test('no sessions of the chosen type: possible is 0 and the percent is empty, not NaN (OJ-31)', () => {
  const view = gradebookView(book, ['PRACTICE']);
  assert.equal(view.sessions.length, 0);
  assert.ok(view.rows.every((r) => r.possible === 0 && r.percent === null));
});

test('sorting by total puts the highest first and keeps the server order by name otherwise (OJ-31)', () => {
  assert.deepEqual(gradebookView(book, [], 'total').rows.map((r) => r.userId), ['bao', 'chi', 'cuong']);
  assert.deepEqual(gradebookView(book, []).rows.map((r) => r.userId), ['chi', 'bao', 'cuong']);
});

test('the CSV has one row per shown student and one column per shown session, then the totals (OJ-31)', () => {
  const labels = { index: 'STT', student: 'Học sinh', left: 'đã rời lớp', earned: 'Điểm', possible: 'Tối đa', percent: '%' };
  const csv = gradebookCsv(gradebookView(book, ['HOMEWORK']), labels, (n) => String(n));
  assert.ok(csv.startsWith('﻿'), 'BOM for Excel');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 1 + book.rows.length);
  assert.equal(lines[0], '"STT","Học sinh","BTVN tuần 1","Điểm","Tối đa","%"');
  assert.equal(lines[1], '"1","Vũ Ngọc Chi","73.33","73.33","100","73.33"');
  assert.equal(lines[3], '"3","Cường (đã rời lớp)","20","20","100","20"');
});

test('a never-submitted cell is empty in the CSV, not 0 (OJ-31)', () => {
  const labels = { index: '#', student: 's', left: 'l', earned: 'e', possible: 'p', percent: '%' };
  const lines = gradebookCsv(gradebookView(book, ['EXAM']), labels, String).slice(1).split('\r\n');
  assert.equal(lines[1], '"1","Vũ Ngọc Chi","","0","100","0"');
});

// ------------------------------------------------------------------ CSV formula injection (OJ-31 security review)

test('a display name or title that starts like a formula is written as text, in every CSV (OJ-31)', () => {
  const evil: ClassGradebookDto = {
    classId: 'c',
    sessions: [{ id: 's', title: '@SUM(1)', type: 'TEST', opensAt: null, closesAt: null, maxPoints: 10 }],
    rows: ['=HYPERLINK("http://x.example","a")', '+1', '-2', '\tx', 'Bình thường'].map((name, i) => ({
      userId: `u${i}`, displayName: name, left: false, scores: { s: 5 },
    })),
  };
  const labels = { index: '#', student: 's', left: 'l', earned: 'e', possible: 'p', percent: '%' };
  const csv = gradebookCsv(gradebookView(evil, []), labels, String);
  const lines = csv.slice(1).split('\r\n').slice(1);
  const cells = [`"'=HYPERLINK(""http://x.example"",""a"")"`, `"'+1"`, `"'-2"`, `"'\tx"`, '"Bình thường"'];
  cells.forEach((cell, i) => assert.ok(lines[i].startsWith(`"${i + 1}",${cell},`), lines[i]));
  assert.ok(csv.includes(`"'@SUM(1)"`), 'session titles too');
  assert.ok(csv.includes('"5"'), 'numbers are untouched');
});

test('csvCell leaves numbers alone, even negative ones, and quotes safely (OJ-31)', () => {
  assert.equal(csvCell(-3), '"-3"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=1+1'), `"'=1+1"`);
});
