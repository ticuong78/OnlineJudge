import type { ClassStatus, ProblemDetailDto, ProblemSetType } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import type { FrozenContent } from '../domain/session.js';

/** Port (ACL) towards Catalog. */
export abstract class ProblemCatalog {
  /** Details as `viewer` may see them (null = full); invisible/missing ids are omitted. */
  abstract getDetails(ids: string[], viewer: Actor | null): Promise<Map<string, ProblemDetailDto>>;
  /** Full frozen copies for a session; throws unless the actor owns them (admin: any) and they have tests. */
  abstract snapshot(actor: Actor, ids: string[]): Promise<FrozenContent[]>;
  /** Copies problems into the actor's bank; old id -> new id. */
  abstract copyIntoBank(actor: Actor, ids: string[]): Promise<Map<string, string>>;
}

export interface ClassInfo {
  id: string;
  name: string;
  teacherId: string;
  status: ClassStatus;
}

/** Port (ACL) towards Classroom. */
export abstract class ClassAccess {
  abstract getClasses(ids: string[]): Promise<Map<string, ClassInfo>>;
  /** 'ALL' for the admin. */
  abstract managedClassIds(actor: Actor): Promise<string[] | 'ALL'>;
  abstract canManage(actor: Actor, classId: string): Promise<boolean>;
  abstract membership(userId: string, classId: string): Promise<'current' | 'former' | null>;
  abstract classIdsOfStudent(studentId: string): Promise<string[]>;
  abstract currentStudents(classId: string): Promise<{ id: string; displayName: string }[]>;
}

// ---------- Learning record projection ----------

export interface RecordSession {
  sessionId: string;
  title: string;
  type: ProblemSetType;
  classId: string | null;
  className: string | null;
  /** `tags` (OJ-20) is missing on records written before topics were copied. */
  problems: { key: string; title: string; points: number; tags?: string[] }[];
  /** false once the session was deleted or its class deleted for good. */
  available: boolean;
  classDeleted: boolean;
}

export interface RecordProgress {
  userId: string;
  userDisplayName: string;
  sessionId: string;
  problemKey: string;
  /** 0..100 */
  bestScore: number;
  solvedAt: Date | null;
  lastSubmittedAt: Date;
  attempts: number;
}

/**
 * Port: the learning record ("học bạ") — a projection that outlives sessions and classes.
 * Fed by session creation/deletion and judged submissions.
 */
export abstract class LearningRecordStore {
  abstract putSession(session: RecordSession): Promise<void>;
  abstract getSessions(sessionIds: string[]): Promise<Map<string, RecordSession>>;
  abstract markUnavailable(sessionIds: string[], classDeleted: boolean): Promise<void>;
  /** Keeps the best score; the first AC sets solvedAt. */
  abstract recordAttempt(input: {
    userId: string;
    userDisplayName: string;
    sessionId: string;
    problemKey: string;
    score: number;
    accepted: boolean;
    at: Date;
  }): Promise<void>;
  abstract progressOfUser(userId: string, sessionIds?: string[]): Promise<RecordProgress[]>;
  abstract progressOfSession(sessionId: string): Promise<RecordProgress[]>;
  /** Forget progress of a session (or one of its problems) before a rejudge rebuilds it. */
  abstract resetProgress(sessionId: string, problemKey: string | null): Promise<void>;
}
