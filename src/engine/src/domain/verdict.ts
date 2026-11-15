import type { TestCaseResult, Verdict } from '@oj/contracts';
import { outputsMatch } from './output-checker';
import type { RunLimits, RunResult } from './sandbox';
import { SIGKILL, signalName } from './signals';

const MAX_MESSAGE = 2_000;

/**
 * Text a program controls (stderr, compiler output), made safe to store: no NUL characters, which PostgreSQL text and
 * jsonb refuse (the result would be lost, audit F-2), and no lone UTF-16 surrogates.
 */
export function cleanText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
}

/** Shown instead of the supervisor's own text, which names paths and system calls (audit N3). */
export const START_FAILED_MESSAGE = 'Không khởi động được chương trình.';
export const LEFTOVERS_MESSAGE = 'Chương trình để lại tiến trình chạy ngầm không dừng được (ví dụ fork bomb), nên các test sau không được chạy.';

/**
 * Classifies a single run against its expected output. Precedence: out of time, out of memory, output flood,
 * crash, then the answer itself.
 *
 * - TLE: the wall deadline expired, the kernel stopped the program at its CPU limit, or the measured CPU time is
 *   over the limit even though the program finished.
 * - MLE: peak RSS over the limit, or SIGKILL with no other explanation (the memory cgroup's OOM killer).
 * - WA: the program was cut off at the output cap (output that long cannot be the answer).
 * - RE: also when it left processes behind that could not be stopped.
 */
export function classifyRun(run: RunResult, expectedOutput: string, limits: RunLimits): Verdict {
  if (run.timedOut || run.cpuLimitKill || run.timeMs > limits.timeLimitMs) return 'TLE';
  if (run.memoryKb > limits.memoryLimitMb * 1024) return 'MLE';
  if (run.signal === SIGKILL && !run.outputLimit) return 'MLE';
  if (run.outputLimit) return 'WA';
  if (run.leftovers || run.startFailed || run.signal !== 0 || run.exitCode !== 0) return 'RE';
  return outputsMatch(run.stdout, expectedOutput) ? 'AC' : 'WA';
}

/** The short diagnostic shown to the student next to a verdict; undefined when the verdict says it all. */
export function runMessage(run: RunResult, verdict: Verdict): string | undefined {
  if (verdict === 'WA' && run.outputLimit) return 'Output limit exceeded';
  if (verdict !== 'RE') return undefined;
  if (run.leftovers) return LEFTOVERS_MESSAGE;
  if (run.startFailed) return START_FAILED_MESSAGE;
  const stderr = cleanText(run.stderr.slice(0, MAX_MESSAGE));
  if (run.signal !== 0) {
    const killed = `Killed by ${signalName(run.signal)} (signal ${run.signal})`;
    return stderr ? `${killed}\n${stderr}` : killed;
  }
  return stderr || `Exit code ${run.exitCode}`;
}

/** Overall verdict = verdict of the first failing test (tests are run in order), AC if all pass. */
export function overallVerdict(results: TestCaseResult[]): Verdict {
  return results.find((r) => r.verdict !== 'AC')?.verdict ?? 'AC';
}
