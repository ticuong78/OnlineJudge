import type { IntegrityFlagKind, IntegrityFlagStatus } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';

export const PLAGIARISM_MEDIUM = 0.75;
export const PLAGIARISM_HIGH = 0.9;

export interface SubmissionRef {
  submissionId: string;
  userId: string;
  userDisplayName: string;
}

export interface FlagState {
  kind: IntegrityFlagKind;
  status: IntegrityFlagStatus;
  level: 'MEDIUM' | 'HIGH';
  score: number;
  summary: string;
  reasons: string[];
  segments: { startLine: number; endLine: number; reason: string }[];
  sessionId: string;
  sessionTitle: string;
  problemKey: string;
  problemTitle: string;
  subject: SubmissionRef;
  matched: SubmissionRef | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByName: string | null;
}

export interface FlagContext {
  sessionId: string;
  sessionTitle: string;
  problemKey: string;
  problemTitle: string;
}

/**
 * A review hint for the teacher ("gợi ý cần xem lại") about one submission.
 * It is never a verdict: it changes no score and is never shown to students.
 * The only transition is OPEN -> ACKNOWLEDGED ("Đã xem").
 */
export class IntegrityFlag extends AggregateRoot {
  private constructor(id: string, private state: FlagState) {
    super(id);
  }

  /** Returns null when the similarity is below the review threshold. */
  static plagiarism(ctx: FlagContext, subject: SubmissionRef, matched: SubmissionRef, similarity: number): IntegrityFlag | null {
    if (similarity < PLAGIARISM_MEDIUM) return null;
    const percent = Math.round(similarity * 100);
    return new IntegrityFlag(newId(), {
      ...ctx,
      kind: 'PLAGIARISM',
      status: 'OPEN',
      level: similarity >= PLAGIARISM_HIGH ? 'HIGH' : 'MEDIUM',
      score: Math.round(similarity * 1000) / 1000,
      summary: `Có nguy cơ sao chép: giống ${percent}% với bài của ${matched.userDisplayName}.`,
      reasons: [`Cấu trúc code giống ${percent}% sau khi bỏ qua tên biến, chú thích và định dạng.`],
      segments: [],
      subject,
      matched,
      createdAt: new Date(),
      acknowledgedAt: null,
      acknowledgedByName: null,
    });
  }

  /** Returns null for a low risk. */
  static aiUsage(
    ctx: FlagContext,
    subject: SubmissionRef,
    review: { risk: 'LOW' | 'MEDIUM' | 'HIGH'; summary: string; reasons: string[]; segments: FlagState['segments'] },
  ): IntegrityFlag | null {
    if (review.risk === 'LOW') return null;
    return new IntegrityFlag(newId(), {
      ...ctx,
      kind: 'AI_USAGE',
      status: 'OPEN',
      level: review.risk,
      score: review.risk === 'HIGH' ? 0.9 : 0.5,
      summary: `Có nguy cơ dùng AI: ${review.summary}`,
      reasons: review.reasons,
      segments: review.segments,
      subject,
      matched: null,
      createdAt: new Date(),
      acknowledgedAt: null,
      acknowledgedByName: null,
    });
  }

  static rehydrate(id: string, state: FlagState): IntegrityFlag {
    return new IntegrityFlag(id, state);
  }

  /**
   * Plagiarism: the pair of submissions in a fixed order, so A-vs-B and B-vs-A are the same pair and only one flag is
   * kept per pair, whichever submission was checked first (K-11). Null for AI-usage flags.
   */
  get pairKey(): string | null {
    const { kind, subject, matched } = this.state;
    return kind === 'PLAGIARISM' && matched ? [subject.submissionId, matched.submissionId].sort().join('|') : null;
  }

  get snapshot(): Readonly<FlagState> {
    return this.state;
  }

  acknowledge(actor: Actor, now = new Date()): void {
    if (this.state.status === 'ACKNOWLEDGED') return;
    this.state = { ...this.state, status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedByName: actor.name };
  }
}
