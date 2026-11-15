import type { Language, Verdict } from './enums';

/** Queue names shared by the backend (producer) and the engine (consumer). */
export const JUDGE_JOBS_QUEUE = 'judge-jobs';
export const JUDGE_RESULTS_QUEUE = 'judge-results';

export interface JudgeJobTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  points: number;
  /**
   * A sample (shown in the statement). Only these tests' diagnostics may reach students: a runtime-error message
   * carries the program's own error output, which a program can fill with a hidden test's input (OJ-15 F1).
   */
  isSample: boolean;
}

/** Message sent from the backend to the engine. Self-contained: the engine never touches the database. */
export interface JudgeJob {
  submissionId: string;
  /** Incremented on every rejudge; results of an older run are ignored. */
  judgeRun: number;
  language: Language;
  sourceCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: JudgeJobTestCase[];
  /**
   * A trial run on the sample tests (OJ-18): `submissionId` is then the trial's id, the result goes to the trial
   * store instead of a submission, and each result carries the program's output. Only sample tests are ever sent.
   */
  trial?: true;
}

/** Program output kept per test of a trial run (characters). */
export const TRIAL_OUTPUT_MAX_CHARS = 4_000;
/** A trial run is kept this long; an engine skips a trial job that waited longer, since nobody can read its result. */
export const TRIAL_MAX_AGE_MS = 15 * 60_000;

/**
 * Progress the engine reports on a judge job when it starts it: the moment by which it will have stopped the job
 * (epoch ms). The backend's watchdog uses it to tell a long but healthy run from one whose engine died.
 */
export interface JudgeJobProgress {
  deadlineAt: number;
  /** The attempt this deadline belongs to (the job's `processedOn` when the engine took it); a retry makes it stale. */
  startedAt: number;
}

export type SystemFault = 'infrastructure' | 'program';

export interface TestCaseResult {
  testCaseId: string;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
  /** Points earned on this test (0 unless AC). */
  points: number;
  /** Short diagnostic (e.g. runtime error excerpt). Shown to students only for sample tests (OJ-15 F1). */
  message?: string;
  /** Copied from the job's test case. Missing on results stored before OJ-15: treated as a hidden test. */
  isSample?: boolean;
  /** Trial runs only (OJ-18): what the program printed, cut to TRIAL_OUTPUT_MAX_CHARS. Never set for submissions. */
  output?: string;
}

export type JudgeResultMessage =
  | { type: 'started'; submissionId: string; judgeRun: number; trial?: true }
  | {
      type: 'finished';
      /** Echoed from the job: this is the result of a trial run, not of a submission. */
      trial?: true;
      submissionId: string;
      judgeRun: number;
      verdict: Verdict;
      compileOutput?: string;
      testResults: TestCaseResult[];
      /**
       * For verdict IE only: where the judge failed. `infrastructure` = before any of the submitted program ran (the
       * system's fault); `program` = after a test had started, so the program may have caused it.
       */
      systemFault?: SystemFault;
    };
