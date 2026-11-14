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
  type TestCaseResult,
} from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { errorForLog } from '../../../shared/domain/mask-email.js';
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
      const fromRun = submission.snapshot.judgeRun;
      submission.rejudge(totalPoints(target));
      // Conditional on the run it was loaded at: a second rejudge running at the same time must not reset a run
      // whose result is already stored (security-verifier on OJ-14).
      if (!(await this.submissions.requeue(submission, fromRun))) continue;
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
    const run = message.judgeRun ?? 1;
    if (!submission.isCurrentRun(run)) return;
    // Conditional writes only (review B3): results are handled 8 at a time, so a full-row save of a copy loaded a
    // moment ago could put a finished submission back to JUDGING or undo a rejudge.
    if (message.type === 'started') {
      await this.submissions.markJudging(submission.id, run);
      return;
    }
    // Program output belongs to trial runs only (OJ-18); a submission never stores it, whatever an engine sends.
    const testResults = message.testResults.map(({ output: _output, ...result }) => result);
    submission.complete(message.verdict, testResults, message.compileOutput ?? null, message.systemFault ?? null);
    let stored: boolean;
    try {
      stored = await this.submissions.storeResult(submission);
    } catch (error) {
      // A result the database refuses would otherwise stay unstored until the watchdog calls it lost, which never
      // counts: a program could make that happen on purpose (audit F-2). Store a system error attributed to it instead.
      this.logger.error(`Cannot store the result of submission ${submission.id}; storing a system error instead`, errorForLog(error));
      const fresh = await this.submissions.findById(submission.id);
      if (!fresh || !fresh.isCurrentRun(run)) return;
      fresh.complete('IE', [], RESULT_NOT_STORED_MESSAGE, 'program');
      fresh.pullEvents();
      await this.submissions.storeResult(fresh);
      return;
    }
    const events = submission.pullEvents();
    // Someone else finished this run first (a duplicate delivery, a rejudge, the watchdog): theirs stands.
    if (!stored) return;
    // Internal errors are the system's fault, not the student's attempt.
    if (submission.snapshot.verdict !== 'IE') await this.events.publish(events);
  }

  async get(actor: Actor, id: string): Promise<SubmissionDetailDto> {
    const submission = await this.submissions.findById(id);
    if (!submission) throw DomainError.notFound('judging.not_found', 'Không tìm thấy bài nộp.');
    const s = submission.snapshot;
    const reviewer = await this.sessions.canReview(actor, s.sessionId);
    if (s.userId !== actor.id && !reviewer) {
      throw DomainError.forbidden('judging.not_owner', 'Bạn chỉ xem được bài nộp của mình.');
    }
    const [dto] = await this.toDtos(actor, [submission]);
    const tests = dto.resultsHidden || dto.testsHidden ? [] : s.testResults;
    return {
      ...dto,
      sourceCode: s.source.text,
      compileOutput: dto.resultsHidden ? null : s.compileOutput,
      testResults: reviewer ? tests : tests.map(studentView),
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
      this.logger.error(`Cannot enqueue submission ${submission.id}`, errorForLog(error));
      // Conditional, not a full-row save: a queue that timed out may still have taken the job, and its result may be
      // stored by now; that result stands (security-verifier on OJ-14). A system error is not an attempt.
      await this.submissions.failIfUnfinished(submission.id, s.judgeRun, ENQUEUE_FAILED_MESSAGE);
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

/**
 * A test result as its own student sees it: diagnostics of hidden tests are dropped (OJ-15 F1). A runtime-error message
 * holds the program's error output, so a program that prints its input there would otherwise reveal every hidden test.
 * Results stored before the flag existed count as hidden. The verdict, time and memory stay.
 */
export function studentView(t: TestCaseResult): TestCaseResult {
  if (t.isSample === true || t.message === undefined) return t;
  const { message: _hidden, ...rest } = t;
  return rest;
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
