import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreTone } from '../src/lib/score-tone';

test('full points, some points and none read differently on the results board (OJ-33)', () => {
  assert.equal(scoreTone(0, 40), 'none');
  assert.equal(scoreTone(0.01, 40), 'partial');
  assert.equal(scoreTone(39.99, 40), 'partial');
  assert.equal(scoreTone(40, 40), 'full');
});

test('a problem worth 0 points, or a missing score, is never shown as solved (OJ-33)', () => {
  assert.equal(scoreTone(0, 0), 'none');
  assert.equal(scoreTone(Number.NaN, 40), 'none');
  assert.equal(scoreTone(-1, 40), 'none');
});

test('a score cell is named with the student, the problem and score/max, in both languages (OJ-33)', async () => {
  const { createTranslator } = await import('use-intl/core');
  const { MESSAGES } = await import('../src/i18n/messages');
  const args = { name: 'Vũ Ngọc Chi', n: 1, score: '13.33', max: '40' };
  for (const locale of ['vi', 'en'] as const) {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'session.results' });
    const label = t('cellScore', args);
    assert.ok(label.includes('Vũ Ngọc Chi'), `${locale}: ${label}`);
    assert.ok(label.includes('13.33/40'), `${locale}: ${label}`);
    assert.ok(label.includes('1'), `${locale}: ${label}`);
  }
});

const done = { status: 'DONE', resultsHidden: false, score: 33.33, sessionId: 'S1', problemKey: 'A' };

test('a submission reads as points out of the problem, with the percent beside it (OJ-33)', async () => {
  const { sessionPoints, submissionScore } = await import('../src/lib/score-tone');
  const points = sessionPoints('S1', { id: 'S1', problems: [{ key: 'A', points: 40 }, { key: 'B', points: 60 }] });
  assert.deepEqual(points, { sessionId: 'S1', points: { A: 40, B: 60 } });
  assert.deepEqual(submissionScore(done, points), { value: '13.33', unit: '/40', spoken: '13.33 trên 40 điểm', percent: '33.33%' });
  assert.deepEqual(submissionScore({ ...done, score: 20, problemKey: 'B' }, points)?.value, '12');
});

test('no score while judging or while results are hidden (OJ-33)', async () => {
  const { submissionScore } = await import('../src/lib/score-tone');
  assert.equal(submissionScore({ ...done, status: 'PENDING' }, undefined), null);
  assert.equal(submissionScore({ ...done, resultsHidden: true }, undefined), null);
});

test("without the right session's points, the percent alone: never another session's maximum (OJ-33)", async () => {
  const { sessionPoints, submissionScore } = await import('../src/lib/score-tone');
  const other = sessionPoints('S2', { id: 'S2', problems: [{ key: 'A', points: 60 }] });
  // The list switched to S2 while S2's own session is still loading: the old session's points are not used.
  assert.equal(sessionPoints('S2', { id: 'S1', problems: [{ key: 'A', points: 40 }] }), undefined);
  assert.deepEqual(submissionScore(done, other), { value: '33.33', unit: '%', spoken: '33.33% số điểm', percent: null });
  assert.deepEqual(submissionScore({ ...done, problemKey: 'Z' }, other)?.unit, '%');
  assert.deepEqual(submissionScore(done, undefined)?.unit, '%');
});
