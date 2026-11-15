import type { SessionDto, SessionState } from '@oj/contracts';
import { tr } from '@/i18n/runtime';

export const sessionHref = (id: string) => `/sessions/${id}`;
export const solveHref = (sessionId: string, key: string) => `/sessions/${sessionId}/problems/${encodeURIComponent(key)}`;

const DAY = 24 * 60 * 60 * 1000;

/** The time span alone: "2 ngày 3 giờ", "3 giờ 12 phút", "5 phút" (at least one minute). */
function formatSpan(ms: number) {
  const t = tr();
  const m = Math.floor(ms / 60000);
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const minutes = m % 60;
  if (days > 0) return hours ? t('student.time.daysHours', { days, hours }) : t('student.time.days', { days });
  if (hours > 0) return minutes ? t('student.time.hoursMinutes', { hours, minutes }) : t('student.time.hours', { hours });
  return t('student.time.minutes', { minutes: Math.max(1, minutes) });
}

/** Time left before a deadline: "còn 2 ngày 3 giờ" / "2 days 3 hours left", "còn 5 phút", "đã hết giờ". */
export function formatRemaining(ms: number) {
  if (ms <= 0) return tr()('student.time.over');
  return tr()('student.time.left', { span: formatSpan(ms) });
}

/** Time until something starts: "sau 2 ngày 3 giờ" / "in 2 days 3 hours"; "đã hết giờ" once it is past. */
export function formatUntil(ms: number) {
  if (ms <= 0) return tr()('student.time.over');
  return tr()('student.time.until', { span: formatSpan(ms) });
}

/** Why the viewer cannot submit, in words a student understands. */
export function cannotSubmitReason(s: SessionDto): string {
  const t = tr();
  if (s.classStatus === 'ARCHIVED') return t('student.cannotSubmit.archived');
  if (s.state === 'UPCOMING') return t('student.cannotSubmit.upcoming');
  if (s.state === 'CLOSED') return t('student.cannotSubmit.closed');
  return t('student.cannotSubmit.notMember');
}

export function isClosingSoon(s: Pick<SessionDto, 'state' | 'closesAt'>, now = Date.now()) {
  if (s.state !== 'OPEN' || !s.closesAt) return false;
  const left = new Date(s.closesAt).getTime() - now;
  return left > 0 && left <= 2 * DAY;
}

/** Open first (soonest deadline first), then upcoming, then closed (most recent first). */
export function sortSessions(list: SessionDto[]) {
  const rank: Record<SessionState, number> = { OPEN: 0, UPCOMING: 1, CLOSED: 2 };
  const t = (iso: string | null, fallback: number) => (iso ? new Date(iso).getTime() : fallback);
  return [...list].sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    if (a.state === 'OPEN') return t(a.closesAt, Infinity) - t(b.closesAt, Infinity);
    if (a.state === 'UPCOMING') return t(a.opensAt, 0) - t(b.opensAt, 0);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * What a student still has to do among open sessions: those they can submit to now, plus timed exams waiting for
 * "Bắt đầu làm bài" (they cannot submit yet, but missing them is the costly mistake, so they come first). Finished
 * sessions and timed attempts that ran out are left out.
 */
export function studentOpenSessions(list: SessionDto[]): SessionDto[] {
  const todo = list.filter((s) => s.state === 'OPEN' && (s.canSubmit || s.needsStart) && !s.myProgress?.completed);
  const sorted = sortSessions(todo);
  return [...sorted.filter((s) => s.needsStart), ...sorted.filter((s) => !s.needsStart)];
}

export const DAY_MS = DAY;
