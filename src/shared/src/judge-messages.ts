import type { Language, Verdict } from './enums';

/** Queue names shared by the backend (producer) and the engine (consumer). */
export const JUDGE_JOBS_QUEUE = 'judge-jobs';
export const JUDGE_RESULTS_QUEUE = 'judge-results';

export interface JudgeJobTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  points: number;
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
}

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
  /** Short diagnostic (e.g. runtime error excerpt). */
  message?: string;
}

export type JudgeResultMessage =
  | { type: 'started'; submissionId: string; judgeRun: number }
  | {
      type: 'finished';
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
