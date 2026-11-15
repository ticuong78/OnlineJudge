import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ThreadKind } from '@oj/contracts';
import { Column, Entity, Index, PrimaryColumn, Repository } from 'typeorm';
import { ThreadRepository } from '../application/ports.js';
import { Thread, type ThreadState } from '../domain/thread.js';

type StoredReply = Omit<ThreadState['replies'][number], 'createdAt'> & { createdAt: string };

@Entity('class_threads')
@Index(['classId', 'lastActivityAt'])
export class ThreadOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') classId: string;
  @Column({ type: 'varchar', length: 16 }) kind: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column('text') body: string;
  @Column('jsonb') author: ThreadState['author'];
  @Column('boolean', { default: false }) pinned: boolean;
  @Index()
  @Column('uuid', { nullable: true }) sessionId: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) sessionTitle: string | null;
  @Column({ type: 'varchar', length: 4, nullable: true }) problemKey: string | null;
  /** Replies belong to the thread aggregate and are always loaded with it. */
  @Column('jsonb', { default: [] }) replies: StoredReply[];
  @Column('timestamptz') createdAt: Date;
  @Column('timestamptz') lastActivityAt: Date;
}

@Injectable()
export class TypeOrmThreadRepository extends ThreadRepository {
  constructor(@InjectRepository(ThreadOrmEntity) private readonly repo: Repository<ThreadOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toDomain(row) : null;
  }

  async listByClass(classId: string, topic?: { sessionId?: string; problemKey?: string }) {
    const rows = await this.repo.find({
      where: {
        classId,
        ...(topic?.sessionId ? { sessionId: topic.sessionId } : {}),
        ...(topic?.problemKey ? { problemKey: topic.problemKey.toUpperCase() } : {}),
      },
      order: { lastActivityAt: 'DESC' },
    });
    return rows.map(toDomain);
  }

  async listAwaitingQuestions(classIds: string[], limit: number) {
    if (classIds.length === 0) return [];
    const q = this.repo
      .createQueryBuilder('t')
      .where('t.kind = :kind', { kind: 'QUESTION' })
      .andWhere("t.author ->> 'role' = :role", { role: 'STUDENT' })
      // Same rule as Thread.awaitsAnswer: no reply yet from anyone who is not a student.
      .andWhere(`NOT jsonb_path_exists(t.replies, '$[*] ? (@.author.role != "STUDENT")')`)
      .andWhere('t.classId IN (:...classIds)', { classIds });
    const rows = await q.orderBy('t.createdAt', 'DESC').addOrderBy('t.id', 'ASC').take(limit).getMany();
    return rows.map(toDomain);
  }

  async save(thread: Thread) {
    const s = thread.snapshot;
    await this.repo.save({
      id: thread.id,
      classId: s.classId,
      kind: s.kind,
      title: s.title,
      body: s.body,
      author: s.author,
      pinned: s.pinned,
      sessionId: s.topic?.sessionId ?? null,
      sessionTitle: s.topic?.sessionTitle ?? null,
      problemKey: s.topic?.problemKey ?? null,
      replies: s.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
    });
  }

  async delete(id: string) {
    await this.repo.delete({ id });
  }

  async deleteByClass(classId: string) {
    await this.repo.delete({ classId });
  }
}

function toDomain(row: ThreadOrmEntity): Thread {
  return Thread.rehydrate(row.id, {
    classId: row.classId,
    kind: row.kind as ThreadKind,
    title: row.title,
    body: row.body,
    author: row.author,
    pinned: row.pinned,
    topic: row.sessionId ? { sessionId: row.sessionId, sessionTitle: row.sessionTitle ?? '', problemKey: row.problemKey } : null,
    replies: row.replies.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
  });
}
