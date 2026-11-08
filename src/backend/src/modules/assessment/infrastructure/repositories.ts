import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { BankScope, ProblemSetType } from '@oj/contracts';
import { DataSource, In, Repository } from 'typeorm';
import { ProblemSet } from '../domain/problem-set.js';
import { AttemptRepository, ProblemSetRepository, SessionRepository, type SessionFilter } from '../domain/repositories.js';
import { Attempt, Session, SessionSettings, TimeWindow } from '../domain/session.js';
import { ProblemSetOrmEntity, SessionAttemptOrmEntity, SessionOrmEntity, SessionTestsOrmEntity } from './orm-entities.js';

@Injectable()
export class TypeOrmProblemSetRepository extends ProblemSetRepository {
  constructor(@InjectRepository(ProblemSetOrmEntity) private readonly repo: Repository<ProblemSetOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toSet(row) : null;
  }

  async list(scope: BankScope, viewerId: string) {
    // Sets are not shared with organizations (OJ-8 pilot): that scope, like any unknown one, lists nothing.
    // Only `all` (administrator, checked by the service) means every set.
    const where = scope === 'mine' ? { ownerId: viewerId } : scope === 'public' ? { isPublic: true } : scope === 'all' ? {} : null;
    if (!where) return [];
    return (await this.repo.find({ where, order: { createdAt: 'DESC' } })).map(toSet);
  }

  async findContainingProblem(problemId: string) {
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.items @> :needle::jsonb', { needle: JSON.stringify([{ problemId }]) })
      .getMany();
    return rows.map(toSet);
  }

  async save(set: ProblemSet) {
    const s = set.snapshot;
    await this.repo.save({
      id: set.id,
      ownerId: s.owner.id,
      ownerName: s.owner.name,
      title: s.title,
      description: s.description,
      type: s.type,
      items: s.items,
      isPublic: s.isPublic,
      copiedFromId: s.copiedFrom?.id ?? null,
      copiedFromTitle: s.copiedFrom?.code ?? null,
      copiedFromOwner: s.copiedFrom?.ownerName ?? null,
      createdAt: s.createdAt,
    });
  }

  async delete(id: string) {
    await this.repo.delete({ id });
  }
}

function toSet(row: ProblemSetOrmEntity): ProblemSet {
  return ProblemSet.rehydrate(row.id, {
    title: row.title,
    description: row.description,
    type: row.type as ProblemSetType,
    owner: { id: row.ownerId, name: row.ownerName },
    items: row.items,
    isPublic: row.isPublic,
    copiedFrom: row.copiedFromId
      ? { id: row.copiedFromId, code: row.copiedFromTitle ?? '', ownerName: row.copiedFromOwner ?? '' }
      : null,
    createdAt: row.createdAt,
  });
}

/** Sessions are stored as a row (problems without tests) plus a row of frozen test data. */
@Injectable()
export class TypeOrmSessionRepository extends SessionRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  async findById(id: string) {
    const row = await this.db.getRepository(SessionOrmEntity).findOneBy({ id });
    if (!row) return null;
    const tests = await this.db.getRepository(SessionTestsOrmEntity).findOneBy({ sessionId: id });
    return toSession(row, tests?.tests ?? {});
  }

  /** Listing: test data is not loaded (problems have empty `testCases`). */
  async list(filter: SessionFilter) {
    const conditions: string[] = [];
    if (filter.includeClass) {
      if (filter.classIds === 'ALL') conditions.push('s.classId IS NOT NULL');
      else if (filter.classIds.length) conditions.push('s.classId IN (:...classIds)');
    }
    if (filter.includePublic) conditions.push('s.classId IS NULL');
    if (!conditions.length) return [];
    const rows = await this.db
      .getRepository(SessionOrmEntity)
      .createQueryBuilder('s')
      .where(`(${conditions.join(' OR ')})`, { classIds: filter.classIds === 'ALL' ? [] : filter.classIds })
      .orderBy('s.createdAt', 'DESC')
      .getMany();
    return rows.map((row) => toSession(row, {}));
  }

  async findByClass(classId: string) {
    return (await this.db.getRepository(SessionOrmEntity).findBy({ classId })).map((row) => toSession(row, {}));
  }

  async findByAssignmentKey(assignmentKey: string) {
    const row = await this.db.getRepository(SessionOrmEntity).findOneBy({ assignmentKey });
    return row ? toSession(row, {}) : null;
  }

  async save(session: Session) {
    const s = session.snapshot;
    await this.db.transaction(async (tx) => {
      await tx.getRepository(SessionOrmEntity).save({
        id: session.id,
        title: s.title,
        description: s.description,
        type: s.type,
        classId: s.classId,
        sourceSetId: s.sourceSetId,
        assignmentKey: s.assignmentKey,
        opensAt: s.window.opensAt,
        closesAt: s.window.closesAt,
        settings: {
          durationMinutes: s.settings.durationMinutes,
          allowedLanguages: s.settings.allowedLanguages,
          maxSubmissionsPerProblem: s.settings.maxSubmissionsPerProblem,
          feedback: s.settings.feedback,
          checkPlagiarism: s.settings.checkPlagiarism,
          checkAiUsage: s.settings.checkAiUsage,
        },
        createdById: s.createdBy.id,
        createdByName: s.createdBy.name,
        problems: s.problems.map(({ testCases: _, ...p }) => p),
        retiredKeys: s.retiredKeys,
        createdAt: s.createdAt,
      });
      // Tests are only written when present (aggregate loaded with tests, e.g. after create or refresh).
      if (s.problems.some((p) => p.testCases.length)) {
        await tx.getRepository(SessionTestsOrmEntity).save({
          sessionId: session.id,
          tests: Object.fromEntries(s.problems.map((p) => [p.key, p.testCases])),
        });
      }
    });
  }

  async delete(id: string) {
    await this.db.transaction(async (tx) => {
      await tx.getRepository(SessionTestsOrmEntity).delete({ sessionId: id });
      await tx.getRepository(SessionOrmEntity).delete({ id });
    });
  }
}

function toSession(row: SessionOrmEntity, tests: Record<string, Session['snapshot']['problems'][number]['testCases']>): Session {
  return Session.rehydrate(row.id, {
    title: row.title,
    description: row.description,
    type: row.type as ProblemSetType,
    classId: row.classId,
    sourceSetId: row.sourceSetId,
    assignmentKey: row.assignmentKey ?? null,
    window: TimeWindow.of(row.opensAt, row.closesAt),
    settings: row.settings?.feedback ? SessionSettings.of(row.settings) : SessionSettings.defaults,
    createdBy: { id: row.createdById, name: row.createdByName },
    problems: row.problems.map((p) => ({ ...p, testCases: tests[p.key] ?? [] })),
    retiredKeys: row.retiredKeys ?? [],
    createdAt: row.createdAt,
  });
}


@Injectable()
export class TypeOrmAttemptRepository extends AttemptRepository {
  constructor(@InjectRepository(SessionAttemptOrmEntity) private readonly repo: Repository<SessionAttemptOrmEntity>) {
    super();
  }

  async find(sessionId: string, userId: string) {
    const row = await this.repo.findOneBy({ sessionId, userId });
    return row ? Attempt.rehydrate(row.sessionId, row.userId, row.startedAt, row.endsAt) : null;
  }

  async findForUser(userId: string, sessionIds: string[]) {
    if (!sessionIds.length) return [];
    const rows = await this.repo.findBy({ userId, sessionId: In(sessionIds) });
    return rows.map((r) => Attempt.rehydrate(r.sessionId, r.userId, r.startedAt, r.endsAt));
  }

  async save(a: Attempt) {
    await this.repo.save({ sessionId: a.sessionId, userId: a.userId, startedAt: a.startedAt, endsAt: a.endsAt });
  }

  async deleteBySession(sessionId: string) {
    await this.repo.delete({ sessionId });
  }
}
