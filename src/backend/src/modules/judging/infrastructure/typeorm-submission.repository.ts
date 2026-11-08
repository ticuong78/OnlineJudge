import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Language, SubmissionStatus, Verdict } from '@oj/contracts';
import { In, Repository } from 'typeorm';
import { FREE_PROGRAM_ERRORS, SourceCode, Submission, type FaultSource } from '../domain/submission.js';
import {
  SubmissionQueries,
  SubmissionRepository,
  type Admission,
  type AdmissionLimits,
  type StaleCursor,
  type SubmissionListFilter,
} from '../domain/submission.repository.js';
import { SubmissionOrmEntity } from './submission.orm-entity.js';

@Injectable()
export class TypeOrmSubmissionRepository extends SubmissionRepository {
  constructor(@InjectRepository(SubmissionOrmEntity) private readonly repo: Repository<SubmissionOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toDomain(row) : null;
  }

  async save(submission: Submission) {
    await this.repo.save(toRow(submission));
  }

  async admit(submission: Submission, limits: AdmissionLimits): Promise<Admission> {
    const s = submission.snapshot;
    return this.repo.manager.transaction(async (tx) => {
      // Submissions of one user are admitted one at a time: the counts below cannot change until this commits.
      // (The lock is per transaction and held for milliseconds; other users are not held up.)
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`submit:${s.userId}`]);

      const pending = await tx.countBy(SubmissionOrmEntity, { userId: s.userId, status: In(['PENDING', 'JUDGING']) });
      if (pending >= limits.maxPending) return 'TOO_MANY_PENDING';

      if (limits.maxForProblem !== null) {
        // Real attempts (pending ones included), plus system errors attributed to the program beyond the free ones
        // (FREE_PROGRAM_ERRORS). Infrastructure errors never count.
        const counts = await tx
          .createQueryBuilder(SubmissionOrmEntity, 'x')
          .select(`COUNT(*) FILTER (WHERE "x"."verdict" IS DISTINCT FROM 'IE')`, 'attempts')
          .addSelect(`COUNT(*) FILTER (WHERE "x"."verdict" = 'IE' AND "x"."faultSource" = 'program')`, 'programErrors')
          .where('x.userId = :userId AND x.sessionId = :sessionId AND x.problemKey = :key', {
            userId: s.userId,
            sessionId: s.sessionId,
            key: s.problemKey,
          })
          .getRawOne<{ attempts: string; programErrors: string }>();
        const attempts = Number(counts?.attempts ?? 0) + Math.max(0, Number(counts?.programErrors ?? 0) - FREE_PROGRAM_ERRORS);
        if (attempts >= limits.maxForProblem) return 'PROBLEM_LIMIT_REACHED';
      }

      await tx.save(SubmissionOrmEntity, toRow(submission));
      return 'ADMITTED';
    });
  }

  async findBySession(sessionId: string, problemKey: string | null) {
    const rows = await this.repo.find({ where: problemKey ? { sessionId, problemKey } : { sessionId }, order: { createdAt: 'ASC' } });
    return rows.map(toDomain);
  }

  async findStale(queuedBefore: Date, limit: number, after?: StaleCursor) {
    const query = this.repo
      .createQueryBuilder('x')
      .where('x.status IN (:...open)', { open: ['PENDING', 'JUDGING'] })
      .andWhere('COALESCE(x.queuedAt, x.createdAt) < :queuedBefore', { queuedBefore });
    if (after) {
      query.andWhere('(COALESCE(x.queuedAt, x.createdAt), x.id) > (:afterAt, :afterId)', { afterAt: after.queuedAt, afterId: after.id });
    }
    const rows = await query
      .orderBy('COALESCE(x.queuedAt, x.createdAt)', 'ASC')
      .addOrderBy('x.id', 'ASC')
      .limit(limit)
      .getMany();
    return rows.map(toDomain);
  }

  async failIfUnfinished(id: string, judgeRun: number, reason: string, now = new Date()) {
    // One conditional UPDATE: if a result was stored in the meantime it matches no row and is left alone.
    const result = await this.repo
      .createQueryBuilder()
      .update(SubmissionOrmEntity)
      .set({ status: 'DONE', verdict: 'IE', score: 0, testResults: [], compileOutput: reason, faultSource: 'infrastructure', judgedAt: now })
      .where('"id" = :id AND "judgeRun" = :judgeRun AND "status" <> :done', { id, judgeRun, done: 'DONE' })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}

@Injectable()
export class TypeOrmSubmissionQueries extends SubmissionQueries {
  constructor(@InjectRepository(SubmissionOrmEntity) private readonly repo: Repository<SubmissionOrmEntity>) {
    super();
  }

  async list(filter: SubmissionListFilter) {
    const where = {
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
      ...(filter.problemKey ? { problemKey: filter.problemKey } : {}),
    };
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
    return { items: rows.map(toDomain), total };
  }
}

function toRow(submission: Submission): SubmissionOrmEntity {
  const s = submission.snapshot;
  return {
    id: submission.id,
    userId: s.userId,
    userDisplayName: s.userDisplayName,
    sessionId: s.sessionId,
    sessionTitle: s.sessionTitle,
    problemKey: s.problemKey,
    problemTitle: s.problemTitle,
    language: s.source.language,
    sourceCode: s.source.text,
    totalPoints: s.totalPoints,
    judgeRun: s.judgeRun,
    status: s.status,
    verdict: s.verdict,
    score: s.score,
    compileOutput: s.compileOutput,
    faultSource: s.faultSource,
    testResults: s.testResults,
    createdAt: s.createdAt,
    queuedAt: s.queuedAt,
    judgedAt: s.judgedAt,
  };
}

function toDomain(row: SubmissionOrmEntity): Submission {
  return Submission.rehydrate(row.id, {
    userId: row.userId,
    userDisplayName: row.userDisplayName,
    sessionId: row.sessionId,
    sessionTitle: row.sessionTitle,
    problemKey: row.problemKey,
    problemTitle: row.problemTitle,
    source: SourceCode.of(row.language as Language, row.sourceCode),
    totalPoints: row.totalPoints,
    judgeRun: row.judgeRun,
    status: row.status as SubmissionStatus,
    verdict: row.verdict as Verdict | null,
    score: row.score,
    compileOutput: row.compileOutput,
    faultSource: (row.faultSource as FaultSource | null) ?? null,
    testResults: row.testResults,
    createdAt: row.createdAt,
    queuedAt: row.queuedAt ?? row.createdAt,
    judgedAt: row.judgedAt,
  });
}
