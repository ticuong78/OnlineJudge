import type { Submission } from './submission.js';

/** Why a submission could not be admitted, or ADMITTED. */
export type Admission = 'ADMITTED' | 'TOO_MANY_PENDING' | 'PROBLEM_LIMIT_REACHED';

export interface AdmissionLimits {
  /** Submissions of one user waiting to be judged at the same time. */
  maxPending: number;
  /**
   * Attempts of one user at one problem of one session; null = unlimited. System errors (IE) are not attempts, except
   * those attributed to the program beyond FREE_PROGRAM_ERRORS (see `FaultSource` in `submission.ts`).
   */
  maxForProblem: number | null;
}

/** Position in the stale-submission order: the queue time and id of the last submission already seen. */
export interface StaleCursor {
  queuedAt: Date;
  id: string;
}

export abstract class SubmissionRepository {
  abstract findById(id: string): Promise<Submission | null>;
  abstract save(submission: Submission): Promise<void>;
  /**
   * Counts the user's pending and past attempts and, only if both limits allow it, stores the new submission,
   * as ONE atomic step per user. Checking and inserting separately lets parallel requests all pass the
   * check before any of them is stored, which made both limits meaningless.
   */
  abstract admit(submission: Submission, limits: AdmissionLimits): Promise<Admission>;
  abstract findBySession(sessionId: string, problemKey: string | null): Promise<Submission[]>;
  /**
   * Unfinished submissions whose current judge run was queued before `queuedBefore`, oldest first (ties by id).
   * `after` continues from the last one of the previous page, so a long backlog can be walked page by page.
   */
  abstract findStale(queuedBefore: Date, limit: number, after?: StaleCursor): Promise<Submission[]>;
  /**
   * Ends a submission with a system error (IE), but only if that run is still unfinished (compare-and-set):
   * a result that arrived a moment ago is never overwritten. True when this call ended it.
   */
  abstract failIfUnfinished(id: string, judgeRun: number, reason: string, now?: Date): Promise<boolean>;
}

export interface SubmissionListFilter {
  userId?: string;
  sessionId?: string;
  problemKey?: string;
  page: number;
  pageSize: number;
}

/** Read-side port. */
export abstract class SubmissionQueries {
  abstract list(filter: SubmissionListFilter): Promise<{ items: Submission[]; total: number }>;
}
