import type { JudgeJob, JudgeResultMessage, TestCaseResult } from '@oj/contracts';
import { languageSpecFor, withMemory } from '../domain/language';
import { BUILD_TIMEOUT_MS, ioBudgetBytes, jobDeadlineMs, maxOutputBytes } from '../domain/resource-plan';
import type { RunLimits, Sandbox } from '../domain/sandbox';
import { classifyRun, cleanText, overallVerdict, runMessage } from '../domain/verdict';
import { runWithDeadline } from './run-with-deadline';

const MAX_COMPILE_OUTPUT = 10_000;

export type FinishedMessage = Extract<JudgeResultMessage, { type: 'finished' }>;

/** Use case: compile a submission once, then run it against every test case in order. */
export class JudgeSubmission {
  constructor(
    private readonly sandbox: Sandbox,
    private readonly clock: () => number = Date.now,
  ) {}

  /** How long the engine may spend on this job, from the moment it takes it. */
  deadlineMs(job: JudgeJob): number {
    return jobDeadlineMs(job, languageSpecFor(job.language, job.sourceCode).compile !== undefined);
  }

  /** `progress.programRan` is set once the first test starts: from then on a failure may be the program's doing. */
  async execute(job: JudgeJob, signal?: AbortSignal, progress: JudgeProgress = { programRan: false }): Promise<FinishedMessage> {
    const spec = languageSpecFor(job.language, job.sourceCode);
    const session = await this.sandbox.open({
      files: [{ name: spec.sourceFile, content: job.sourceCode }],
      memoryLimitMb: job.memoryLimitMb + spec.memoryOverheadMb,
      hasBuildStep: spec.compile !== undefined,
      ioBudgetBytes: ioBudgetBytes(job.testCases),
      deadlineAt: this.clock() + this.deadlineMs(job),
      signal,
    });

    try {
      if (spec.compile) {
        const compiled = await session.exec(spec.compile, BUILD_TIMEOUT_MS);
        // A compiler that cannot start is the system's fault: a system error (not counted), never a compile error.
        if (compiled.startFailed) throw new Error(`The compiler could not be started: ${compiled.stderr.trim().slice(0, 500)}`);
        if (compiled.exitCode !== 0 || compiled.timedOut) {
          const output = cleanText((compiled.stderr || compiled.stdout).slice(0, MAX_COMPILE_OUTPUT));
          return {
            type: 'finished',
            submissionId: job.submissionId,
            judgeRun: job.judgeRun,
            verdict: 'CE',
            compileOutput: compiled.timedOut ? 'Biên dịch quá thời gian cho phép.' : output,
            testResults: [],
          };
        }
      }

      const argv = withMemory(spec.run, job.memoryLimitMb);
      const testResults: TestCaseResult[] = [];
      for (const testCase of job.testCases) {
        const limits: RunLimits = {
          timeLimitMs: job.timeLimitMs,
          memoryLimitMb: job.memoryLimitMb,
          maxOutputBytes: maxOutputBytes(testCase.expectedOutput),
        };
        progress.programRan = true;
        const run = await session.run(argv, testCase.input, limits);
        const verdict = classifyRun(run, testCase.expectedOutput, limits);
        testResults.push({
          testCaseId: testCase.id,
          verdict,
          // A killed process may report little CPU time; show at least the limit for TLE.
          timeMs: Math.round(verdict === 'TLE' ? Math.max(run.timeMs, job.timeLimitMs) : run.timeMs),
          memoryKb: run.memoryKb,
          points: verdict === 'AC' ? testCase.points : 0,
          message: runMessage(run, verdict),
        });
        if (run.leftovers) break; // the container is no longer trusted for the remaining tests
      }

      return {
        type: 'finished',
        submissionId: job.submissionId,
        judgeRun: job.judgeRun,
        verdict: testResults.length ? overallVerdict(testResults) : 'IE',
        testResults,
        // No tests to run is the problem's configuration, not the submission's doing.
        ...(testResults.length ? {} : { systemFault: 'infrastructure' as const }),
      };
    } finally {
      await session.dispose();
    }
  }
}

/** What a student is told when the judge itself failed on their submission. */
export const SYSTEM_ERROR_MESSAGE =
  'Hệ thống chấm bài gặp lỗi khi chạy bài này (không phải lỗi của bạn). Hãy nộp lại, hoặc nhờ giáo viên chấm lại.';

/** How far judging got; decides whether a system error can be the program's doing (audit F-3). */
export interface JudgeProgress {
  programRan: boolean;
}

function internalError(job: JudgeJob, reason: string, progress: JudgeProgress): FinishedMessage {
  return {
    type: 'finished',
    submissionId: job.submissionId,
    judgeRun: job.judgeRun,
    verdict: 'IE',
    compileOutput: reason,
    testResults: [],
    // Before the first test nothing the student wrote has run (the compiler is not the student), so it is the system's.
    systemFault: progress.programRan ? 'program' : 'infrastructure',
  };
}

/**
 * Judges a job and always comes back with a result message within `deadlineMs`: a verdict, or an internal error
 * when judging failed or ran out of time. The caller can therefore always free its worker slot.
 */
export async function judgeWithinDeadline(
  judge: JudgeSubmission,
  job: JudgeJob,
  deadlineMs: number = judge.deadlineMs(job),
  log: (message: string, error?: unknown) => void = (m, e) => console.error(`[engine] ${m}`, e ?? ''),
): Promise<FinishedMessage> {
  const progress: JudgeProgress = { programRan: false };
  try {
    const outcome = await runWithDeadline(deadlineMs, (signal) => judge.execute(job, signal, progress), (late) =>
      log(`submission ${job.submissionId} failed after its deadline`, late),
    );
    if (!outcome.timedOut) return outcome.value;
    log(`submission ${job.submissionId} exceeded its ${Math.round(deadlineMs / 1000)}s deadline and was stopped`);
    return internalError(
      job,
      `Hệ thống chấm bài không phản hồi kịp (đã dừng sau ${Math.round(deadlineMs / 1000)} giây). Hãy nộp lại hoặc nhờ giáo viên chấm lại.`,
      progress,
    );
  } catch (error) {
    // The reason (Docker output, container names) is for the operator's log, not for the student (audit N3).
    log(`submission ${job.submissionId} failed`, error);
    return internalError(job, SYSTEM_ERROR_MESSAGE, progress);
  }
}
