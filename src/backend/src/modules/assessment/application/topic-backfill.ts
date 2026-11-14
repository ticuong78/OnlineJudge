/**
 * One-off backfill (OJ-20): sessions created before topics were copied have problems without `tags`. They get the
 * current tags of their bank problem, so teachers need no "refresh from the bank" (which re-freezes statements and tests
 * and is followed by a rejudge). Only missing tags are filled: tags a session already has stay frozen, like its
 * statements. A problem whose bank problem is gone gets `[]`.
 */
export function backfillSessionProblems<P extends { sourceProblemId: string; tags?: string[] }>(
  problems: P[],
  bankTags: ReadonlyMap<string, string[]>,
): (P & { tags: string[] })[] | null {
  if (problems.every((p) => Array.isArray(p.tags))) return null;
  return problems.map((p) => ({ ...p, tags: p.tags ?? bankTags.get(p.sourceProblemId) ?? [] }));
}

/** The learning record's copy of a session (problems by key) gets the session's tags where it has none. */
export function backfillRecordProblems<P extends { key: string; tags?: string[] }>(
  problems: P[],
  sessionTags: ReadonlyMap<string, string[]>,
): (P & { tags: string[] })[] | null {
  if (problems.every((p) => Array.isArray(p.tags))) return null;
  return problems.map((p) => ({ ...p, tags: p.tags ?? sessionTags.get(p.key) ?? [] }));
}
