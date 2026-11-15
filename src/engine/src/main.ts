import { Queue, Worker } from 'bullmq';
import {
  JUDGE_JOBS_QUEUE,
  TRIAL_MAX_AGE_MS,
  JUDGE_RESULTS_QUEUE,
  type JudgeJob,
  type JudgeJobProgress,
  type JudgeResultMessage,
} from '@oj/contracts';
import { isStaleTrial, JudgeSubmission, judgeWithinDeadline } from './application/judge-submission';
import { createShutdown } from './application/shutdown';
import { loadConfig } from './config';
import type { Sandbox } from './domain/sandbox';
import { ProcessDockerCli } from './infrastructure/docker-cli';
import { DockerSandbox } from './infrastructure/docker-sandbox';
import { LocalSandbox } from './infrastructure/local-sandbox';
import { SandboxSweeper } from './infrastructure/sandbox-sweeper';
import { checkDockerRunner } from './infrastructure/self-check';

/** If a graceful shutdown has not finished by then (dead connection, wedged Docker), leave anyway. */
const SHUTDOWN_FORCE_MS = 15_000;

async function main() {
  const config = loadConfig();
  const connection = { url: config.redisUrl, maxRetriesPerRequest: null };

  let sandbox: Sandbox;
  let sweeper: SandboxSweeper | undefined;
  if (config.sandbox === 'local') {
    sandbox = new LocalSandbox();
    console.warn('[engine] SANDBOX=local: submissions run WITHOUT isolation. Development only!');
  } else {
    const docker = new ProcessDockerCli();
    const problems = await checkDockerRunner(docker, config.runnerImage);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`[engine] ${problem}`);
      process.exit(1);
    }
    sandbox = new DockerSandbox({ image: config.runnerImage, compileMemoryMb: config.compileMemoryMb }, docker);
    // Containers of an engine that was killed mid-job are removed once they are past their deadline.
    sweeper = new SandboxSweeper(docker);
    sweeper.start();
  }

  const judge = new JudgeSubmission(sandbox);
  const results = new Queue<JudgeResultMessage>(JUDGE_RESULTS_QUEUE, { connection });
  // A trial's result carries program output: it is not kept in the queue's history once the backend has taken it.
  const publish = (msg: JudgeResultMessage) =>
    results.add(msg.type, msg, {
      removeOnComplete: msg.trial ? true : 1000,
      removeOnFail: msg.trial ? true : 1000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
    });

  const worker = new Worker<JudgeJob>(
    JUDGE_JOBS_QUEUE,
    async (job) => {
      // Nobody can read a trial's result once its record has expired: skip it rather than run it for nothing.
      if (isStaleTrial(job.data, job.timestamp, Date.now(), TRIAL_MAX_AGE_MS)) return;
      // Announce when this job will have been stopped, so the backend's watchdog can tell a long run from a dead engine.
      const deadlineMs = judge.deadlineMs(job.data);
      const progress: JudgeJobProgress = { deadlineAt: Date.now() + deadlineMs, startedAt: job.processedOn ?? Date.now() };
      await job.updateProgress(progress);
      // A trial run's messages say so, so the backend routes them to its trial store and never to a submission.
      const trial = job.data.trial ? { trial: true as const } : {};
      await publish({ type: 'started', submissionId: job.data.submissionId, judgeRun: job.data.judgeRun, ...trial });
      // Always yields a result within the job's deadline, so a hung sandbox cannot hold this worker slot for ever.
      await publish({ ...(await judgeWithinDeadline(judge, job.data, deadlineMs)), ...trial });
    },
    { connection, concurrency: config.concurrency },
  );

  worker.on('ready', () =>
    console.log(`[engine] listening on "${JUDGE_JOBS_QUEUE}" (sandbox=${config.sandbox}, concurrency=${config.concurrency})`),
  );
  worker.on('error', (e) => console.error('[engine] worker error', e));

  const shutdown = createShutdown({
    // `worker.close()` waits for running jobs and for Redis; neither may hold us hostage.
    close: async () => {
      sweeper?.stop();
      await worker.close();
      await results.close();
    },
    forceAfterMs: SHUTDOWN_FORCE_MS,
    exit: (code) => process.exit(code),
    log: (message) => console.log(`[engine] ${message}`),
  });
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => console.error('[engine] unhandled rejection', reason));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
