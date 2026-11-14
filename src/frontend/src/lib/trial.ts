import type { TrialRunDto } from '@oj/contracts';

/** Poll every second while the page waits for a trial (OJ-18)... */
export const TRIAL_FAST_POLL_MS = 1_000;
/** ...for this long; after that the judge is busy with submissions, so poll slowly and say so. */
export const TRIAL_FAST_FOR_MS = 60_000;
export const TRIAL_SLOW_POLL_MS = 5_000;

export type TrialSummary =
  | { kind: 'pending' | 'judging' | 'compileError' | 'systemError' }
  | { kind: 'passed' | 'failed'; passed: number; total: number };

/** The headline of a trial: still waiting, a build or system failure, or how many samples passed. */
export function trialSummary(trial: TrialRunDto): TrialSummary {
  if (trial.status === 'PENDING') return { kind: 'pending' };
  if (trial.status === 'JUDGING') return { kind: 'judging' };
  if (trial.verdict === 'CE') return { kind: 'compileError' };
  if (trial.verdict === 'IE') return { kind: 'systemError' };
  const total = trial.tests.length;
  const passed = trial.tests.filter((t) => t.verdict === 'AC').length;
  return { kind: passed === total ? 'passed' : 'failed', passed, total };
}

/** How long to wait before asking again, or null to stop (done). */
export function nextTrialPoll(trial: TrialRunDto | null, elapsedMs: number): number | null {
  if (trial?.status === 'DONE') return null;
  return elapsedMs < TRIAL_FAST_FOR_MS ? TRIAL_FAST_POLL_MS : TRIAL_SLOW_POLL_MS;
}
