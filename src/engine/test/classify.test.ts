import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Verdict } from '@oj/contracts';
import { MIB } from '../src/domain/resource-plan';
import type { RunLimits, RunResult } from '../src/domain/sandbox';
import { classifyRun, LEFTOVERS_MESSAGE, runMessage, START_FAILED_MESSAGE } from '../src/domain/verdict';

const SIGSEGV = 11;
const SIGKILL = 9;
const SIGXCPU = 24;
const SIGXFSZ = 25;

const limits: RunLimits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };

const base: RunResult = {
  exitCode: 0,
  signal: 0,
  stdout: '3\n',
  stderr: '',
  timeMs: 10,
  memoryKb: 2_000,
  timedOut: false,
  cpuLimitKill: false,
  outputLimit: false,
  startFailed: false,
  leftovers: false,
};

const killedBy = (signal: number): Partial<RunResult> => ({ signal, exitCode: 128 + signal, stdout: '' });

const cases: { name: string; run: Partial<RunResult>; expected: string; verdict: Verdict }[] = [
  { name: 'correct output', run: {}, expected: '3\n', verdict: 'AC' },
  { name: 'trailing whitespace and CRLF are ignored', run: { stdout: '3 \r\n\r\n' }, expected: '3', verdict: 'AC' },
  { name: 'different output', run: { stdout: '4\n' }, expected: '3\n', verdict: 'WA' },
  { name: 'empty output', run: { stdout: '' }, expected: '3\n', verdict: 'WA' },

  // time
  { name: 'wall deadline hit', run: { timedOut: true, ...killedBy(SIGKILL) }, expected: '3\n', verdict: 'TLE' },
  { name: 'wall deadline hit even though the output happens to be right', run: { timedOut: true }, expected: '3\n', verdict: 'TLE' },
  { name: 'killed by the CPU limit (SIGXCPU)', run: { cpuLimitKill: true, ...killedBy(SIGXCPU), timeMs: 2000 }, expected: '3\n', verdict: 'TLE' },
  { name: 'killed by the CPU hard limit (SIGKILL + cpu flag)', run: { cpuLimitKill: true, ...killedBy(SIGKILL), timeMs: 3000 }, expected: '3\n', verdict: 'TLE' },
  { name: 'finished but used more CPU than allowed', run: { timeMs: 1001 }, expected: '3\n', verdict: 'TLE' },
  { name: 'exactly at the CPU limit is fine', run: { timeMs: 1000 }, expected: '3\n', verdict: 'AC' },

  // memory
  { name: 'peak RSS over the limit with the right answer', run: { memoryKb: 64 * 1024 + 1 }, expected: '3\n', verdict: 'MLE' },
  { name: 'peak RSS exactly at the limit is fine', run: { memoryKb: 64 * 1024 }, expected: '3\n', verdict: 'AC' },
  { name: 'SIGKILL with no other explanation is the OOM killer', run: killedBy(SIGKILL), expected: '3\n', verdict: 'MLE' },
  { name: 'SIGKILL after the wall deadline is a timeout, not memory', run: { timedOut: true, ...killedBy(SIGKILL) }, expected: '', verdict: 'TLE' },

  // output flood
  { name: 'cut off at the output cap by SIGXFSZ', run: { outputLimit: true, ...killedBy(SIGXFSZ) }, expected: '3\n', verdict: 'WA' },
  { name: 'output cap reached but the program survived (EFBIG) and exited 1', run: { outputLimit: true, exitCode: 1 }, expected: '3\n', verdict: 'WA' },
  { name: 'output cap reached and the program exited 0', run: { outputLimit: true }, expected: '3\n', verdict: 'WA' },
  { name: 'output flood that also tripped the OOM killer is still just a flood', run: { outputLimit: true, ...killedBy(SIGKILL) }, expected: '3\n', verdict: 'WA' },

  // crashes
  { name: 'segmentation fault', run: killedBy(SIGSEGV), expected: '3\n', verdict: 'RE' },
  { name: 'non-zero exit status', run: { exitCode: 1 }, expected: '3\n', verdict: 'RE' },
  { name: 'non-zero exit status even if the output matches', run: { exitCode: 3 }, expected: '3\n', verdict: 'RE' },
  { name: 'could not be started', run: { startFailed: true, exitCode: 127 }, expected: '3\n', verdict: 'RE' },
  { name: 'left processes behind that could not be stopped', run: { leftovers: true }, expected: '3\n', verdict: 'RE' },

  // precedence
  { name: 'time beats memory', run: { timedOut: true, memoryKb: 500_000 }, expected: '3\n', verdict: 'TLE' },
  { name: 'time beats a crash', run: { cpuLimitKill: true, ...killedBy(SIGSEGV) }, expected: '3\n', verdict: 'TLE' },
  { name: 'memory beats a crash', run: { memoryKb: 500_000, ...killedBy(SIGSEGV) }, expected: '3\n', verdict: 'MLE' },
  { name: 'output flood beats a crash exit', run: { outputLimit: true, exitCode: 2 }, expected: '3\n', verdict: 'WA' },
  { name: 'time beats a wrong answer', run: { timeMs: 5000, stdout: 'x' }, expected: '3\n', verdict: 'TLE' },
];

for (const c of cases) {
  test(`classifyRun: ${c.name} -> ${c.verdict}`, () => {
    assert.equal(classifyRun({ ...base, ...c.run }, c.expected, limits), c.verdict);
  });
}

test('classifyRun is deterministic for the same evidence (the old TLE/MLE flake cannot come from here)', () => {
  const run: RunResult = { ...base, timedOut: true, ...killedBy(SIGKILL), timeMs: 0, memoryKb: 1124 };
  for (let i = 0; i < 100; i++) assert.equal(classifyRun(run, '3\n', limits), 'TLE');
});

test('runMessage: signals are named', () => {
  const run = { ...base, ...killedBy(SIGSEGV) };
  assert.equal(runMessage(run, 'RE'), 'Killed by SIGSEGV (signal 11)');
  assert.equal(runMessage({ ...run, stderr: 'boom' }, 'RE'), 'Killed by SIGSEGV (signal 11)\nboom');
});

test('runMessage: plain exit codes and stderr', () => {
  assert.equal(runMessage({ ...base, exitCode: 3 }, 'RE'), 'Exit code 3');
  assert.equal(runMessage({ ...base, exitCode: 1, stderr: 'Traceback...' }, 'RE'), 'Traceback...');
  assert.equal(runMessage({ ...base, exitCode: 1, stderr: 'x'.repeat(5000) }, 'RE')?.length, 2000);
});

test('runMessage: start failures and output floods explain themselves', () => {
  // the supervisor's own text (paths, system calls) is not shown to students (N3)
  assert.equal(runMessage({ ...base, startFailed: true, exitCode: 127, stderr: "oj-run: cannot start './main': execve failed" }, 'RE'), START_FAILED_MESSAGE);
  assert.equal(runMessage({ ...base, startFailed: true, exitCode: 127 }, 'RE'), START_FAILED_MESSAGE);
  assert.equal(runMessage({ ...base, leftovers: true }, 'RE'), LEFTOVERS_MESSAGE);
  assert.equal(runMessage({ ...base, outputLimit: true }, 'WA'), 'Output limit exceeded');
});

test('runMessage: verdicts that say it all carry no message', () => {
  for (const verdict of ['AC', 'WA', 'TLE', 'MLE'] as Verdict[]) {
    assert.equal(runMessage({ ...base, stderr: 'noise' }, verdict), undefined, verdict);
  }
});
