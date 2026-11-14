import type { BankScope, Difficulty } from '@oj/contracts';
import type { Owner, Problem, Sharing, SourceRef } from './problem.js';

export abstract class ProblemRepository {
  abstract findById(id: string): Promise<Problem | null>;
  abstract findByIds(ids: string[]): Promise<Problem[]>;
  /** The owner's problems currently shared with the organization (OJ-8). */
  abstract findByOwnerSharedWith(ownerId: string, organizationId: string): Promise<Problem[]>;
  abstract nextSeq(): Promise<number>;
  abstract save(problem: Problem): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

export interface ProblemListFilter {
  scope: BankScope;
  /** The viewer; `mine` means owned by this user. */
  viewerId: string;
  /** `organization` scope: the viewer's organizations, optionally narrowed to one of them by the caller. */
  organizationIds?: string[];
  search?: string;
  difficulty?: Difficulty;
  /** Problems carrying all of these (normalized) tags. */
  tags?: string[];
  page: number;
  pageSize: number;
}

export interface ProblemSummaryRow {
  id: string;
  seq: number;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  testCaseCount: number;
  hasSolution: boolean;
  owner: Owner;
  sharing: Sharing;
  copiedFrom: SourceRef | null;
  createdAt: Date;
}

/** Read-side port for listing (CQRS-light: does not load whole aggregates). */
export type ProblemScopeFilter = Pick<ProblemListFilter, 'scope' | 'viewerId' | 'organizationIds'>;

export abstract class ProblemQueries {
  abstract list(filter: ProblemListFilter): Promise<{ rows: ProblemSummaryRow[]; total: number }>;
  /** Every tag in the scope with the number of problems carrying it, most used first. */
  abstract tagCounts(filter: ProblemScopeFilter): Promise<{ tag: string; count: number }[]>;
}
