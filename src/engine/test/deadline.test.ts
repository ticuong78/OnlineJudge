import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JudgeJob } from '@oj/contracts';
import { JudgeSubmission, judgeWithinDeadline, SYSTEM_ERROR_MESSAGE } from '../src/application/judge-submission';
import { runWithDeadline } from '../src/application/run-with-deadline';
import {
  OperationAborted,
  type ExecResult,
  type RunLimits,
  type RunResult,
  type Sandbox,
  type SandboxOptions,
  type SandboxSession,
} from '../src/domain/sandbox';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const job: JudgeJob = {
  submissionId: 'sub-1',
  judgeRun: 3,
  language: 'python',
  sourceCode: 'print(3)',
  timeLimitMs: 1000,
  memoryLimitMb: 64,
  testCases: [{ id: 't1', input: '', expectedOutput: '3\n', points: 1, isSample: false }],
};

const okRun: RunResult = {
  exitCode: 0, signal: 0, stdout: '3\n', stderr: '', timeMs: 5, memoryKb: 100,
  timedOut: false, cpuLimitKill: false, outputLimit: false, startFailed: false, leftovers: false,
};

/** A sandbox whose behaviour is scripted per test. `hang` makes a call wait until the AbortSignal fires (or for ever). */
class FakeSandbox implements Sandbox {
  disposed = 0;
  opened: SandboxOptions[] = [];
  constructor(private readonly behaviour: { open?: 'hang' | 'fail'; compile?: 'hang'; run?: 'hang' | 'hang-ignoring-abort' | 'fail' } = {}) {}

  async open(options: SandboxOptions): Promise<SandboxSession> {
    this.opened.push(options);
    if (this.behaviour.open === 'hang') return new Promise(() => undefined);
    if (this.behaviour.open === 'fail') throw new Error('Cannot start sandbox container: docker did not answer in time');
    const self = this;
    const waitForAbort = (): Promise<never> =>
      new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new OperationAborted()), { once: true }));
    return {
      async exec(): Promise<ExecResult> {
        if (self.behaviour.compile === 'hang') return waitForAbort();
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, startFailed: false };
      },
      async run(_argv: string[], _input: string, _limits: RunLimits): Promise<RunResult> {
        if (self.behaviour.run === 'hang') return waitForAbort();
        if (self.behaviour.run === 'hang-ignoring-abort') return new Promise(() => undefined);
        if (self.behaviour.run === 'fail') throw new Error('The sandbox supervisor failed (docker exec exit 1)');
        return okRun;
      },
      async dispose() {
        self.disposed++;
      },
    };
  }
}

test('runWithDeadline returns the value when the work finishes in time', async () => {
  const outcome = await runWithDeadline(1000, async () => 42);
  assert.deepEqual(outcome, { timedOut: false, value: 42 });
});

test('runWithDeadline propagates an error that happens before the deadline', async () => {
  await assert.rejects(runWithDeadline(1000, async () => { throw new Error('boom'); }), /boom/);
  await assert.rejects(runWithDeadline(1000, () => { throw new Error('sync boom'); }), /sync boom/);
});

test('runWithDeadline: at the deadline it aborts the signal AND returns, even if the work ignores the abort', async () => {
  let signal: AbortSignal | undefined;
  const started = Date.now();
  const outcome = await runWithDeadline(60, (s) => {
    signal = s;
    return new Promise(() => undefined); // a hung docker call that never settles
  });
  assert.deepEqual(outcome, { timedOut: true });
  assert.ok(Date.now() - started < 500, 'must not wait for the hung work');
  assert.equal(signal?.aborted, true);
});

test('runWithDeadline: a failure that arrives after the deadline is reported, not thrown as an unhandled rejection', async () => {
  const late: unknown[] = [];
  const outcome = await runWithDeadline(
    30,
    (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new OperationAborted()))),
    (error) => late.push(error),
  );
  assert.equal(outcome.timedOut, true);
  await sleep(20);
  assert.equal(late.length, 1);
  assert.ok(late[0] instanceof OperationAborted);
});

test('judgeWithinDeadline: a sandbox that hangs in a test run yields an IE result at the deadline and is disposed', async () => {
  const sandbox = new FakeSandbox({ run: 'hang' });
  const started = Date.now();
  const result = await judgeWithinDeadline(new JudgeSubmission(sandbox), job, 80, () => undefined);
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.type, 'finished');
  assert.equal(result.verdict, 'IE');
  assert.equal(result.submissionId, 'sub-1');
  assert.equal(result.judgeRun, 3);
  assert.deepEqual(result.testResults, []);
  assert.match(result.compileOutput ?? '', /không phản hồi/);
  await sleep(30);
  assert.equal(sandbox.disposed, 1, 'the container must be removed once the abort unwinds the run');
});

test('judgeWithinDeadline: even a hang that ignores the abort, or hangs while the container starts, frees the slot', async () => {
  for (const behaviour of [{ run: 'hang-ignoring-abort' }, { open: 'hang' }] as const) {
    const started = Date.now();
    const result = await judgeWithinDeadline(new JudgeSubmission(new FakeSandbox(behaviour)), job, 60, () => undefined);
    assert.equal(result.verdict, 'IE', JSON.stringify(behaviour));
    assert.ok(Date.now() - started < 500, JSON.stringify(behaviour));
  }
});

test('judgeWithinDeadline: a hang during the build step is handled too', async () => {
  const sandbox = new FakeSandbox({ compile: 'hang' });
  const cpp: JudgeJob = { ...job, language: 'cpp', sourceCode: 'int main(){}' };
  const result = await judgeWithinDeadline(new JudgeSubmission(sandbox), cpp, 60, () => undefined);
  assert.equal(result.verdict, 'IE');
  await sleep(30);
  assert.equal(sandbox.disposed, 1);
});

test('judgeWithinDeadline: sandbox failures become IE with a plain message for the student; the internal reason goes to the log only (N3)', async () => {
  for (const behaviour of [{ open: 'fail' }, { run: 'fail' }] as const) {
    const logged: unknown[] = [];
    const result = await judgeWithinDeadline(new JudgeSubmission(new FakeSandbox(behaviour)), job, 1000, (_message, error) => logged.push(error));
    assert.equal(result.verdict, 'IE', JSON.stringify(behaviour));
    assert.equal(result.compileOutput, SYSTEM_ERROR_MESSAGE, JSON.stringify(behaviour));
    assert.doesNotMatch(result.compileOutput ?? '', /docker|sandbox|supervisor/i, 'no internals shown to the student');
    assert.match(String(logged[0]), /sandbox/, 'the engine log keeps the reason');
  }
});

test('judgeWithinDeadline: the normal path returns the real verdict and does not wait for the deadline', async () => {
  const sandbox = new FakeSandbox();
  const started = Date.now();
  const result = await judgeWithinDeadline(new JudgeSubmission(sandbox), job, 60_000, () => undefined);
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.verdict, 'AC');
  assert.equal(sandbox.disposed, 1);
});

test('the sandbox is told its deadline, its memory plan and the abort signal', async () => {
  const sandbox = new FakeSandbox();
  const fixedNow = 1_700_000_000_000;
  const judge = new JudgeSubmission(sandbox, () => fixedNow);
  await judge.execute(job, new AbortController().signal);
  const options = sandbox.opened[0];
  assert.equal(options.deadlineAt, fixedNow + judge.deadlineMs(job));
  assert.equal(options.memoryLimitMb, 64 + 32, 'python baseline is added to the problem limit');
  assert.equal(options.hasBuildStep, true, 'python is byte-compiled first');
  assert.ok(options.ioBudgetBytes >= 2 * 4 * 1024 * 1024);
  assert.ok(options.signal);
});
