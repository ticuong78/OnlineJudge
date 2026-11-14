import type { ClassStatus } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import type { Thread } from '../domain/thread.js';

export abstract class ThreadRepository {
  abstract findById(id: string): Promise<Thread | null>;
  abstract listByClass(classId: string, topic?: { sessionId?: string; problemKey?: string }): Promise<Thread[]>;
  /**
   * Up to `limit` students' questions in these classes that no teacher or administrator has replied to, newest first.
   * One query (OJ-26, OJ-28): the filter runs in the database, not over every question ever asked.
   */
  abstract listAwaitingQuestions(classIds: string[], limit: number): Promise<Thread[]>;
  abstract save(thread: Thread): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract deleteByClass(classId: string): Promise<void>;
}

/** Port (ACL) towards Classroom. */
export abstract class ClassMembership {
  abstract status(classId: string): Promise<ClassStatus | null>;
  abstract canManage(actor: Actor, classId: string): Promise<boolean>;
  abstract membership(userId: string, classId: string): Promise<'current' | 'former' | null>;
  /**
   * Active classes the actor runs: their own (and their organizations' as org admin), or every active class for an
   * administrator (OJ-28: archived ones are left out before the database is asked for questions).
   */
  abstract activeManagedClassIds(actor: Actor): Promise<string[]>;
}

/** Port (ACL) towards Assessment. */
export abstract class SessionDirectory {
  abstract summary(sessionId: string): Promise<{ classId: string | null; title: string; problemKeys: string[] } | null>;
}
