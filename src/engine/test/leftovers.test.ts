import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JudgeJob } from '@oj/contracts';
import { JudgeSubmission, judgeWithinDeadline, SYSTEM_ERROR_MESSAGE } from '../src/application/judge-submission';
import type { ExecResult, RunResult, Sandbox, SandboxSession } from '../src/domain/sandbox';
import { LEFTOVERS_MESSAGE } from '../src/domain/verdict';

const ok: RunResult = {
  exitCode: 0, signal: 0, stdout: '3\n', stderr: '', timeMs: 5, memoryKb: 1_000,
  timedOut: false, cpuLimitKill: false, outputLimit: false, startFailed: false, leftovers: false,
};

/** A sandbox whose n-th run (1-based) reports processes it could not stop; counts runs and disposals. */
class Scripted implements Sandbox {
  runs = 0;
  disposed = 0;
  constructor(private readonly leftoversOnRun: number, private readonly compile?: Partial<ExecResult>) {}
  async open(): Promise<SandboxSession> {
    return {
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false, startFailed: false, ...this.compile }),
      run: async () => ({ ...ok, leftovers: ++this.runs === this.leftoversOnRun }),
      dispose: async () => void this.disposed++,
    };
  }
}

const job = (language: JudgeJob['language'] = 'python'): JudgeJob => ({
  submissionId: 's', judgeRun: 1, language, sourceCode: 'x', timeLimitMs: 1000, memoryLimitMb: 64,
  testCases: [1, 2, 3].map((i) => ({ id: `t${i}`, input: '', expectedOutput: '3\n', points: 1, isSample: false })),
});

test('a program that leaves processes behind gets a counted RE on that test, not a free system error (NEW-1)', async () => {
  const sandbox = new Scripted(2);
  const result = await new JudgeSubmission(sandbox).execute(job());
  assert.equal(result.type, 'finished');
  if (result.type !== 'finished') return;
  assert.equal(result.verdict, 'RE', 'an attempt that counts, unlike IE');
  assert.deepEqual(result.testResults.map((r) => r.verdict), ['AC', 'RE'], 'judging stops: the container is no longer trusted');
  assert.equal(result.testResults[1].message, LEFTOVERS_MESSAGE);
  assert.equal(sandbox.runs, 2);
  assert.equal(sandbox.disposed, 1);
});

test('a compiler that cannot start is a system error (IE) with the plain message, not a compile error that counts (N3)', async () => {
  const sandbox = new Scripted(0, { exitCode: 127, startFailed: true, stderr: "oj-run: cannot start 'g++': execve failed" });
  const logged: unknown[] = [];
  const result = await judgeWithinDeadline(new JudgeSubmission(sandbox), job('cpp'), 5_000, (_m, e) => logged.push(e));
  assert.equal(result.type === 'finished' && result.verdict, 'IE');
  assert.equal(result.type === 'finished' && result.compileOutput, SYSTEM_ERROR_MESSAGE);
  assert.match(String(logged[0]), /g\+\+/, 'the reason is in the engine log');
  assert.equal(sandbox.disposed, 1);
});

test('text a program controls never carries a NUL or a lone surrogate into the result, which the database cannot store (F-2)', async () => {
  const dirty = 'x\u0000y\ud800z';
  const sandbox: Sandbox = {
    open: async () => ({
      exec: async () => ({ exitCode: 1, stdout: '', stderr: `error: ${dirty}`, timedOut: false, startFailed: false }),
      run: async () => ({ ...ok, exitCode: 1, stdout: '', stderr: dirty }),
      dispose: async () => undefined,
    }),
  };
  const judge = new JudgeSubmission(sandbox);
  const re = await judge.execute(job());
  const ce = await judge.execute(job('cpp'));
  const texts = [
    ...(re.type === 'finished' ? re.testResults.map((t) => t.message ?? '') : []),
    ce.type === 'finished' ? ce.compileOutput ?? '' : '',
  ];
  assert.ok(texts.some((t) => t.includes('x')), 'the message itself is kept');
  for (const text of texts) {
    assert.doesNotMatch(text, /\u0000/);
    assert.doesNotMatch(text, /[\ud800-\udbff](?![\udc00-\udfff])/);
  }
});

test('a system error before any of the program ran is the infrastructure; once a test started it is attributed to the program (F-3)', async () => {
  const failingAt = (where: 'open' | 'compile' | 'run'): Sandbox => ({
    open: async () => {
      if (where === 'open') throw new Error('Cannot start sandbox container');
      return {
        exec: async () => {
          if (where === 'compile') throw new Error('A process inside the sandbox could not be stopped');
          return { exitCode: 0, stdout: '', stderr: '', timedOut: false, startFailed: false };
        },
        run: async () => { throw new Error('The sandbox supervisor failed (docker exec exit 137)'); },
        dispose: async () => undefined,
      };
    },
  });
  const fault = async (where: 'open' | 'compile' | 'run') => {
    const result = await judgeWithinDeadline(new JudgeSubmission(failingAt(where)), job('cpp'), 5_000, () => undefined);
    assert.equal(result.type === 'finished' && result.verdict, 'IE', where);
    return result.type === 'finished' ? result.systemFault : undefined;
  };
  assert.equal(await fault('open'), 'infrastructure');
  assert.equal(await fault('compile'), 'infrastructure', 'the compiler is not the student');
  assert.equal(await fault('run'), 'program', 'a test had started: the program may have caused it');
});

test('a job that runs out of time after its tests started is attributed to the program; before, to the infrastructure (F-3)', async () => {
  const hangsAt = (where: 'open' | 'run'): Sandbox => ({
    open: async () => {
      if (where === 'open') return new Promise(() => {});
      return {
        exec: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false, startFailed: false }),
        run: () => new Promise(() => {}),
        dispose: async () => undefined,
      };
    },
  });
  const atOpen = await judgeWithinDeadline(new JudgeSubmission(hangsAt('open')), job(), 50, () => undefined);
  const atRun = await judgeWithinDeadline(new JudgeSubmission(hangsAt('run')), job(), 50, () => undefined);
  assert.equal(atOpen.type === 'finished' && atOpen.systemFault, 'infrastructure');
  assert.equal(atRun.type === 'finished' && atRun.systemFault, 'program');
});
