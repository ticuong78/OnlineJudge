import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Difficulty, Language } from '@oj/contracts';
import { DataSource, In, Not } from 'typeorm';
import { Problem, ResourceLimits, Sharing, Solution, TestCase } from '../domain/problem.js';
import {
  ProblemQueries,
  ProblemRepository,
  type ProblemListFilter,
  type ProblemSummaryRow,
} from '../domain/problem.repository.js';
import { ProblemOrmEntity, TestCaseOrmEntity } from './problem.orm-entities.js';

@Injectable()
export class TypeOrmProblemRepository extends ProblemRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  async findById(id: string) {
    const [problem] = await this.findByIds([id]);
    return problem ?? null;
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.getRepository(ProblemOrmEntity).find({
      where: { id: In(ids) },
      relations: { testCases: true },
      order: { testCases: { order: 'ASC' } },
    });
    return rows.map(toDomain);
  }

  async findByOwnerSharedWith(ownerId: string, organizationId: string) {
    const ids = await this.db
      .getRepository(ProblemOrmEntity)
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.ownerId = :ownerId AND :org = ANY(p.sharedOrganizationIds)', { ownerId, org: organizationId })
      .getRawMany<{ id: string }>();
    return this.findByIds(ids.map((r) => r.id));
  }

  async nextSeq() {
    const row = await this.db
      .getRepository(ProblemOrmEntity)
      .createQueryBuilder('p')
      .select('COALESCE(MAX(p.seq), 0)', 'max')
      .getRawOne<{ max: number }>();
    return Number(row?.max ?? 0) + 1;
  }

  /** Persists the whole aggregate (root + test cases) atomically. */
  async save(problem: Problem) {
    await this.db.transaction(async (tx) => {
      const c = problem.content;
      await tx.getRepository(ProblemOrmEntity).save({
        id: problem.id,
        seq: problem.seq,
        ownerId: problem.owner.id,
        ownerName: problem.owner.name,
        isPublic: problem.sharing.isPublic,
        publicTests: problem.sharing.publicTests,
        publicSolution: problem.sharing.publicSolution,
        sharedOrganizationIds: [...problem.sharing.organizationIds],
        copiedFromId: problem.copiedFrom?.id ?? null,
        copiedFromCode: problem.copiedFrom?.code ?? null,
        copiedFromOwner: problem.copiedFrom?.ownerName ?? null,
        title: c.title,
        difficulty: c.difficulty,
        tags: c.tags,
        statement: c.statement,
        inputFormat: c.inputFormat,
        outputFormat: c.outputFormat,
        constraints: c.constraints,
        timeLimitMs: problem.limits.timeLimitMs,
        memoryLimitMb: problem.limits.memoryLimitMb,
        solutionExplanation: problem.solution?.explanation ?? null,
        solutionLanguage: problem.solution?.language ?? null,
        solutionCode: problem.solution?.code ?? null,
        createdAt: problem.createdAt,
      });

      const ids = problem.testCases.map((t) => t.id);
      await tx.getRepository(TestCaseOrmEntity).delete(
        ids.length ? { problemId: problem.id, id: Not(In(ids)) } : { problemId: problem.id },
      );
      if (ids.length) {
        await tx.getRepository(TestCaseOrmEntity).save(
          problem.testCases.map((t) => ({ id: t.id, problemId: problem.id, order: t.order, ...t.data })),
          { chunk: 50 },
        );
      }
    });
  }

  async delete(id: string) {
    await this.db.getRepository(ProblemOrmEntity).delete({ id });
  }
}

@Injectable()
export class TypeOrmProblemQueries extends ProblemQueries {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  async list(filter: ProblemListFilter) {
    const qb = this.db
      .getRepository(ProblemOrmEntity)
      .createQueryBuilder('p')
      .select([
        'p.id', 'p.seq', 'p.title', 'p.difficulty', 'p.tags', 'p.timeLimitMs', 'p.memoryLimitMb',
        'p.solutionExplanation', 'p.solutionCode', 'p.createdAt', 'p.ownerId', 'p.ownerName',
        'p.isPublic', 'p.publicTests', 'p.publicSolution', 'p.sharedOrganizationIds',
        'p.copiedFromId', 'p.copiedFromCode', 'p.copiedFromOwner',
      ]);
    if (filter.scope === 'mine') qb.andWhere('p.ownerId = :viewer', { viewer: filter.viewerId });
    else if (filter.scope === 'public') qb.andWhere('p.isPublic = true');
    else if (filter.scope === 'organization') {
      // Only organizations the service has checked against the viewer's memberships; none = nothing.
      const orgs = filter.organizationIds ?? [];
      if (!orgs.length) qb.andWhere('1 = 0');
      else qb.andWhere('p.sharedOrganizationIds && CAST(:orgs AS uuid[])', { orgs });
    }
    if (filter.search) {
      qb.andWhere('(p.title ILIKE :q OR p.statement ILIKE :q OR CAST(p.seq AS text) = :seq)', {
        q: `%${filter.search}%`,
        seq: filter.search.replace(/^p0*/i, ''),
      });
    }
    if (filter.difficulty) qb.andWhere('p.difficulty = :d', { d: filter.difficulty });
    if (filter.tag) qb.andWhere(':tag = ANY(p.tags)', { tag: filter.tag.toLowerCase() });

    const [rows, total] = await qb
      .orderBy('p.seq', 'ASC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();

    const counts = new Map<string, number>();
    if (rows.length) {
      const raw = await this.db
        .getRepository(TestCaseOrmEntity)
        .createQueryBuilder('t')
        .select('t.problemId', 'problemId')
        .addSelect('COUNT(*)', 'count')
        .where('t.problemId IN (:...ids)', { ids: rows.map((r) => r.id) })
        .groupBy('t.problemId')
        .getRawMany<{ problemId: string; count: string }>();
      raw.forEach((r) => counts.set(r.problemId, Number(r.count)));
    }

    return {
      total,
      rows: rows.map(
        (r): ProblemSummaryRow => ({
          id: r.id,
          seq: r.seq,
          title: r.title,
          difficulty: r.difficulty as Difficulty,
          tags: r.tags,
          timeLimitMs: r.timeLimitMs,
          memoryLimitMb: r.memoryLimitMb,
          testCaseCount: counts.get(r.id) ?? 0,
          hasSolution: Boolean(r.solutionExplanation || r.solutionCode),
          owner: { id: r.ownerId, name: r.ownerName },
          sharing: sharingOf(r),
          copiedFrom: sourceOf(r),
          createdAt: r.createdAt,
        }),
      ),
    };
  }
}

function toDomain(row: ProblemOrmEntity): Problem {
  const hasSolution = row.solutionExplanation !== null || row.solutionCode !== null;
  return Problem.rehydrate(row.id, {
    seq: row.seq,
    owner: { id: row.ownerId, name: row.ownerName },
    sharing: sharingOf(row),
    copiedFrom: sourceOf(row),
    content: {
      title: row.title,
      difficulty: row.difficulty as Difficulty,
      tags: row.tags,
      statement: row.statement,
      inputFormat: row.inputFormat,
      outputFormat: row.outputFormat,
      constraints: row.constraints,
    },
    limits: ResourceLimits.of(row.timeLimitMs, row.memoryLimitMb),
    testCases: (row.testCases ?? []).map(
      (t) => new TestCase(t.id, { input: t.input, expectedOutput: t.expectedOutput, isSample: t.isSample, points: t.points }, t.order),
    ),
    solution: hasSolution
      ? Solution.of(row.solutionExplanation ?? '', row.solutionLanguage as Language | null, row.solutionCode ?? '')
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function sharingOf(row: ProblemOrmEntity): Sharing {
  return Sharing.of(row.isPublic, row.publicTests, row.publicSolution, row.sharedOrganizationIds ?? []);
}

function sourceOf(row: ProblemOrmEntity) {
  return row.copiedFromId
    ? { id: row.copiedFromId, code: row.copiedFromCode ?? '', ownerName: row.copiedFromOwner ?? '' }
    : null;
}
