import { Injectable } from '@nestjs/common';
import type { ProblemDetailDto, UpsertProblemRequest, UpsertTestCaseRequest } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { ProblemRepository } from '../domain/problem.repository.js';
import { toDetailDto } from './problem.mapper.js';
import { ProblemService } from './problem.service.js';
import { UnshareChecks, type UnshareCheck } from './unshare-checks.js';

/** Everything a session needs to freeze a problem: full content including hidden tests. */
export interface ProblemSnapshot {
  id: string;
  code: string;
  ownerId: string;
  title: string;
  difficulty: ProblemDetailDto['difficulty'];
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: { input: string; expectedOutput: string; isSample: boolean; points: number }[];
}

/**
 * Published interface of the Catalog context (open host service).
 * Other contexts depend on this through their own ports/adapters, never on catalog internals.
 */
@Injectable()
export class CatalogFacade {
  constructor(
    private readonly problems: ProblemRepository,
    private readonly service: ProblemService,
    private readonly unshareChecks: UnshareChecks,
  ) {}

  /** Creates a new problem in the actor's bank with its initial test cases; returns the new id. */
  createProblem(actor: Actor, input: UpsertProblemRequest, tests: UpsertTestCaseRequest[]): Promise<string> {
    return this.service.createWithTests(actor, input, tests);
  }

  /** Problem details as `viewer` may see them, keyed by id. Missing or invisible ids are skipped. */
  async getProblemDetails(ids: string[], viewer: Actor | null): Promise<Map<string, ProblemDetailDto>> {
    const problems = await this.problems.findByIds([...new Set(ids)]);
    return new Map(
      problems.filter((p) => !viewer || p.canView(viewer)).map((p) => [p.id, toDetailDto(p, viewer)]),
    );
  }

  /**
   * Full snapshots for creating a session. The actor must own the problems (admin: any),
   * and each problem must have tests.
   */
  async snapshotForSession(actor: Actor, ids: string[]): Promise<ProblemSnapshot[]> {
    const problems = await this.problems.findByIds([...new Set(ids)]);
    const byId = new Map(problems.map((p) => [p.id, p]));
    return ids.map((id) => {
      const p = byId.get(id);
      if (!p) throw DomainError.notFound('catalog.problem_not_found', 'Không tìm thấy bài tập.');
      if (!p.canEdit(actor)) {
        throw DomainError.forbidden('catalog.not_in_bank',
          `Bài ${p.code} không thuộc ngân hàng của bạn. Hãy lưu bản sao về ngân hàng trước khi giao.`);
      }
      p.ensureJudgeable();
      const c = p.content;
      return {
        id: p.id,
        code: p.code,
        ownerId: p.owner.id,
        title: c.title,
        difficulty: c.difficulty,
        tags: c.tags,
        statement: c.statement,
        inputFormat: c.inputFormat,
        outputFormat: c.outputFormat,
        constraints: c.constraints,
        timeLimitMs: p.limits.timeLimitMs,
        memoryLimitMb: p.limits.memoryLimitMb,
        testCases: p.testCases.map((t) => ({ ...t.data })),
      };
    });
  }

  /** Copies problems into the actor's bank (used when copying a public set). Returns old id -> new id. */
  async copyIntoBank(actor: Actor, ids: string[]): Promise<Map<string, string>> {
    const copies = await this.service.copyManyToBank(actor, ids);
    return new Map(ids.map((id, i) => [id, copies[i].id]));
  }

  /** Lets another context refuse making a public problem private (e.g. while a public set uses it). */
  registerUnshareCheck(check: UnshareCheck): void {
    this.unshareChecks.register(check);
  }
}
