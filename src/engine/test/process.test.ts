import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OperationAborted } from '../src/domain/sandbox';
import { runProcess } from '../src/infrastructure/process';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onWindows = process.platform === 'win32';

test('captures stdout, stderr and the exit code', async () => {
  const r = await runProcess(process.execPath, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], { timeoutMs: 10_000 });
  assert.equal(r.exitCode, 3);
  assert.equal(r.stdout, 'out\n');
  assert.equal(r.stderr, 'err\n');
  assert.equal(r.timedOut, false);
});

test('feeds stdin (string or Buffer) and survives a child that never reads it', async () => {
  const echo = await runProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: Buffer.from([0, 255, 10, 65]), timeoutMs: 10_000, binary: true });
  assert.deepEqual([...echo.stdoutBuffer], [0, 255, 10, 65]);
  assert.equal(echo.stdout, '', 'binary mode leaves the strings empty');
  const ignoring = await runProcess(process.execPath, ['-e', 'process.exit(0)'], { input: 'x'.repeat(5_000_000), timeoutMs: 10_000 });
  assert.equal(ignoring.exitCode, 0);
});

test('binary mode keeps exact bytes; the capture cap drops the rest but still drains the pipe', async () => {
  const r = await runProcess(
    process.execPath,
    ['-e', 'process.stdout.write(Buffer.alloc(3_000_000, 7))'],
    { timeoutMs: 10_000, binary: true, maxCaptureBytes: 1_000_000 },
  );
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdoutBuffer.length, 1_000_000);
  assert.ok(r.stdoutBuffer.every((b) => b === 7));
});

test('the timeout kills the process and reports it', { skip: onWindows }, async () => {
  const r = await runProcess('sleep', ['30'], { timeoutMs: 100 });
  assert.equal(r.timedOut, true);
  assert.equal(r.exitCode, 137);
  assert.equal(r.signal, 'SIGKILL');
});

test('abort kills the process at once and rejects with OperationAborted', { skip: onWindows }, async () => {
  const abort = new AbortController();
  const started = Date.now();
  const pending = runProcess('sleep', ['30'], { timeoutMs: 60_000, signal: abort.signal });
  setTimeout(() => abort.abort(), 50);
  await assert.rejects(pending, OperationAborted);
  assert.ok(Date.now() - started < 1_000);
});

test('an already aborted signal never spawns anything', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(runProcess('definitely-not-a-command', [], { timeoutMs: 1000, signal: abort.signal }), OperationAborted);
});

test('a missing command rejects (the caller decides what that means)', async () => {
  await assert.rejects(runProcess('definitely-not-a-command-xyz', [], { timeoutMs: 1000 }), { code: 'ENOENT' });
});

test('settles when the child exits but something else keeps its pipes open (no hanging on "close")', { skip: onWindows }, async () => {
  // The shell exits at once; the background sleep inherits the stdout pipe and keeps it open for 4 more seconds.
  const started = Date.now();
  const r = await runProcess('sh', ['-c', 'sleep 4 & echo hi'], { timeoutMs: 60_000 });
  const took = Date.now() - started;
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, 'hi\n');
  assert.ok(took < 3_500, `should settle after the 2s flush grace, not wait for the pipe (took ${took}ms)`);
  await sleep(10);
});
