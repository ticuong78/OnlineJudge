import { earnedPoints } from './utils';

/**
 * What one problem row on the session page says (OJ-34). A student sees their own progress, as before. A teacher sees
 * the class's: "5/8 giải trọn", the same count as the results page's footer. Before, a teacher read "Chưa làm" on
 * every problem, from their own empty progress.
 */
export type ProblemStatus =
  | { kind: 'class'; solved: number; total: number }
  | { kind: 'hidden'; submissions: number }
  | { kind: 'solved' }
  | { kind: 'best'; earned: number; max: number }
  | { kind: 'notStarted' };

export function problemStatus(input: {
  manager: boolean;
  /** For a manager: students with full points on this problem, and students on the board; undefined while loading. */
  classProgress?: { solved: number; total: number };
  hidden: boolean;
  solved: boolean;
  /** The caller's best score on the problem, in percent. */
  best: number | undefined;
  submissions: number;
  points: number;
}): ProblemStatus | null {
  if (input.manager) return input.classProgress ? { kind: 'class', ...input.classProgress } : null;
  if (input.hidden) return input.submissions > 0 ? { kind: 'hidden', submissions: input.submissions } : { kind: 'notStarted' };
  if (input.solved) return { kind: 'solved' };
  if (input.best !== undefined) return { kind: 'best', earned: earnedPoints(input.best, input.points), max: input.points };
  return { kind: 'notStarted' };
}
