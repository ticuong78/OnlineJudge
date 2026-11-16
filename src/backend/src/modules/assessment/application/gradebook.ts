import type { ClassGradebookDto, ProblemSetType } from '@oj/contracts';
import type { RecordProgress } from './ports.js';
import { addPoints, earnedPoints } from './scoring.js';

/** What the gradebook needs from a session: its column and its current problems (retired keys do not count). */
export interface GradebookSession {
  id: string;
  title: string;
  type: ProblemSetType;
  opensAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  problems: { key: string; points: number }[];
}

/**
 * Builds a class's gradebook (OJ-31). `sessions` are the opened sessions of the class; `roster` its current students;
 * `former` the ids of former members. Anyone else who has progress (a teacher trying a problem) is left out.
 */
export function buildGradebook(
  classId: string,
  sessions: GradebookSession[],
  roster: { id: string; displayName: string }[],
  former: Set<string>,
  progress: RecordProgress[],
): ClassGradebookDto {
  const ordered = [...sessions].sort((a, b) => start(a) - start(b) || a.title.localeCompare(b.title, 'vi'));
  const byId = new Map(ordered.map((s) => [s.id, s]));

  type Row = ClassGradebookDto['rows'][number];
  const rows = new Map<string, Row>();
  const blank = () => Object.fromEntries(ordered.map((s) => [s.id, null])) as Row['scores'];
  for (const s of roster) rows.set(s.id, { userId: s.id, displayName: s.displayName, left: false, scores: blank() });

  for (const p of progress) {
    const session = byId.get(p.sessionId);
    const problem = session?.problems.find((x) => x.key === p.problemKey);
    if (!session || !problem) continue;
    let row = rows.get(p.userId);
    if (!row) {
      if (!former.has(p.userId)) continue;
      row = { userId: p.userId, displayName: p.userDisplayName, left: true, scores: blank() };
      rows.set(p.userId, row);
    }
    row.scores[p.sessionId] = addPoints(row.scores[p.sessionId] ?? 0, earnedPoints(problem.points, p.bestScore));
  }

  return {
    classId,
    sessions: ordered.map((s) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      opensAt: s.opensAt?.toISOString() ?? null,
      closesAt: s.closesAt?.toISOString() ?? null,
      maxPoints: s.problems.reduce((sum, p) => sum + p.points, 0),
    })),
    rows: [...rows.values()].sort((a, b) => Number(a.left) - Number(b.left) || a.displayName.localeCompare(b.displayName, 'vi')),
  };
}

/** A session's place in time: when it opened, or when it was created if it opened at once. */
function start(s: GradebookSession): number {
  return (s.opensAt ?? s.createdAt).getTime();
}
