import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { IntegrityFlagKind, IntegrityFlagStatus } from '@oj/contracts';
import { Column, DataSource, Entity, In, Index, PrimaryColumn } from 'typeorm';
import { IntegrityFlag, type FlagState } from '../domain/integrity-flag.js';
import { IntegrityFlagRepository } from '../domain/integrity-flag.repository.js';

@Entity('integrity_flags')
@Index(['sessionId', 'status'])
export class IntegrityFlagOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 16 }) kind: string;
  @Column({ type: 'varchar', length: 16 }) status: string;
  @Column({ type: 'varchar', length: 8 }) level: string;
  @Column('real') score: number;
  @Column('text') summary: string;
  @Column('jsonb', { default: [] }) reasons: string[];
  @Column('jsonb', { default: [] }) segments: FlagState['segments'];
  @Column('uuid') sessionId: string;
  @Column({ type: 'varchar', length: 200 }) sessionTitle: string;
  @Column({ type: 'varchar', length: 4 }) problemKey: string;
  @Column({ type: 'varchar', length: 210 }) problemTitle: string;
  @Column('jsonb') subject: FlagState['subject'];
  @Column('jsonb', { nullable: true }) matched: FlagState['matched'];
  /** Plagiarism: the two submission ids in order; unique, so a pair is flagged once (K-11). Null for AI-usage flags. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true }) pairKey: string | null;
  @Column('timestamptz') createdAt: Date;
  @Column('timestamptz', { nullable: true }) acknowledgedAt: Date | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) acknowledgedByName: string | null;
}

/** One row per (submission, check): makes checks idempotent across rejudges. */
@Entity('integrity_checks')
export class IntegrityCheckOrmEntity {
  @PrimaryColumn('uuid') submissionId: string;
  @PrimaryColumn({ type: 'varchar', length: 16 }) kind: string;
  @Column('timestamptz') checkedAt: Date;
}

/**
 * One row per student and problem of a session whose first accepted solution had the AI-usage review (OJ-21), so
 * resubmitting cannot spend the teacher's allowance again (OJ-26: before, a hashed id in `integrity_checks`).
 */
@Entity('integrity_first_reviews')
export class IntegrityFirstReviewOrmEntity {
  @PrimaryColumn('uuid') sessionId: string;
  @PrimaryColumn({ type: 'varchar', length: 4 }) problemKey: string;
  @PrimaryColumn('uuid') userId: string;
  @Column('timestamptz') reviewedAt: Date;
}

@Injectable()
export class TypeOrmIntegrityFlagRepository extends IntegrityFlagRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  private get repo() {
    return this.db.getRepository(IntegrityFlagOrmEntity);
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toDomain(row) : null;
  }

  async list(filter: { sessionIds: string[] | 'ALL'; status?: IntegrityFlagStatus }) {
    if (filter.sessionIds !== 'ALL' && !filter.sessionIds.length) return [];
    const rows = await this.repo.find({
      where: {
        ...(filter.sessionIds === 'ALL' ? {} : { sessionId: In(filter.sessionIds) }),
        ...(filter.status ? { status: filter.status } : {}),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDomain);
  }

  async save(flag: IntegrityFlag) {
    await this.repo.save({ id: flag.id, ...flag.snapshot, pairKey: flag.pairKey });
  }

  async addIfNewPair(flag: IntegrityFlag) {
    // ON CONFLICT DO NOTHING ... RETURNING: a row comes back only when this call inserted it.
    const result = await this.repo.createQueryBuilder().insert()
      .values({ id: flag.id, ...flag.snapshot, pairKey: flag.pairKey })
      .orIgnore()
      .returning(['id'])
      .execute();
    return Array.isArray(result.raw) && result.raw.length > 0;
  }

  /** A table with its schema when one is configured (raw SQL does not get TypeORM's prefixing). */
  private table(entity: typeof IntegrityCheckOrmEntity | typeof IntegrityFirstReviewOrmEntity): string {
    const { schema, tableName } = this.db.getMetadata(entity);
    return schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
  }

  /** True only for the first caller: the row is inserted atomically, a repeat hits the primary key and returns nothing. */
  async markChecked(submissionId: string, kind: IntegrityFlagKind) {
    const rows: unknown[] = await this.db.query(
      `INSERT INTO ${this.table(IntegrityCheckOrmEntity)} ("submissionId", "kind", "checkedAt") VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING RETURNING "submissionId"`,
      [submissionId, kind],
    );
    return rows.length > 0;
  }

  /** Atomic like `markChecked`: the primary key (session, problem, student) lets only the first claim insert. */
  async claimFirstAiReview(sessionId: string, problemKey: string, userId: string) {
    const rows: unknown[] = await this.db.query(
      `INSERT INTO ${this.table(IntegrityFirstReviewOrmEntity)} ("sessionId", "problemKey", "userId", "reviewedAt") VALUES ($1, $2, $3, now())
       ON CONFLICT DO NOTHING RETURNING "userId"`,
      [sessionId, problemKey, userId],
    );
    return rows.length > 0;
  }

  async releaseFirstAiReview(sessionId: string, problemKey: string, userId: string) {
    await this.db.query(
      `DELETE FROM ${this.table(IntegrityFirstReviewOrmEntity)} WHERE "sessionId" = $1 AND "problemKey" = $2 AND "userId" = $3`,
      [sessionId, problemKey, userId],
    );
  }

  async sessionIdsWithFlags() {
    const rows = await this.repo.createQueryBuilder('f').select('DISTINCT f.sessionId', 'sessionId').getRawMany<{ sessionId: string }>();
    return rows.map((r) => r.sessionId);
  }
}

function toDomain(row: IntegrityFlagOrmEntity): IntegrityFlag {
  return IntegrityFlag.rehydrate(row.id, {
    kind: row.kind as IntegrityFlagKind,
    status: row.status as IntegrityFlagStatus,
    level: row.level as 'MEDIUM' | 'HIGH',
    score: row.score,
    summary: row.summary,
    reasons: row.reasons,
    segments: row.segments,
    sessionId: row.sessionId,
    sessionTitle: row.sessionTitle,
    problemKey: row.problemKey,
    problemTitle: row.problemTitle,
    subject: row.subject,
    matched: row.matched,
    createdAt: row.createdAt,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedByName: row.acknowledgedByName,
  });
}

