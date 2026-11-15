import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { FeedbackMode, Language } from '@oj/contracts';
import type { SessionProblem } from '../domain/session.js';

@Entity('problem_sets')
export class ProblemSetOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Index()
  @Column('uuid') ownerId: string;
  @Column({ type: 'varchar', length: 80 }) ownerName: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column('text', { default: '' }) description: string;
  @Column({ type: 'varchar', length: 16 }) type: string;
  /** Items are part of the aggregate and always loaded with it, so jsonb is the simplest fit. */
  @Column('jsonb', { default: [] }) items: { problemId: string; points: number }[];
  @Index()
  @Column('boolean', { default: false }) isPublic: boolean;
  @Column('uuid', { nullable: true }) copiedFromId: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) copiedFromTitle: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) copiedFromOwner: string | null;
  @Column('timestamptz') createdAt: Date;
}

export type StoredSessionProblem = Omit<SessionProblem, 'testCases'>;

@Entity('sessions')
export class SessionOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column('text', { default: '' }) description: string;
  @Column({ type: 'varchar', length: 16 }) type: string;
  @Index()
  @Column('uuid', { nullable: true }) classId: string | null;
  @Column('uuid', { nullable: true }) sourceSetId: string | null;
  /** Unique: the database refuses a second session of the same bank item for the same audience (double clicks). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120, nullable: true }) assignmentKey: string | null;
  @Column('timestamptz', { nullable: true }) opensAt: Date | null;
  @Column('timestamptz', { nullable: true }) closesAt: Date | null;
  @Column('jsonb', { default: {} }) settings: {
    durationMinutes: number | null;
    allowedLanguages: Language[];
    maxSubmissionsPerProblem: number | null;
    feedback: FeedbackMode;
    checkPlagiarism?: boolean;
    checkAiUsage?: boolean;
    hideTopics?: boolean;
  };
  @Column('uuid') createdById: string;
  @Column({ type: 'varchar', length: 80 }) createdByName: string;
  /** Frozen problems without test data (kept small for listings). */
  @Column('jsonb') problems: StoredSessionProblem[];
  /** Keys of problems removed by a sync with the source set; never reused. */
  @Column('jsonb', { default: [] }) retiredKeys: string[];
  @Column('timestamptz') createdAt: Date;
}

/** Frozen test data of a session, loaded only when one session is opened or judged. */
@Entity('session_tests')
export class SessionTestsOrmEntity {
  @PrimaryColumn('uuid') sessionId: string;
  /** key -> test cases */
  @Column('jsonb') tests: Record<string, SessionProblem['testCases']>;
}

/** A participant's personal timer in a timed session. */
@Entity('session_attempts')
export class SessionAttemptOrmEntity {
  @PrimaryColumn('uuid') sessionId: string;
  @PrimaryColumn('uuid') userId: string;
  @Column('timestamptz') startedAt: Date;
  @Column('timestamptz') endsAt: Date;
}

// ---------- Learning record projection ----------

@Entity('learning_sessions')
export class LearningSessionOrmEntity {
  @PrimaryColumn('uuid') sessionId: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'varchar', length: 16 }) type: string;
  @Column('uuid', { nullable: true }) classId: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) className: string | null;
  @Column('jsonb') problems: { key: string; title: string; points: number; tags?: string[] }[];
  @Column('boolean', { default: true }) available: boolean;
  @Column('boolean', { default: false }) classDeleted: boolean;
}

@Entity('learning_progress')
export class LearningProgressOrmEntity {
  @PrimaryColumn('uuid') userId: string;
  @PrimaryColumn('uuid') sessionId: string;
  @PrimaryColumn({ type: 'varchar', length: 4 }) problemKey: string;
  @Column({ type: 'varchar', length: 80 }) userDisplayName: string;
  @Column('real', { default: 0 }) bestScore: number;
  @Column('timestamptz', { nullable: true }) solvedAt: Date | null;
  @Column('timestamptz') lastSubmittedAt: Date;
  @Column('int', { default: 0 }) attempts: number;
}

/** Learning paths (OJ-24): the steps are part of the aggregate and always loaded with it, so jsonb. */
@Entity('learning_paths')
export class LearningPathOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Index()
  @Column('uuid') ownerId: string;
  @Column({ type: 'varchar', length: 80 }) ownerName: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column('text', { default: '' }) description: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) topic: string | null;
  @Index()
  @Column('boolean', { default: false }) isPublic: boolean;
  @Column('jsonb') steps: { sessionId: string; title: string; note: string }[];
  @Column('timestamptz') createdAt: Date;
  @Column('timestamptz') updatedAt: Date;
}

