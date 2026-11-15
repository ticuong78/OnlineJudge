import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  LanguageLabels,
  TRIAL_OUTPUT_MAX_CHARS,
  type CreateTrialRunRequest,
  type JudgeResultMessage,
  type TrialRunDto,
  type TrialRunTestDto,
} from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { RateLimiter, waitText, type RateLimitPolicy } from '../../../shared/application/rate-limiter.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { errorForLog } from '../../../shared/domain/mask-email.js';
import { SourceCode } from '../domain/submission.js';
import { JudgeQueue, SessionGateway } from './ports.js';
import { TrialStore, type TrialRecord, type TrialState } from './trial-store.js';

/** Per user: enough to try every few minutes of an exam, not enough to use the judge as a free compute service. */
export const TRIAL_RATE: RateLimitPolicy = { limit: 20, windowMs: 10 * 60_000 };
/** A problem with more samples runs only the first ones: a trial is a quick check, not a judge run. */
export const TRIAL_MAX_SAMPLES = 10;

/**
 * What a trial keeps of a sample for display: samples can be large (a teacher may mark a big test as a sample), and
 * the record is stored and returned on every poll. The job itself still gets the whole sample.
 */
export function displayText(text: string): string {
  return text.length <= TRIAL_OUTPUT_MAX_CHARS ? text : `${text.slice(0, TRIAL_OUTPUT_MAX_CHARS)}\n…`;
}

const notFound = () => DomainError.notFound('judging.trial_not_found', 'Không tìm thấy lần chạy thử (có thể đã hết hạn).');

/**
 * Use case: run code on a problem's sample tests without submitting it (OJ-18). Nothing is recorded: no submission,
 * no attempt, no score, no event. The run goes through the same queue and sandbox as a submission.
 */
@Injectable()
export class TrialRunService {
  private readonly logger = new Logger(TrialRunService.name);

  constructor(
    private readonly sessions: SessionGateway,
    private readonly queue: JudgeQueue,
    private readonly store: TrialStore,
    private readonly limiter: RateLimiter,
  ) {}

  async start(actor: Actor, sessionId: string, problemKey: string, input: CreateTrialRunRequest): Promise<TrialRunDto> {
    const source = SourceCode.of(input.language, input.sourceCode);
    const key = problemKey.toUpperCase();
    const id = randomUUID();
    // The slot first: a user with a trial in flight is turned away before any session lookup.
    if (!(await this.store.claimSlot(actor.id, id))) {
      throw DomainError.conflict('judging.trial_pending', 'Bạn đang có một lần chạy thử chưa xong. Hãy đợi kết quả.');
    }
    try {
      // The same right as reading the statement, which already shows these samples.
      const target = await this.sessions.trialTarget(actor, sessionId, key);
      if (target.allowedLanguages.length && !target.allowedLanguages.includes(source.language)) {
        throw DomainError.validation('judging.language_not_allowed',
          `Phiên này chỉ cho phép: ${target.allowedLanguages.map((l) => LanguageLabels[l]).join(', ')}.`);
      }
      // Defence in depth: the gateway returns samples only, and anything else is dropped here too.
      const samples = target.testCases.filter((t) => t.isSample).slice(0, TRIAL_MAX_SAMPLES);
      if (!samples.length) throw DomainError.conflict('judging.no_samples', 'Bài này không có test mẫu để chạy thử.');
      const decision = await this.limiter.hit(`trial|user:${actor.id}`, TRIAL_RATE);
      if (!decision.allowed) {
        throw DomainError.rateLimited('judging.too_many_trials',
          `Bạn đã chạy thử quá nhiều lần. Vui lòng thử lại sau ${waitText(decision.retryAfterMs)}.`, decision.retryAfterMs / 1000);
      }
      const record: TrialRecord = {
        id,
        userId: actor.id,
        sessionId,
        problemKey: key,
        language: source.language,
        createdAt: new Date().toISOString(),
        samples: samples.map((t) => ({ id: t.id, input: displayText(t.input), expectedOutput: displayText(t.expectedOutput) })),
      };
      await this.store.create(record);
      // A trial the user no longer waits for (its slot expired while it was queued) is dropped, so a busy judge does
      // not end up running a backlog of results nobody will read.
      const previous = await this.store.swapLatest(actor.id, id);
      if (previous) await this.queue.discardTrial(previous).catch(() => undefined);
      try {
        await this.queue.enqueue({
          submissionId: id,
          judgeRun: 1,
          language: source.language,
          sourceCode: source.text,
          timeLimitMs: target.timeLimitMs,
          memoryLimitMb: target.memoryLimitMb,
          testCases: samples,
          trial: true,
        });
      } catch (error) {
        this.logger.error(`Cannot enqueue trial ${id}`, errorForLog(error));
        await this.store.remove(id).catch(() => undefined);
        throw DomainError.conflict('judging.trial_unavailable', 'Hệ thống chấm đang bận, chưa chạy thử được. Hãy thử lại sau.');
      }
      return toDto({ record, started: false, result: null });
    } catch (error) {
      await this.store.releaseSlot(actor.id, id).catch(() => undefined);
      throw error;
    }
  }

  /** Only the user who started a trial can read it; anyone else is told it does not exist. */
  async get(actor: Actor, id: string): Promise<TrialRunDto> {
    const state = await this.store.find(id);
    if (!state || state.record.userId !== actor.id) throw notFound();
    return toDto(state);
  }

  /** Results the engine published for a trial job. Never touches submissions. */
  async applyResult(message: JudgeResultMessage): Promise<void> {
    if (message.type === 'started') {
      await this.store.markStarted(message.submissionId);
      return;
    }
    const record = await this.store.storeResult(message.submissionId, {
      verdict: message.verdict,
      compileOutput: message.compileOutput ?? null,
      testResults: message.testResults,
    });
    if (record) await this.store.releaseSlot(record.userId, record.id);
  }
}

function toDto({ record, started, result }: TrialState): TrialRunDto {
  const byTest = new Map((result?.testResults ?? []).map((r) => [r.testCaseId, r]));
  const tests: TrialRunTestDto[] = record.samples.map((s) => {
    const r = byTest.get(s.id);
    return {
      input: s.input,
      expectedOutput: s.expectedOutput,
      output: r?.output ?? null,
      verdict: r?.verdict ?? null,
      timeMs: r?.timeMs ?? null,
      memoryKb: r?.memoryKb ?? null,
      message: r?.message ?? null,
    };
  });
  return {
    id: record.id,
    sessionId: record.sessionId,
    problemKey: record.problemKey,
    language: record.language,
    status: result ? 'DONE' : started ? 'JUDGING' : 'PENDING',
    verdict: result?.verdict ?? null,
    compileOutput: result?.compileOutput ?? null,
    tests,
    createdAt: record.createdAt,
  };
}
