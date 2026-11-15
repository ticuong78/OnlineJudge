import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStaleTrial, JudgeSubmission } from '../src/application/judge-submission';
import { outputsMatch } from '../src/domain/output-checker';
import { LocalSandbox } from '../src/infrastructure/local-sandbox';

test('output checker ignores trailing whitespace and CRLF', () => {
  assert.ok(outputsMatch('1 2 \r\n3\r\n\r\n', '1 2\n3'));
  assert.ok(!outputsMatch('1 2', '1  2'));
});

const job = (sourceCode: string) => ({
  submissionId: 's1',
  judgeRun: 1,
  language: 'python' as const,
  sourceCode,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  testCases: [
    { id: 't1', input: '1 2\n', expectedOutput: '3\n', points: 1, isSample: true },
    { id: 't2', input: '10 20\n', expectedOutput: '30\n', points: 1, isSample: false },
  ],
});

const judge = new JudgeSubmission(new LocalSandbox());

test('accepts a correct python solution', async () => {
  const r = await judge.execute(job('a, b = map(int, input().split())\nprint(a + b)\n'));
  assert.equal(r.verdict, 'AC');
  assert.deepEqual(r.testResults.map((t) => t.points), [1, 1]);
});

test('wrong answer and runtime error', async () => {
  assert.equal((await judge.execute(job('print(3)\n'))).verdict, 'WA');
  assert.equal((await judge.execute(job('raise SystemExit(1)\n'))).verdict, 'RE');
});

test('compile error for invalid python', async () => {
  const r = await judge.execute(job('def (:\n'));
  assert.equal(r.verdict, 'CE');
});

test('time limit exceeded', async () => {
  const r = await judge.execute({ ...job('while True: pass\n'), timeLimitMs: 300 });
  assert.equal(r.verdict, 'TLE');
});

test('OJ-15 F1: each result says whether its test is a sample, so the backend can hide hidden tests\' diagnostics', async () => {
  const r = await judge.execute(job('import sys\nsys.stderr.write(sys.stdin.read())\nraise SystemExit(1)\n'));
  assert.equal(r.type, 'finished');
  if (r.type !== 'finished') return;
  assert.deepEqual(r.testResults.map((t) => [t.testCaseId, t.isSample]), [['t1', true], ['t2', false]]);
  // The engine keeps the program's output for teachers; the backend decides what a student sees.
  assert.match(r.testResults[1].message ?? '', /10 20/);
});

test('OJ-18: a trial job returns the program output of each sample; a submission never carries program output', async () => {
  const echo = 'print(input().upper() * 3000)\n';
  const trial = await judge.execute({ ...job(echo), trial: true, testCases: [job(echo).testCases[0]] });
  assert.equal(trial.testResults.length, 1);
  assert.equal(trial.testResults[0].verdict, 'WA');
  assert.equal(trial.testResults[0].output?.length, 4000, 'cut to TRIAL_OUTPUT_MAX_CHARS');
  assert.ok(trial.testResults[0].output?.startsWith('1 21 2'));

  const submission = await judge.execute(job(echo));
  assert.ok(submission.testResults.every((t) => t.output === undefined), 'no output on a submission');

  // Defence in depth: even a trial job never returns output for a test that is not a sample.
  const mixed = await judge.execute({ ...job(echo), trial: true });
  assert.deepEqual(mixed.testResults.map((t) => t.output === undefined), [false, true]);
});

test('OJ-18: a trial job that waited past its lifetime is skipped; a submission never is', () => {
  const j = job('print(1)');
  assert.equal(isStaleTrial({ ...j, trial: true }, 0, 1000, 999), true);
  assert.equal(isStaleTrial({ ...j, trial: true }, 0, 999, 999), false);
  assert.equal(isStaleTrial(j, 0, 1_000_000, 999), false);
});
