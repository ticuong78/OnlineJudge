import type { SessionResultsDto } from '@oj/contracts';

type Row = SessionResultsDto['rows'][number];
type Problem = SessionResultsDto['problems'][number];

/** What the results board can be sorted by (OJ-17, U4): a problem's key, or one of the summary columns. */
export type ResultSort = { by: 'total' | 'name' | 'solved' | 'last' } | { by: 'problem'; key: string };
export type SortDirection = 'asc' | 'desc';

const byName = (a: Row, b: Row) => a.displayName.localeCompare(b.displayName, 'vi');

/** Sorted copy of the rows. Ties fall back to the name, so the order is stable and predictable. */
export function sortResults(rows: Row[], sort: ResultSort, direction: SortDirection): Row[] {
  const sign = direction === 'asc' ? 1 : -1;
  const value = (r: Row): number | string => {
    switch (sort.by) {
      case 'name':
        return r.displayName;
      case 'solved':
        return r.solvedCount;
      case 'last':
        return r.lastSubmissionAt ?? '';
      case 'problem':
        return r.scores[sort.key] ?? 0;
      default:
        return r.total;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'vi') : (va as number) - (vb as number);
    return c !== 0 ? sign * c : byName(a, b);
  });
}

/** How many students have full points on each problem: the board's "solved by" row. */
export function solvedByProblem(rows: Row[], problems: Problem[]): Record<string, number> {
  return Object.fromEntries(problems.map((p) => [p.key, rows.filter((r) => (r.scores[p.key] ?? 0) >= p.points).length]));
}
