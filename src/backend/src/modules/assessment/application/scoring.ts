/**
 * The one points rule for a session (U4): a problem counts its best score. Shared by the session results and the class
 * gradebook (OJ-31) so the two pages can never disagree.
 */

/** Points earned on a problem worth `points` with a best score of `bestScore` percent, to 0.01. */
export function earnedPoints(points: number, bestScore: number): number {
  return Math.round(points * bestScore) / 100;
}

/** A sum of points, kept to 0.01 so repeated additions do not drift. */
export function addPoints(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100;
}
