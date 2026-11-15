import { TRIAL_MAX_AGE_MS, type Language, type TestCaseResult, type Verdict } from '@oj/contracts';

/** A trial run is kept this long, then forgotten (OJ-18). */
export const TRIAL_TTL_MS = TRIAL_MAX_AGE_MS;
/**
 * How long a user's one trial slot stays taken without a result. Longer than the page waits (60 s), so a slow trial
 * blocks a second one, but short enough that a trial stuck behind a queue of real submissions does not lock the
 * student out for the whole 15 minutes.
 */
export const TRIAL_SLOT_MS = 90_000;

export interface TrialSample {
  /** The job's test case id. */
  id: string;
  input: string;
  expectedOutput: string;
}

/** What is known when the trial is started. */
export interface TrialRecord {
  id: string;
  userId: string;
  sessionId: string;
  problemKey: string;
  language: Language;
  createdAt: string;
  samples: TrialSample[];
}

export interface TrialResult {
  verdict: Verdict;
  compileOutput: string | null;
  testResults: TestCaseResult[];
}

export interface TrialState {
  record: TrialRecord;
  started: boolean;
  result: TrialResult | null;
}

/**
 * Port: short-lived storage of trial runs (Redis in production). Trials never reach the database: they are not
 * submissions, so nothing about them counts, and they disappear after TRIAL_TTL_MS.
 */
export abstract class TrialStore {
  /** Takes the user's single trial slot for this trial; false when another trial of theirs holds it. */
  abstract claimSlot(userId: string, trialId: string): Promise<boolean>;
  /** Records this trial as the user's latest and returns the one it replaces (null if none within TRIAL_TTL_MS). */
  abstract swapLatest(userId: string, trialId: string): Promise<string | null>;
  /** Frees the slot if this trial still holds it. */
  abstract releaseSlot(userId: string, trialId: string): Promise<void>;
  abstract create(record: TrialRecord): Promise<void>;
  abstract remove(trialId: string): Promise<void>;
  /** No-op for a trial that is gone. */
  abstract markStarted(trialId: string): Promise<void>;
  /** Stores the result; returns the trial's record, or null (and stores nothing) when the trial is gone. */
  abstract storeResult(trialId: string, result: TrialResult): Promise<TrialRecord | null>;
  abstract find(trialId: string): Promise<TrialState | null>;
}
