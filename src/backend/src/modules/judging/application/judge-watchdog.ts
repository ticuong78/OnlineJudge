import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOST_RESULT_MESSAGE, type Submission } from '../domain/submission.js';
import { SubmissionRepository, type StaleCursor } from '../domain/submission.repository.js';
import { JudgeQueue, type QueuedRun } from './ports.js';

const SWEEP_EVERY_MS = 30_000;
const BATCH = 200;
/** One pass looks at no more than this many stale submissions; the next pass carries on. */
const MAX_PER_SWEEP = 5_000;
/** Time after an engine's own deadline before its job counts as abandoned (the result may still be on its way). */
const DEADLINE_GRACE_MS = 2 * 60_000;
/** No judge run may take longer than this, whatever deadline an engine reports (clock skew, a bug). */
const MAX_RUN_MS = 4 * 60 * 60_000;
/** Time a finished job's result gets to be applied before the submission counts as lost. */
const RESULT_GRACE_MS = 5 * 60_000;
/** A queue that does not answer within this counts as unknown, so a hung Redis cannot stall the sweep. */
const QUEUE_TIMEOUT_MS = 5_000;

export { LOST_RESULT_MESSAGE };

/**
 * Ends the wait for submissions whose result is never coming.
 *
 * A submission is PENDING/JUDGING until the engine reports back. If the job is lost (queue data gone, engine
 * crashed twice on it, results dropped) it would stay that way forever, and since a student may only have a
 * few submissions waiting, they would be locked out of submitting. After `JUDGE_STALE_AFTER_SECONDS` a
 * submission whose job is no longer in the queue is ended with a system error (IE) - which neither counts as
 * an attempt nor reaches the scoreboard - so the student can simply submit again.
 *
 * A job still waiting in the queue is left alone however long the backlog is. A job an engine took is left alone
 * until the deadline that engine announced for it (plus a grace period) has passed: then the engine died or hung, and
 * the job is also removed, so it is not run again later. An engine too old to announce a deadline gets
 * `JUDGE_GIVE_UP_AFTER_SECONDS` from when it took the job, and no run may take longer than MAX_RUN_MS. A finished
 * job gets RESULT_GRACE_MS for its result to be applied. Jobs that wait longer than the give-up time are only
 * reported in the log: they are judged once an engine runs again.
 */
@Injectable()
export class JudgeWatchdog implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JudgeWatchdog.name);
  private readonly staleAfterMs: number;
  private readonly giveUpAfterMs: number;
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly queue: JudgeQueue,
    config: ConfigService,
  ) {
    this.staleAfterMs = Number(config.get('JUDGE_STALE_AFTER_SECONDS', 300)) * 1000;
    this.giveUpAfterMs = Math.max(this.staleAfterMs, Number(config.get('JUDGE_GIVE_UP_AFTER_SECONDS', 1800)) * 1000);
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /**
   * One pass over every stale submission, page by page (so newer lost ones are reached behind a long backlog).
   * Returns how many submissions were ended. Never throws: the next pass tries again.
   */
  async sweep(now = new Date()): Promise<number> {
    if (this.sweeping) return 0; // the previous pass is still running (slow queue): do not pile up
    this.sweeping = true;
    let ended = 0;
    let waitingLong = 0;
    try {
      const queuedBefore = new Date(now.getTime() - this.staleAfterMs);
      let cursor: StaleCursor | undefined;
      for (let seen = 0; seen < MAX_PER_SWEEP; ) {
        const page = await this.submissions.findStale(queuedBefore, BATCH, cursor);
        for (const submission of page) {
          const outcome = await this.check(submission, now);
          if (outcome === 'ended') ended++;
          if (outcome === 'waiting-long') waitingLong++;
        }
        seen += page.length;
        if (page.length < BATCH) break;
        const last = page[page.length - 1];
        cursor = { queuedAt: last.snapshot.queuedAt, id: last.id };
      }
      if (waitingLong) {
        this.logger.warn(
          `${waitingLong} submission(s) have waited more than ${Math.round(this.giveUpAfterMs / 60_000)} minutes for an engine. Is an engine running?`,
        );
      }
    } catch (error) {
      this.logger.error(`Sweep failed: ${(error as Error).message}`);
    } finally {
      this.sweeping = false;
    }
    return ended;
  }

  private async check(submission: Submission, now: Date): Promise<'ended' | 'waiting-long' | 'left'> {
    const { judgeRun, queuedAt } = submission.snapshot;
    const run = await this.inspect(submission.id, judgeRun);
    if (!this.abandoned(run, queuedAt, now)) {
      const waitedLong = run !== null && run !== 'unknown' && run.state === 'waiting' && now.getTime() - queuedAt.getTime() >= this.giveUpAfterMs;
      return waitedLong ? 'waiting-long' : 'left';
    }
    if (!(await this.submissions.failIfUnfinished(submission.id, judgeRun, LOST_RESULT_MESSAGE, now))) return 'left';
    await withTimeout(this.queue.discard(submission.id, judgeRun)).catch(() => undefined);
    this.logger.warn(`Submission ${submission.id} (run ${judgeRun}) got no result since ${queuedAt.toISOString()}: ended with a system error`);
    return 'ended';
  }

  /** `run` is 'unknown' when the queue could not be asked (Redis down or hung): then only the give-up time ends it. */
  private abandoned(run: QueuedRun | null | 'unknown', queuedAt: Date, now: Date): boolean {
    if (run === null) return true; // the job is gone: its result is never coming
    if (run === 'unknown') return now.getTime() - queuedAt.getTime() >= this.giveUpAfterMs;
    if (run.state === 'waiting') return false; // a backlog is not a lost job
    if (run.state === 'finished') return now.getTime() - (run.finishedAt ?? queuedAt.getTime()) >= RESULT_GRACE_MS;
    const started = run.activeSince ?? queuedAt.getTime();
    // A deadline counts only for the attempt it was announced for: after a retry, the old one is stale.
    const deadline = run.deadlineAt !== null && run.deadlineStartedAt === run.activeSince ? run.deadlineAt : null;
    const giveUpAt = Math.min(deadline ?? started + this.giveUpAfterMs, started + MAX_RUN_MS);
    return now.getTime() >= giveUpAt + DEADLINE_GRACE_MS;
  }

  private async inspect(submissionId: string, judgeRun: number): Promise<QueuedRun | null | 'unknown'> {
    try {
      return await withTimeout(this.queue.inspect(submissionId, judgeRun));
    } catch {
      return 'unknown';
    }
  }
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('the queue did not answer')), QUEUE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
