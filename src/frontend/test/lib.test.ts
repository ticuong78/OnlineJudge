import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClassroomDto, SessionDto, SessionSettingsDto } from '@oj/contracts';
import { CLASS_CODE_RE, normalizeClassCode, splitStudentClasses, suggestClassCode } from '../src/lib/classes';
import { allowedLanguages, formatClock, integritySummary, isExamLike, settingsSummary, timerTarget } from '../src/lib/exam';
import { cannotSubmitReason, formatRemaining, isClosingSoon, solveHref, sortSessions } from '../src/lib/sessions';
import { cn, earnedPoints, formatMemory, formatPlanDate, formatPoints, localInputToIso, scoreLabel } from '../src/lib/utils';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------- scores (OJ-7: the student sees what the teacher sees)

test('earned points use the backend rounding, so student and teacher numbers match', () => {
  // session.service.ts: Math.round(points * bestScore) / 100
  for (const [percent, points] of [[33.33, 40], [77.78, 50], [20, 50], [100, 60], [0, 40], [66.67, 33]]) {
    assert.equal(earnedPoints(percent, points), Math.round(points * percent) / 100);
  }
  assert.equal(formatPoints(earnedPoints(33.33, 40)), '13.33');
  assert.equal(formatPoints(earnedPoints(100, 60)), '60');
});

test('K-1: the result card shows points when the problem\'s worth is known, otherwise an explicit percentage', () => {
  assert.deepEqual(scoreLabel(60, 60), { value: '36', unit: '/60', spoken: '36 trên 60 điểm' });
  assert.deepEqual(scoreLabel(33.33, 40), { value: '13.33', unit: '/40', spoken: '13.33 trên 40 điểm' });
  assert.deepEqual(scoreLabel(100, 40), { value: '40', unit: '/40', spoken: '40 trên 40 điểm' });
  assert.deepEqual(scoreLabel(60), { value: '60', unit: '%', spoken: '60% số điểm' });
  assert.deepEqual(scoreLabel(16.67, undefined), { value: '16.67', unit: '%', spoken: '16.67% số điểm' });
});

test('formatPoints: integers stay integers, decimals keep at most two places without trailing zeros', () => {
  assert.equal(formatPoints(48.89), '48.89');
  assert.equal(formatPoints(10.5), '10.5');
  assert.equal(formatPoints(10.0), '10');
  assert.equal(formatPoints(1 / 3), '0.33');
});

test('plan dates are shown as dd/mm/yyyy without a time-zone shift', () => {
  assert.equal(formatPlanDate('2026-12-31'), '31/12/2026');
  assert.equal(formatPlanDate('2026-01-01'), '01/01/2026');
  assert.equal(formatPlanDate('garbage'), 'garbage');
});

test('small formatters', () => {
  assert.equal(formatMemory(2048), '2.0 MB');
  assert.equal(formatMemory(512), '512 KB');
  assert.equal(formatMemory(null), '—');
  assert.equal(localInputToIso(''), null);
  assert.equal(localInputToIso('not a date'), null);
  assert.equal(cn('px-2', false, 'px-4'), 'px-4', 'later Tailwind classes win');
});

// ---------------------------------------------------------------- class codes

test('class codes: Vietnamese names become valid codes', () => {
  assert.equal(normalizeClassCode('Tin học 11A1'), 'TINHOC11A1');
  assert.equal(normalizeClassCode('đội tuyển'), 'DOITUYEN');
  assert.equal(normalizeClassCode('a'.repeat(30)).length, 20);
  for (let i = 0; i < 20; i++) {
    const code = suggestClassCode('Tin học 11A1');
    assert.match(code, CLASS_CODE_RE);
    assert.ok(code.startsWith('TH11A1'));
  }
  assert.match(suggestClassCode('x'), CLASS_CODE_RE, 'short names are padded to a valid length');
  assert.doesNotMatch('ab', CLASS_CODE_RE);
  assert.doesNotMatch('lower-case', CLASS_CODE_RE);
});

test('student classes split into current and history, each sorted by Vietnamese name', () => {
  const c = (name: string, extra: Partial<ClassroomDto> = {}) => ({ name, status: 'ACTIVE', isCurrent: true, ...extra }) as ClassroomDto;
  const { current, history } = splitStudentClasses([
    c('Tin học 11B2'), c('Tin học 10A1'), c('Đã rời', { isCurrent: false }), c('Năm trước', { status: 'ARCHIVED' }),
  ]);
  assert.deepEqual(current.map((x) => x.name), ['Tin học 10A1', 'Tin học 11B2']);
  assert.deepEqual(history.map((x) => x.name), ['Đã rời', 'Năm trước']);
});

// ---------------------------------------------------------------- sessions

test('remaining time reads naturally in Vietnamese', () => {
  assert.equal(formatRemaining(0), 'đã hết giờ');
  assert.equal(formatRemaining(30_000), 'còn 1 phút', 'never "còn 0 phút"');
  assert.equal(formatRemaining(5 * MIN), 'còn 5 phút');
  assert.equal(formatRemaining(3 * HOUR + 12 * MIN), 'còn 3 giờ 12 phút');
  assert.equal(formatRemaining(2 * DAY + 3 * HOUR), 'còn 2 ngày 3 giờ');
  assert.equal(formatRemaining(2 * DAY), 'còn 2 ngày');
});

test('closing soon: open sessions closing within two days only', () => {
  const now = Date.parse('2026-11-08T00:00:00Z');
  const at = (ms: number) => new Date(now + ms).toISOString();
  assert.equal(isClosingSoon({ state: 'OPEN', closesAt: at(DAY) }, now), true);
  assert.equal(isClosingSoon({ state: 'OPEN', closesAt: at(3 * DAY) }, now), false);
  assert.equal(isClosingSoon({ state: 'OPEN', closesAt: null }, now), false);
  assert.equal(isClosingSoon({ state: 'CLOSED', closesAt: at(-HOUR) }, now), false);
  assert.equal(isClosingSoon({ state: 'UPCOMING', closesAt: at(DAY) }, now), false);
});

test('sessions sort: open by nearest deadline, then upcoming by opening, then closed newest first', () => {
  const s = (id: string, state: SessionDto['state'], extra: Partial<SessionDto>) => ({ id, state, opensAt: null, closesAt: null, createdAt: '2026-01-01', ...extra }) as SessionDto;
  const sorted = sortSessions([
    s('closed-old', 'CLOSED', { createdAt: '2026-01-01' }),
    s('open-noclose', 'OPEN', {}),
    s('upcoming-late', 'UPCOMING', { opensAt: '2026-12-10' }),
    s('open-soon', 'OPEN', { closesAt: '2026-11-09' }),
    s('closed-new', 'CLOSED', { createdAt: '2026-11-01' }),
    s('upcoming-early', 'UPCOMING', { opensAt: '2026-11-11' }),
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ['open-soon', 'open-noclose', 'upcoming-early', 'upcoming-late', 'closed-new', 'closed-old']);
});

test('why a student cannot submit', () => {
  const s = (x: Partial<SessionDto>) => ({ state: 'OPEN', classStatus: 'ACTIVE', ...x }) as SessionDto;
  assert.match(cannotSubmitReason(s({ classStatus: 'ARCHIVED' })), /lưu trữ/);
  assert.match(cannotSubmitReason(s({ state: 'UPCOMING' })), /chưa mở/);
  assert.match(cannotSubmitReason(s({ state: 'CLOSED' })), /đã đóng/);
  assert.match(cannotSubmitReason(s({})), /không thuộc lớp/);
  assert.equal(solveHref('s1', 'A/B'), '/sessions/s1/problems/A%2FB', 'problem keys are URL-encoded');
});

// ---------------------------------------------------------------- exam settings and the countdown

const settings = (x: Partial<SessionSettingsDto> = {}): SessionSettingsDto => ({
  durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: null, feedback: 'FULL', checkPlagiarism: false, checkAiUsage: false, ...x,
});

test('settings summary lists the rules students must know; integrity checks are teacher-only', () => {
  assert.deepEqual(settingsSummary(settings()), ['Dùng ngôn ngữ nào cũng được', 'Nộp không giới hạn số lần', 'Xem kết quả từng test ngay']);
  const exam = settings({ durationMinutes: 90, allowedLanguages: ['python', 'cpp'], maxSubmissionsPerProblem: 3, feedback: 'HIDDEN_UNTIL_CLOSED', checkPlagiarism: true });
  const lines = settingsSummary(exam);
  assert.equal(lines[0], 'Làm trong 90 phút từ lúc bấm bắt đầu');
  assert.match(lines[1], /^Ngôn ngữ: C\+\+17, Python 3$/, 'languages in the canonical order');
  assert.ok(lines.includes('Tối đa 3 lần nộp mỗi bài'));
  assert.ok(lines.includes('Kết quả hiện sau khi phiên đóng'));
  assert.ok(!lines.some((l) => /đạo văn/.test(l)), 'never shown to students');
  assert.deepEqual(integritySummary(exam), ['Kiểm tra đạo văn']);
  assert.equal(isExamLike(settings()), false);
  assert.equal(isExamLike(exam), true);
  assert.equal(allowedLanguages(undefined).length, 5);
});

test('countdown: personal attempt first; else the deadline when under 24h; never for teachers', () => {
  const now = Date.parse('2026-11-08T10:00:00Z');
  const base = { state: 'OPEN', myAttempt: null, needsStart: false, canManage: false, closesAt: null } as unknown as SessionDto;
  const ends = new Date(now + 30 * MIN).toISOString();
  assert.deepEqual(timerTarget({ ...base, myAttempt: { startedAt: '', endsAt: ends } }, now), { endsAt: Date.parse(ends), kind: 'attempt' });
  assert.deepEqual(timerTarget({ ...base, closesAt: new Date(now + 2 * HOUR).toISOString() }, now)?.kind, 'deadline');
  assert.equal(timerTarget({ ...base, closesAt: new Date(now + 2 * DAY).toISOString() }, now), null);
  assert.equal(timerTarget({ ...base, canManage: true, closesAt: new Date(now + HOUR).toISOString() }, now), null);
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(-5), '00:00');
  assert.equal(formatClock(1), '00:01', 'rounds up: never shows 00:00 while time is left');
});
