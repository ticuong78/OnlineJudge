import type { BankScope, ProblemSetType } from '@oj/contracts';
import type { ProblemSet } from './problem-set.js';
import type { LearningPath } from './learning-path.js';
import type { Attempt, Session } from './session.js';

export abstract class AttemptRepository {
  abstract find(sessionId: string, userId: string): Promise<Attempt | null>;
  abstract findForUser(userId: string, sessionIds: string[]): Promise<Attempt[]>;
  abstract save(attempt: Attempt): Promise<void>;
  abstract deleteBySession(sessionId: string): Promise<void>;
}

export abstract class ProblemSetRepository {
  abstract findById(id: string): Promise<ProblemSet | null>;
  abstract list(scope: BankScope, viewerId: string): Promise<ProblemSet[]>;
  abstract findContainingProblem(problemId: string): Promise<ProblemSet[]>;
  abstract save(set: ProblemSet): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

export interface SessionFilter {
  /** Restrict to these classes; 'ALL' = no restriction. */
  classIds: string[] | 'ALL';
  includePublic: boolean;
  includeClass: boolean;
  /** Only these session types. */
  types?: ProblemSetType[];
  /** Only sessions open at this moment by their own window (class status is not checked here). */
  openAt?: Date;
}

export abstract class SessionRepository {
  abstract findById(id: string): Promise<Session | null>;
  abstract list(filter: SessionFilter): Promise<Session[]>;
  /** Listing-level sessions (no test data) by id, in one query; missing ids are left out. */
  abstract findListing(ids: string[]): Promise<Session[]>;
  abstract findByClass(classId: string): Promise<Session[]>;
  /** Listing-level session (no test data) assigned from that bank item to that audience. */
  abstract findByAssignmentKey(key: string): Promise<Session | null>;
  abstract save(session: Session): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

/** Learning paths (OJ-24). `list` is newest first. */
/** Up to `limit` paths created before `before` (its creation time, then its id), or from the newest. */
export interface PathPage {
  limit: number;
  before?: { createdAt: Date; id: string };
}

export abstract class LearningPathRepository {
  abstract findById(id: string): Promise<LearningPath | null>;
  /**
   * Newest first by creation, then by id: both never change, so a page that starts after `before` is stable however
   * paths are edited or removed meanwhile (OJ-28).
   */
  abstract list(filter: { publicOnly?: boolean; ownerId?: string }, page: PathPage): Promise<LearningPath[]>;
  abstract save(path: LearningPath): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

