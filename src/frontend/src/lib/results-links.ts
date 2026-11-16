/**
 * Links from a session's results to one student's work (OJ-30). Ids only: never a name or an email in the URL, the
 * submissions page reads the student's name from the submissions it loads.
 */
export function studentSubmissionsHref(sessionId: string, userId: string, problemKey?: string): string {
  const query = new URLSearchParams({ sessionId, userId });
  if (problemKey) query.set('problemKey', problemKey);
  return `/submissions?${query.toString()}`;
}
