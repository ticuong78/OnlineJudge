import { formatPoints, scoreLabel } from './utils';

/**
 * How a score cell on the results board reads (OJ-33): full points, some points, or none. Partial scores used to look
 * like full ones without the bold, so a teacher could not see at a glance who was close.
 */
export type ScoreTone = 'full' | 'partial' | 'none';

export function scoreTone(score: number, max: number): ScoreTone {
  if (!(score > 0)) return 'none';
  return score >= max ? 'full' : 'partial';
}

/** One session's problem points (problemKey → points); a submission list uses them only for rows of that session. */
export interface SessionPoints {
  sessionId: string;
  points: Record<string, number>;
}

/**
 * The points of `sessionId`, or undefined while the loaded session is another one. The list keeps its previous data
 * while the next session loads, and problem keys repeat across sessions, so a stale map would show a wrong maximum.
 */
export function sessionPoints(
  sessionId: string,
  session: { id: string; problems: readonly { key: string; points: number }[] } | undefined,
): SessionPoints | undefined {
  if (!session || session.id !== sessionId) return undefined;
  return { sessionId, points: Object.fromEntries(session.problems.map((p) => [p.key, p.points])) };
}

/**
 * How one submission's score reads in a list (OJ-33): nothing while it is judged or its results are hidden; points out
 * of the problem's points when the list knows them (the same number as the results board, via `scoreLabel`), with the
 * percent beside; the percent alone otherwise.
 */
export function submissionScore(
  sub: { status: string; resultsHidden: boolean; score: number; sessionId: string; problemKey: string },
  points: SessionPoints | undefined,
): { value: string; unit: string; spoken: string; percent: string | null } | null {
  if (sub.status !== 'DONE' || sub.resultsHidden) return null;
  const max = points && points.sessionId === sub.sessionId ? points.points[sub.problemKey] : undefined;
  return { ...scoreLabel(sub.score, max), percent: max === undefined ? null : `${formatPoints(sub.score)}%` };
}
