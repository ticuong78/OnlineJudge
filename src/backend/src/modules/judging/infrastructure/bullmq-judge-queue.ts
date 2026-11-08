import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JUDGE_JOBS_QUEUE,
  JUDGE_RESULTS_QUEUE,
  type JudgeJob,
  type JudgeJobProgress,
  type JudgeResultMessage,
} from '@oj/contracts';
import { Queue, Worker } from 'bullmq';
import { JudgeQueue, type QueuedRun } from '../application/ports.js';
import { JudgingService } from '../application/judging.service.js';

/** One job per judge run, so a rejudge is never deduplicated against the first run. */
export const judgeJobId = (submissionId: string, judgeRun: number) => `${submissionId}-${judgeRun}`;

/**
 * States in which a job will never produce a result any more. Everything else (waiting, active, delayed, a
 * paused queue, whatever a newer BullMQ adds) counts as alive: the watchdog must only act on a job that is
 * certainly gone, never on one it merely does not recognise. A completed job is reported as finished (its result
 * may still be on its way), not as gone.
 */
const DEAD_STATES = new Set(['failed', 'unknown']);

const connectionFrom = (config: ConfigService) => ({
  url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
  maxRetriesPerRequest: null,
});

/**
 * Producer side: judge jobs go to Redis; any number of engine workers consume them.
 * BullMQ gives us FIFO fairness, retries and horizontal scaling of judges for free.
 */
@Injectable()
export class BullMqJudgeQueue extends JudgeQueue implements OnModuleDestroy {
  private readonly queue: Queue<JudgeJob>;

  constructor(config: ConfigService) {
    super();
    this.queue = new Queue<JudgeJob>(JUDGE_JOBS_QUEUE, { connection: connectionFrom(config) });
  }

  async enqueue(job: JudgeJob) {
    await this.queue.add('judge', job, {
      jobId: judgeJobId(job.submissionId, job.judgeRun),
      attempts: 2,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }

  async inspect(submissionId: string, judgeRun: number): Promise<QueuedRun | null> {
    const job = await this.queue.getJob(judgeJobId(submissionId, judgeRun));
    if (!job) return null;
    const state = await job.getState();
    if (DEAD_STATES.has(state)) return null;
    // The engine marks a job completed once it has published the result, which the backend may not have applied yet.
    if (state === 'completed') return { state: 'finished', finishedAt: job.finishedOn ?? null };
    if (state !== 'active') return { state: 'waiting' };
    const progress = (typeof job.progress === 'object' ? job.progress : {}) as Partial<JudgeJobProgress>;
    const announced = typeof progress.deadlineAt === 'number' && typeof progress.startedAt === 'number';
    return {
      state: 'active',
      deadlineAt: announced ? progress.deadlineAt! : null,
      deadlineStartedAt: announced ? progress.startedAt! : null,
      activeSince: job.processedOn ?? null,
    };
  }

  /** A job an engine still holds a lock on cannot be removed; it is then left to BullMQ, and its late result is ignored. */
  async discard(submissionId: string, judgeRun: number) {
    const job = await this.queue.getJob(judgeJobId(submissionId, judgeRun));
    await job?.remove().catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

/** Consumer side: applies results published by the engine to Submission aggregates. */
@Injectable()
export class JudgeResultsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JudgeResultsConsumer.name);
  private worker?: Worker<JudgeResultMessage>;

  constructor(
    private readonly config: ConfigService,
    private readonly judging: JudgingService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<JudgeResultMessage>(
      JUDGE_RESULTS_QUEUE,
      (job) => this.judging.applyJudgeResult(job.data),
      { connection: connectionFrom(this.config), concurrency: 8 },
    );
    this.worker.on('failed', (job, error) => this.logger.error(`Result job ${job?.id} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.error(`Redis worker error: ${error.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
