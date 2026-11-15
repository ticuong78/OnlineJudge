import type { IntegrityFlagKind, IntegrityFlagStatus } from '@oj/contracts';
import type { IntegrityFlag } from './integrity-flag.js';

export abstract class IntegrityFlagRepository {
  abstract findById(id: string): Promise<IntegrityFlag | null>;
  abstract list(filter: { sessionIds: string[] | 'ALL'; status?: IntegrityFlagStatus }): Promise<IntegrityFlag[]>;
  abstract save(flag: IntegrityFlag): Promise<void>;
  /**
   * Inserts a new plagiarism flag unless one already exists for the same pair of submissions (`pairKey`); atomic, so two
   * checks of the same pair running at once keep one flag. False when the pair was already flagged.
   */
  abstract addIfNewPair(flag: IntegrityFlag): Promise<boolean>;
  /** Records that a submission went through a check (so rejudges do not check or bill twice). */
  abstract markChecked(submissionId: string, kind: IntegrityFlagKind): Promise<boolean>;
  /**
   * True only the first time for a student and a session problem (OJ-21): the AI review looks at a student's first
   * accepted solution once, so resubmitting cannot spend the teacher's monthly allowance.
   */
  abstract claimFirstAiReview(sessionId: string, problemKey: string, userId: string): Promise<boolean>;
  /** Gives the claim back when no review happened (no allowance left, or the AI call failed), OJ-28. */
  abstract releaseFirstAiReview(sessionId: string, problemKey: string, userId: string): Promise<void>;
  abstract sessionIdsWithFlags(): Promise<string[]>;
}
