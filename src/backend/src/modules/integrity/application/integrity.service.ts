import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IntegrityFlagDetailDto, IntegrityFlagDto, IntegrityFlagStatus } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { AiAccess } from '../../../shared/application/ai-access.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { SUBMISSION_JUDGED, type SubmissionJudgedEvent } from '../../judging/judging.events.js';
import { fingerprint, similarity } from '../domain/fingerprint.js';
import { IntegrityFlag, type FlagContext, type SubmissionRef } from '../domain/integrity-flag.js';
import { IntegrityFlagRepository } from '../domain/integrity-flag.repository.js';
import { AiUsageReviewer, SessionAccess, SubmissionSource, type SubmissionInfo } from './ports.js';

const MAX_CONCURRENT_CHECKS = 2;

/**
 * Background integrity checks after judging, and the teacher-only review of their results.
 * Checks never block judging: they are queued in-process and failures are only logged.
 */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);
  private running = 0;
  private readonly queue: (() => Promise<void>)[] = [];

  constructor(
    private readonly flags: IntegrityFlagRepository,
    private readonly submissions: SubmissionSource,
    private readonly sessions: SessionAccess,
    private readonly reviewer: AiUsageReviewer,
    private readonly ai: AiAccess,
  ) {}

  // ---------- Background checks ----------

  @OnEvent(SUBMISSION_JUDGED)
  onSubmissionJudged(event: SubmissionJudgedEvent): void {
    if (event.verdict === 'CE' || event.verdict === 'IE') return;
    this.enqueue(() => this.check(event.submissionId));
  }

  /** Runs the enabled checks for one submission (exposed for tests). */
  async check(submissionId: string): Promise<void> {
    const submission = await this.submissions.get(submissionId);
    if (!submission) return;
    const info = await this.sessions.checkInfo(submission.sessionId, submission.problemKey);
    if (!info) return;
    const ctx: FlagContext = {
      sessionId: submission.sessionId,
      sessionTitle: info.sessionTitle,
      problemKey: submission.problemKey,
      problemTitle: info.problemTitle,
    };
    if (info.checkPlagiarism && (await this.flags.markChecked(submission.id, 'PLAGIARISM'))) {
      await this.checkPlagiarism(ctx, submission);
    }
    // The AI review runs only for sessions of an administrator or a VIP teacher (checked now: a downgrade stops it).
    if (info.checkAiUsage && this.reviewer.available && (await this.ai.allows(info.ownerId))
      && (await this.flags.markChecked(submission.id, 'AI_USAGE'))) {
      const review = await this.reviewer.review({ statement: info.statement, language: submission.language, code: submission.code });
      const flag = IntegrityFlag.aiUsage(ctx, ref(submission), review);
      if (flag) await this.flags.save(flag);
    }
  }

  /** Compares with every other participant's submissions of the same problem; flags the closest match. */
  private async checkPlagiarism(ctx: FlagContext, submission: SubmissionInfo) {
    const mine = fingerprint(submission.code, submission.language);
    if (!mine) return;
    let best: { other: SubmissionInfo; score: number } | null = null;
    for (const other of await this.submissions.ofProblem(submission.sessionId, submission.problemKey)) {
      if (other.userId === submission.userId || other.verdict === 'CE') continue;
      const theirs = fingerprint(other.code, other.language);
      if (!theirs) continue;
      const score = similarity(mine, theirs);
      if (!best || score > best.score) best = { other, score };
    }
    if (!best) return;
    const flag = IntegrityFlag.plagiarism(ctx, ref(submission), ref(best.other), best.score);
    // One flag per pair: the other submission's check may already have flagged it, or be doing so right now (K-11).
    if (flag) await this.flags.addIfNewPair(flag);
  }

  private enqueue(job: () => Promise<void>) {
    this.queue.push(job);
    this.drain();
  }

  private drain() {
    while (this.running < MAX_CONCURRENT_CHECKS && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      job()
        .catch((error) => this.logger.warn(`Integrity check failed: ${(error as Error).message}`))
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  // ---------- Teacher review ----------

  async list(actor: Actor, filter: { sessionId?: string; status?: IntegrityFlagStatus }): Promise<IntegrityFlagDto[]> {
    let sessionIds: string[] | 'ALL';
    if (filter.sessionId) {
      if (!(await this.sessions.canReview(actor, filter.sessionId))) return [];
      sessionIds = [filter.sessionId];
    } else if (actor.role === 'ADMIN') {
      sessionIds = 'ALL';
    } else {
      sessionIds = [];
      for (const id of await this.flags.sessionIdsWithFlags()) {
        if (await this.sessions.canReview(actor, id)) sessionIds.push(id);
      }
    }
    return (await this.flags.list({ sessionIds, status: filter.status })).map(toDto);
  }

  async get(actor: Actor, id: string): Promise<IntegrityFlagDetailDto> {
    const flag = await this.loadReviewable(actor, id);
    const s = flag.snapshot;
    const [subject, matched] = await Promise.all([
      this.submissions.get(s.subject.submissionId),
      s.matched ? this.submissions.get(s.matched.submissionId) : Promise.resolve(null),
    ]);
    return {
      ...toDto(flag),
      language: subject?.language ?? 'cpp',
      code: subject?.code ?? '',
      matchedLanguage: matched?.language ?? null,
      matchedCode: matched?.code ?? null,
      segments: s.segments,
      reasons: s.reasons,
    };
  }

  async acknowledge(actor: Actor, id: string): Promise<IntegrityFlagDto> {
    const flag = await this.loadReviewable(actor, id);
    flag.acknowledge(actor);
    await this.flags.save(flag);
    return toDto(flag);
  }

  private async loadReviewable(actor: Actor, id: string): Promise<IntegrityFlag> {
    const flag = await this.flags.findById(id);
    if (!flag || !(await this.sessions.canReview(actor, flag.snapshot.sessionId))) {
      throw DomainError.notFound('integrity.not_found', 'Không tìm thấy gợi ý này.');
    }
    return flag;
  }
}

function ref(s: SubmissionInfo): SubmissionRef {
  return { submissionId: s.id, userId: s.userId, userDisplayName: s.userDisplayName };
}

function toDto(flag: IntegrityFlag): IntegrityFlagDto {
  const s = flag.snapshot;
  return {
    id: flag.id,
    kind: s.kind,
    status: s.status,
    level: s.level,
    score: s.score,
    summary: s.summary,
    sessionId: s.sessionId,
    sessionTitle: s.sessionTitle,
    problemKey: s.problemKey,
    problemTitle: s.problemTitle,
    submissionId: s.subject.submissionId,
    userId: s.subject.userId,
    userDisplayName: s.subject.userDisplayName,
    matchedSubmissionId: s.matched?.submissionId ?? null,
    matchedUserId: s.matched?.userId ?? null,
    matchedUserDisplayName: s.matched?.userDisplayName ?? null,
    createdAt: s.createdAt.toISOString(),
    acknowledgedAt: s.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: s.acknowledgedByName,
  };
}
