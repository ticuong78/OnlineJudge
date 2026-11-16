import type { IntegrityFlagKind, IntegrityFlagStatus } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { stripExternalLinks } from '../../../shared/domain/external-links.js';

export const PLAGIARISM_MEDIUM = 0.75;
export const PLAGIARISM_HIGH = 0.9;

/**
 * The AI-use review is the only model output that is stored (OJ-29, playbook 4.4): it is cut to these sizes and its
 * links removed before it becomes a flag, whatever the model wrote. Longer text is cut, not rejected: a cut hint
 * still helps the teacher.
 */
export const AI_REVIEW_LIMITS = { summary: 300, reasons: 5, reason: 300, segments: 10, segmentReason: 200 } as const;
const AI_SUMMARY_PREFIX = 'Có nguy cơ dùng AI: ';
const MAX_REVIEW_LINE = 100_000;

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
      summary: AI_SUMMARY_PREFIX + (cut(clean(review.summary), AI_REVIEW_LIMITS.summary - AI_SUMMARY_PREFIX.length) || 'xem các dấu hiệu bên dưới.'),
      reasons: review.reasons
        .map((r) => cut(clean(r), AI_REVIEW_LIMITS.reason))
        .filter(Boolean)
        .slice(0, AI_REVIEW_LIMITS.reasons),
      segments: review.segments
        .map((s) => ({
          startLine: lineNumber(s.startLine),
          endLine: Math.max(lineNumber(s.startLine), lineNumber(s.endLine)),
          reason: cut(clean(s.reason), AI_REVIEW_LIMITS.segmentReason),
        }))
        .filter((s) => s.reason)
        .slice(0, AI_REVIEW_LIMITS.segments),
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

/** Model text without links to other places, on one tidy line. */
const clean = (text: string) => stripExternalLinks(text).text.replace(/\s+/g, ' ').trim();
/** At most `max` characters, ending in "…" when cut; never half of a surrogate pair (an emoji). */
const cut = (text: string, max: number) => {
  if (text.length <= max) return text;
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end).trimEnd()}…`;
};
/** A line number as stored: a whole number from 1 (a submission is far shorter than the upper bound). */
const lineNumber = (n: number) => (Number.isFinite(n) ? Math.min(MAX_REVIEW_LINE, Math.max(1, Math.round(n))) : 1);
