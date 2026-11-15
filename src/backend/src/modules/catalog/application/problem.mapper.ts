import type { ProblemDetailDto, ProblemSummaryDto, SharingDto, TestCaseDto } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { formatProblemCode, type Problem, type Sharing, type TestCase } from '../domain/problem.js';
import type { ProblemSummaryRow } from '../domain/problem.repository.js';

export const toSharingDto = (s: Sharing): SharingDto => ({
  isPublic: s.isPublic,
  publicTests: s.publicTests,
  publicSolution: s.publicSolution,
  organizationIds: [...s.organizationIds],
});

export function toSummaryDto(row: ProblemSummaryRow): ProblemSummaryDto {
  return {
    id: row.id,
    code: formatProblemCode(row.seq),
    title: row.title,
    difficulty: row.difficulty,
    tags: row.tags,
    timeLimitMs: row.timeLimitMs,
    memoryLimitMb: row.memoryLimitMb,
    testCaseCount: row.testCaseCount,
    hasSolution: row.hasSolution,
    ownerId: row.owner.id,
    ownerName: row.owner.name,
    sharing: toSharingDto(row.sharing),
    copiedFrom: row.copiedFrom,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTestCaseDto(t: TestCase): TestCaseDto {
  return { id: t.id, order: t.order, ...t.data };
}

/** What `viewer` may see: hidden tests and the solution depend on ownership and sharing. Null viewer = full (internal use). */
export function toDetailDto(problem: Problem, viewer: Actor | null): ProblemDetailDto {
  const c = problem.content;
  const hidden = viewer ? problem.canSeeHiddenTests(viewer) : true;
  const solution = viewer ? problem.canSeeSolution(viewer) : true;
  return {
    id: problem.id,
    code: problem.code,
    title: c.title,
    difficulty: c.difficulty,
    tags: c.tags,
    statement: c.statement,
    inputFormat: c.inputFormat,
    outputFormat: c.outputFormat,
    constraints: c.constraints,
    timeLimitMs: problem.limits.timeLimitMs,
    memoryLimitMb: problem.limits.memoryLimitMb,
    testCaseCount: problem.testCases.length,
    hasSolution: problem.solution !== null,
    ownerId: problem.owner.id,
    ownerName: problem.owner.name,
    sharing: toSharingDto(problem.sharing),
    copiedFrom: problem.copiedFrom,
    createdAt: problem.createdAt.toISOString(),
    testCases: problem.testCases.filter((t) => hidden || t.data.isSample).map(toTestCaseDto),
    ...(solution ? { solution: problem.solution ? { ...problem.solution } : null } : {}),
    canEdit: viewer ? problem.canEdit(viewer) : false,
  };
}
