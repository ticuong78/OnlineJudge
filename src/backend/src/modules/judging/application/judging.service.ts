import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LanguageLabels,
  type JudgeResultMessage,
  type Paginated,
  type RejudgeResponse,
  type SubmissionDetailDto,
  type SubmissionDto,
  type SubmitRequest,
} from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { ENQUEUE_FAILED_MESSAGE, RESULT_NOT_STORED_MESSAGE, SourceCode, Submission } from '../domain/submission.js';
import { SubmissionQueries, SubmissionRepository } from '../domain/submission.repository.js';
import { REJUDGE_STARTED, type RejudgeStartedEvent } from '../judging.events.js';
import { JudgeQueue, SessionGateway, type ResultVisibility, type SubmissionTarget } from './ports.js';

export interface ListSubmissionsQuery {
  sessionId?: string;
  problemKey?: string;
  mine?: boolean;
  page: number;
  pageSize: number;
}

@Injectable()
export class JudgingService {
  private readonly logger = new Logger(JudgingService.name);
  private readonly maxPending: number;

  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly queries: SubmissionQueries,
    private readonly sessions: SessionGateway,
    private readonly queue: JudgeQueue,
    private readonly events: EventPublisher,
    config: ConfigService,
  ) {
    this.maxPending = Number(config.get('MAX_PENDING_SUBMISSIONS', 3));
  }

  async submit(actor: Actor, input: SubmitRequest): Promise<SubmissionDto> {
    const source = SourceCode.of(input.language, input.sourceCode);
    const key = input.problemKey.toUpperCase();
    const target = await this.sessions.prepareSubmission(actor, input.sessionId, key);
    if (target.allowedLanguages.length && !target.allowedLanguages.includes(source.language)) {
      throw DomainError.validation('judging.language_not_allowed',
        `Phiên này chỉ cho phép: ${target.allowedLanguages.map((l) => LanguageLabels[l]).join(', ')}.`);
    }

    const submission = Submission.submit({
      userId: actor.id,
      userDisplayName: actor.name,
      sessionId: input.sessionId,
      sessionTitle: target.sessionTitle,
      problemKey: key,
      problemTitle: target.problemTitle,
      source,
      totalPoints: totalPoints(target),
    });
    // The limits are checked and the submission stored in one atomic step (see SubmissionRepository.admit).
    const admission = await this.submissions.admit(submission, { maxPending: this.maxPending, maxForProblem: target.maxSubmissions });
    if (admission === 'TOO_MANY_PENDING') {
      throw DomainError.conflict('judging.too_many_pending',
        `Bạn đang có ${this.maxPending} bài chờ chấm. Hãy đợi kết quả rồi nộp tiếp.`);
    }
    if (admission === 'PROBLEM_LIMIT_REACHED') {
      throw DomainError.conflict('judging.submission_limit', `Bạn đã dùng hết ${target.maxSubmissions} lần nộp cho bài này.`);
    }

    await this.enqueue(submission, target);
    return (await this.toDtos(actor, [submission]))[0];
  }

  /** Puts every submission of a session (or of one problem) back into the queue with the session's current tests. */
  async rejudge(actor: Actor, sessionId: string, problemKey: string | null): Promise<RejudgeResponse> {
    if (!(await this.sessions.canReview(actor, sessionId))) {
      throw DomainError.forbidden('judging.not_session_manager', 'Chỉ giáo viên phụ trách phiên được chấm lại.');
    }
    const key = problemKey?.toUpperCase() ?? null;
    const submissions = await this.submissions.findBySession(sessionId, key);
    const event: RejudgeStartedEvent = { name: REJUDGE_STARTED, occurredAt: new Date(), sessionId, problemKey: key };
    await this.events.publish([event]);

    const targets = new Map<string, SubmissionTarget | null>();
    let queued = 0;
    for (const submission of submissions) {
      const k = submission.snapshot.problemKey;
      if (!targets.has(k)) targets.set(k, await this.sessions.judgeTarget(sessionId, k));
      const target = targets.get(k);
      // A problem removed from the session (sync with its set): its submissions keep their last result.
      if (!target) continue;
      submission.rejudge(totalPoints(target));
      await this.submissions.save(submission);
      await this.enqueue(submission, target);
      queued++;
    }
    this.logger.log(`Rejudging ${queued} submissions of session ${sessionId}${key ? ` (problem ${key})` : ''}`);
    return { queued };
  }

  /** Applies a message coming back from the judge engine; results of an older judge run are ignored. */
  async applyJudgeResult(message: JudgeResultMessage): Promise<void> {
    const submission = await this.submissions.findById(message.submissionId);
    if (!submission) {
      this.logger.warn(`Result for unknown submission ${message.submissionId}`);
      return;
    }
    if (!submission.isCurrentRun(message.judgeRun ?? 1)) return;
    if (message.type === 'started') submission.startJudging();
    else submission.complete(message.verdict, message.testResults, message.compileOutput ?? null, message.systemFault ?? null);
    try {
      await this.submissions.save(submission);
    } catch (error) {
      if (message.type !== 'finished') throw error;
      // A result the database refuses would otherwise stay unstored until the watchdog calls it lost, which never
      // counts: a program could make that happen on purpose (audit F-2). Store a system error attributed to it instead.
      this.logger.error(`Cannot store the result of submission ${submission.id}; storing a system error instead`, error as Error);
      const fresh = await this.submissions.findById(submission.id);
      if (!fresh || !fresh.isCurrentRun(message.judgeRun ?? 1)) return;
      fresh.complete('IE', [], RESULT_NOT_STORED_MESSAGE, 'program');
      await this.submissions.save(fresh);
      fresh.pullEvents();
      return;
    }
    const events = submission.pullEvents();
    // Internal errors are the system's fault, not the student's attempt.
    if (submission.snapshot.verdict !== 'IE') await this.events.publish(events);
  }

  async get(actor: Actor, id: string): Promise<SubmissionDetailDto> {
    const submission = await this.submissions.findById(id);
    if (!submission) throw DomainError.notFound('judging.not_found', 'Không tìm thấy bài nộp.');
    const s = submission.snapshot;
    if (s.userId !== actor.id && !(await this.sessions.canReview(actor, s.sessionId))) {
      throw DomainError.forbidden('judging.not_owner', 'Bạn chỉ xem được bài nộp của mình.');
    }
    const [dto] = await this.toDtos(actor, [submission]);
    return {
      ...dto,
      sourceCode: s.source.text,
      compileOutput: dto.resultsHidden ? null : s.compileOutput,
      testResults: dto.resultsHidden || dto.testsHidden ? [] : s.testResults,
    };
  }

  /** Students: own submissions. Staff: own, or every submission of a session they manage. Admin: anything. */
  async list(actor: Actor, query: ListSubmissionsQuery): Promise<Paginated<SubmissionDto>> {
    let onlyMine = query.mine || actor.role === 'STUDENT';
    if (!onlyMine && actor.role !== 'ADMIN') {
      onlyMine = !query.sessionId || !(await this.sessions.canReview(actor, query.sessionId));
    }
    const { items, total } = await this.queries.list({
      userId: onlyMine ? actor.id : undefined,
      sessionId: query.sessionId,
      problemKey: query.problemKey?.toUpperCase(),
      page: query.page,
      pageSize: query.pageSize,
    });
    return { items: await this.toDtos(actor, items), total, page: query.page, pageSize: query.pageSize };
  }

  private async enqueue(submission: Submission, target: SubmissionTarget) {
    const s = submission.snapshot;
    try {
      await this.queue.enqueue({
        submissionId: submission.id,
        judgeRun: s.judgeRun,
        language: s.source.language,
        sourceCode: s.source.text,
        timeLimitMs: target.timeLimitMs,
        memoryLimitMb: target.memoryLimitMb,
        testCases: target.testCases,
      });
    } catch (error) {
      this.logger.error(`Cannot enqueue submission ${submission.id}`, error as Error);
      submission.failToEnqueue(ENQUEUE_FAILED_MESSAGE);
      await this.submissions.save(submission);
      submission.pullEvents(); // an internal error is not an attempt worth recording
    }
  }

  /** Applies each session's feedback mode to the viewer's own submissions (others' are only seen by managers). */
  private async toDtos(actor: Actor, submissions: Submission[]): Promise<SubmissionDto[]> {
    const own = submissions.filter((s) => s.snapshot.userId === actor.id);
    const visibility = own.length
      ? await this.sessions.visibility(actor, own.map((s) => s.snapshot.sessionId))
      : new Map<string, ResultVisibility>();
    return submissions.map((s) => {
      const v = s.snapshot.userId === actor.id ? (visibility.get(s.snapshot.sessionId) ?? 'FULL') : 'FULL';
      return toDto(s, v);
    });
  }
}

const totalPoints = (target: SubmissionTarget) => target.testCases.reduce((sum, t) => sum + t.points, 0);

function toDto(s: Submission, visibility: ResultVisibility): SubmissionDto {
  const st = s.snapshot;
  const hidden = visibility === 'HIDDEN';
  return {
    id: s.id,
    sessionId: st.sessionId,
    sessionTitle: st.sessionTitle,
    problemKey: st.problemKey,
    problemTitle: st.problemTitle,
    userId: st.userId,
    userDisplayName: st.userDisplayName,
    language: st.source.language,
    status: st.status,
    verdict: hidden ? null : st.verdict,
    score: hidden ? 0 : st.score,
    maxTimeMs: hidden ? null : s.maxTimeMs,
    maxMemoryKb: hidden ? null : s.maxMemoryKb,
    createdAt: st.createdAt.toISOString(),
    judgedAt: st.judgedAt?.toISOString() ?? null,
    resultsHidden: hidden,
    testsHidden: visibility !== 'FULL',
  };
}
