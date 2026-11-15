import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionDto } from '@oj/contracts';
import { DEFAULT_SETTINGS, defaultSettingsFor } from '../src/lib/exam';
import { studentOpenSessions } from '../src/lib/sessions';

const session = (id: string, x: Partial<SessionDto>) =>
  ({ id, state: 'OPEN', canSubmit: true, needsStart: false, closesAt: null, opensAt: null, createdAt: '2026-01-01', myProgress: { completed: false, solvedKeys: [] }, ...x }) as unknown as SessionDto;

test('OJ-11: an open timed exam the student has not started is listed, first, with the sessions still to do', () => {
  const list = studentOpenSessions([
    session('homework', { closesAt: '2026-11-09T10:00:00Z' }),
    session('exam', { canSubmit: false, needsStart: true, closesAt: '2026-11-20T10:00:00Z' }),
    session('done', { myProgress: { completed: true, solvedKeys: ['A'] } as SessionDto['myProgress'] }),
    session('time-up', { canSubmit: false, needsStart: false }),
    session('upcoming', { state: 'UPCOMING', canSubmit: false, needsStart: true }),
  ]);
  assert.deepEqual(list.map((s) => s.id), ['exam', 'homework']);
});

test('OJ-11: assigning an exam or test set starts from exam settings; other sets and single problems stay open', () => {
  assert.deepEqual(defaultSettingsFor('EXAM'), { ...DEFAULT_SETTINGS, durationMinutes: 90, maxSubmissionsPerProblem: 3, feedback: 'HIDDEN_UNTIL_CLOSED', checkPlagiarism: true });
  assert.deepEqual(defaultSettingsFor('TEST'), { ...DEFAULT_SETTINGS, durationMinutes: 45, maxSubmissionsPerProblem: 3, feedback: 'SCORE_ONLY', checkPlagiarism: true });
  for (const t of ['HOMEWORK', 'PRACTICE', undefined] as const) assert.deepEqual(defaultSettingsFor(t), DEFAULT_SETTINGS);
});
