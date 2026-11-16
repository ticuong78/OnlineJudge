import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ProblemSetType } from '@oj/contracts';
import { DataSource, In } from 'typeorm';
import { LearningRecordStore, type RecordProgress, type RecordSession } from '../application/ports.js';
import { LearningProgressOrmEntity, LearningSessionOrmEntity } from './orm-entities.js';

@Injectable()
export class TypeOrmLearningRecordStore extends LearningRecordStore {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  private get sessions() {
    return this.db.getRepository(LearningSessionOrmEntity);
  }

  private get progress() {
    return this.db.getRepository(LearningProgressOrmEntity);
  }

  async putSession(s: RecordSession) {
    await this.sessions.save({ ...s });
  }

  async getSessions(ids: string[]) {
    if (!ids.length) return new Map<string, RecordSession>();
    const rows = await this.sessions.findBy({ sessionId: In(ids) });
    return new Map(rows.map((r) => [r.sessionId, { ...r, type: r.type as ProblemSetType }]));
  }

  async markUnavailable(ids: string[], classDeleted: boolean) {
    if (!ids.length) return;
    await this.sessions.update({ sessionId: In(ids) }, classDeleted ? { available: false, classDeleted: true } : { available: false });
  }

  /** Atomic upsert: best score is kept, the first accepted submission sets solvedAt. */
  async recordAttempt(input: {
    userId: string;
    userDisplayName: string;
    sessionId: string;
    problemKey: string;
    score: number;
    accepted: boolean;
    at: Date;
  }) {
    await this.db.query(
      `INSERT INTO learning_progress ("userId", "sessionId", "problemKey", "userDisplayName", "bestScore", "solvedAt", "lastSubmittedAt", "attempts")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       ON CONFLICT ("userId", "sessionId", "problemKey") DO UPDATE SET
         "userDisplayName" = EXCLUDED."userDisplayName",
         "bestScore" = GREATEST(learning_progress."bestScore", EXCLUDED."bestScore"),
         "solvedAt" = COALESCE(learning_progress."solvedAt", EXCLUDED."solvedAt"),
         "lastSubmittedAt" = GREATEST(learning_progress."lastSubmittedAt", EXCLUDED."lastSubmittedAt"),
         "attempts" = learning_progress."attempts" + 1`,
      [input.userId, input.sessionId, input.problemKey, input.userDisplayName, input.score, input.accepted ? input.at : null, input.at],
    );
  }

  async progressOfUser(userId: string, sessionIds?: string[]) {
    if (sessionIds && !sessionIds.length) return [];
    const rows = await this.progress.findBy(sessionIds ? { userId, sessionId: In(sessionIds) } : { userId });
    return rows.map(toProgress);
  }

  async progressOfSession(sessionId: string) {
    return (await this.progress.findBy({ sessionId })).map(toProgress);
  }

  async progressOfSessions(sessionIds: string[]) {
    if (!sessionIds.length) return [];
    return (await this.progress.findBy({ sessionId: In(sessionIds) })).map(toProgress);
  }

  async resetProgress(sessionId: string, problemKey: string | null) {
    await this.progress.delete(problemKey ? { sessionId, problemKey } : { sessionId });
  }
}

function toProgress(r: LearningProgressOrmEntity): RecordProgress {
  return { ...r };
}
