import type { SessionDto, SessionState } from '@oj/contracts';

export const SessionStateLabels: Record<SessionState, string> = {
  UPCOMING: 'Sắp mở',
  OPEN: 'Đang mở',
  CLOSED: 'Đã đóng',
};

export const sessionHref = (id: string) => `/sessions/${id}`;
export const solveHref = (sessionId: string, key: string) => `/sessions/${sessionId}/problems/${encodeURIComponent(key)}`;

const DAY = 24 * 60 * 60 * 1000;

/** "còn 2 ngày 3 giờ", "còn 3 giờ 12 phút", "còn 5 phút". */
export function formatRemaining(ms: number) {
  if (ms <= 0) return 'đã hết giờ';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `còn ${d} ngày${h ? ` ${h} giờ` : ''}`;
  if (h > 0) return `còn ${h} giờ${mm ? ` ${mm} phút` : ''}`;
  return `còn ${Math.max(1, mm)} phút`;
}

/** Why the viewer cannot submit, in words a student understands. */
export function cannotSubmitReason(s: SessionDto): string {
  if (s.classStatus === 'ARCHIVED') return 'Lớp đã lưu trữ nên không nộp bài được nữa.';
  if (s.state === 'UPCOMING') return 'Phiên chưa mở. Quay lại khi phiên bắt đầu.';
  if (s.state === 'CLOSED') return 'Phiên đã đóng, không nhận bài nộp mới.';
  return 'Bạn không thuộc lớp của phiên này nên chỉ xem được đề.';
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
