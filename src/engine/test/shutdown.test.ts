import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShutdown } from '../src/application/shutdown';

const harness = (close: () => Promise<void>, forceAfterMs = 50) => {
  const exits: number[] = [];
  const logs: string[] = [];
  const shutdown = createShutdown({ close, forceAfterMs, exit: (c) => void exits.push(c), log: (m) => void logs.push(m) });
  return { shutdown, exits, logs };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a clean close exits 0 and cancels the force timer', async () => {
  const h = harness(async () => undefined, 30);
  await h.shutdown('SIGTERM');
  await sleep(80);
  assert.deepEqual(h.exits, [0], 'exactly one exit, and not the forced one');
  assert.match(h.logs[0], /SIGTERM: shutting down/);
});

test('a close that never finishes (dead Redis connection) is cut off: exit 1 after the force delay', async () => {
  const h = harness(() => new Promise(() => undefined), 40);
  const started = Date.now();
  void h.shutdown('SIGTERM');
  await sleep(150);
  assert.deepEqual(h.exits, [1]);
  assert.ok(Date.now() - started >= 40);
  assert.ok(h.logs.some((l) => /did not finish/.test(l)));
});

test('a close that fails exits 1 with the reason, once', async () => {
  const h = harness(async () => { throw new Error('connection reset'); }, 30);
  await h.shutdown('SIGINT');
  await sleep(80);
  assert.deepEqual(h.exits, [1]);
  assert.ok(h.logs.some((l) => /connection reset/.test(l)));
});

test('repeated signals do not start a second shutdown', async () => {
  let closes = 0;
  const h = harness(async () => { closes++; await sleep(10); }, 500);
  await Promise.all([h.shutdown('SIGTERM'), h.shutdown('SIGINT'), h.shutdown('SIGTERM')]);
  assert.equal(closes, 1);
  assert.deepEqual(h.exits, [0]);
});
