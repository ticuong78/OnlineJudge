import type { ClassGradebookDto, ProblemSetType } from '@oj/contracts';
import { csvFile } from './csv';

export type GradebookSession = ClassGradebookDto['sessions'][number];
export type GradebookRow = ClassGradebookDto['rows'][number] & { earned: number; possible: number; percent: number | null };
export interface GradebookView {
  sessions: GradebookSession[];
  rows: GradebookRow[];
}
export type GradebookSort = 'name' | 'total';

/**
 * The gradebook as shown (OJ-31): only the sessions of the chosen types (all when `types` is empty), with each
 * student's earned and possible points over those sessions. Never submitted counts 0, as on the results page.
 */
export function gradebookView(book: ClassGradebookDto, types: ProblemSetType[], sort: GradebookSort = 'name'): GradebookView {
  const sessions = types.length ? book.sessions.filter((s) => types.includes(s.type)) : book.sessions;
  const possible = round(sessions.reduce((sum, s) => sum + s.maxPoints, 0));
  const rows = book.rows.map((r) => {
    const earned = round(sessions.reduce((sum, s) => sum + (r.scores[s.id] ?? 0), 0));
    return { ...r, earned, possible, percent: possible > 0 ? round((earned / possible) * 100) : null };
  });
  if (sort === 'total') rows.sort((a, b) => b.earned - a.earned || a.displayName.localeCompare(b.displayName, 'vi'));
  return { sessions, rows };
}

export interface GradebookCsvLabels {
  index: string;
  student: string;
  left: string;
  earned: string;
  possible: string;
  percent: string;
}

/** The shown table as CSV, with a BOM so Excel keeps Vietnamese names (as the results CSV). */
export function gradebookCsv(view: GradebookView, labels: GradebookCsvLabels, formatPoints: (n: number) => string): string {
  const header = [labels.index, labels.student, ...view.sessions.map((s) => s.title), labels.earned, labels.possible, labels.percent];
  const lines = view.rows.map((r, i) => [
    i + 1,
    r.left ? `${r.displayName} (${labels.left})` : r.displayName,
    ...view.sessions.map((s) => (r.scores[s.id] === null ? '' : formatPoints(r.scores[s.id] ?? 0))),
    formatPoints(r.earned),
    formatPoints(r.possible),
    r.percent === null ? '' : formatPoints(r.percent),
  ]);
  return csvFile([header, ...lines]);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
