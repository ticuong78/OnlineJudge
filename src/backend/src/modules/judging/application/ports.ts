import type { JudgeJob, JudgeJobTestCase } from '@oj/contracts';
import type { Language } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';

/** What a user may see of their own results in a session right now. */
export type ResultVisibility = 'FULL' | 'SCORE_ONLY' | 'HIDDEN';

export interface SubmissionTarget {
  sessionTitle: string;
  problemTitle: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: JudgeJobTestCase[];
  /** Empty = every language. */
  allowedLanguages: Language[];
  maxSubmissions: number | null;
}

/** Port (ACL) towards the Assessment context: sessions decide who may submit what. */
export abstract class SessionGateway {
  /** Throws when the actor may not submit to this session problem right now. */
  abstract prepareSubmission(actor: Actor, sessionId: string, problemKey: string): Promise<SubmissionTarget>;
  /** Throws when the actor may not read this session problem right now; returns its sample tests only. */
  abstract trialTarget(actor: Actor, sessionId: string, problemKey: string): Promise<SubmissionTarget>;
  abstract canReview(actor: Actor, sessionId: string): Promise<boolean>;
  /** Current test data of a session problem, for rejudging; null when the session no longer has that problem. */
  abstract judgeTarget(sessionId: string, problemKey: string): Promise<SubmissionTarget | null>;
  abstract visibility(actor: Actor, sessionIds: string[]): Promise<Map<string, ResultVisibility>>;
}

/**
 * Where a judge run stands in the queue (times in epoch ms):
 * - waiting for an engine;
 * - active: taken by an engine at `activeSince`. `deadlineAt` is when the engine promised to have stopped it, and
 *   `deadlineStartedAt` the start of the attempt that promise was made for (both null from an engine too old to say);
 * - finished by the engine at `finishedAt`, its result possibly not applied yet.
 */
export type QueuedRun =
  | { state: 'waiting' }
  | { state: 'active'; deadlineAt: number | null; deadlineStartedAt: number | null; activeSince: number | null }
  | { state: 'finished'; finishedAt: number | null };

/** Port: hands work to the judge engine. */
export abstract class JudgeQueue {
  abstract enqueue(job: JudgeJob): Promise<void>;
  /** The job of this judge run while it is waiting, running or just finished; null once it is gone or failed. */
  abstract inspect(submissionId: string, judgeRun: number): Promise<QueuedRun | null>;
  /** Removes the job of this judge run, so it is not run (again) after the submission was ended. Best effort. */
  abstract discard(submissionId: string, judgeRun: number): Promise<void>;
  /** Removes a trial run's job if it is still waiting (nobody reads its result any more). Best effort. */
  abstract discardTrial(trialId: string): Promise<void>;
}
