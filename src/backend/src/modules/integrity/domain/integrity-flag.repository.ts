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
  abstract sessionIdsWithFlags(): Promise<string[]>;
}
