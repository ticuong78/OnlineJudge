import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languageSpecFor } from '../src/domain/language';
import {
  BOX_TMPFS_MB,
  MIB,
  SCRATCH_ALLOWANCE_MB,
  SUPERVISOR_HEADROOM_MB,
  TMP_TMPFS_MB,
  ioBudgetBytes,
  jobDeadlineMs,
  maxOutputBytes,
  runMemoryCapMb,
  wallLimitMs,
} from '../src/domain/resource-plan';
import { JudgeSubmission } from '../src/application/judge-submission';
import { LocalSandbox } from '../src/infrastructure/local-sandbox';

test('wall limit: three times the CPU limit plus a second, in whole seconds', () => {
  assert.equal(wallLimitMs(1000), 4000);
  assert.equal(wallLimitMs(300), 2000);
  assert.equal(wallLimitMs(100), 2000);
  assert.equal(wallLimitMs(2000), 7000);
  assert.equal(wallLimitMs(15_000), 46_000);
});

test('output cap follows the expected output, clamped to 4..64 MiB', () => {
  assert.equal(maxOutputBytes(''), 4 * MIB);
  assert.equal(maxOutputBytes('3\n'), 4 * MIB);
  assert.equal(maxOutputBytes('x'.repeat(5 * MIB)), 11 * MIB);
  assert.equal(maxOutputBytes('x'.repeat(40 * MIB)), 64 * MIB);
  // measured in bytes, not characters
  assert.equal(maxOutputBytes('é'.repeat(3 * MIB)), 13 * MIB); // 6 MiB of UTF-8 -> 2 x 6 + 1
});

test('capture budget is the worst test: input + stdout cap + stderr cap', () => {
  assert.equal(ioBudgetBytes([]), 0);
  const small = { input: '1 2\n', expectedOutput: '3\n' };
  assert.equal(ioBudgetBytes([small]), 4 + 2 * 4 * MIB);
  const big = { input: 'x'.repeat(10 * MIB), expectedOutput: 'y'.repeat(5 * MIB) };
  assert.equal(ioBudgetBytes([small, big]), 10 * MIB + 2 * 11 * MIB);
  assert.equal(ioBudgetBytes([big, small]), ioBudgetBytes([small, big]));
});

test('run memory cap: program budget + capture buffers + scratch allowance', () => {
  // a 64 MiB problem in C++ (+16 MiB runtime baseline), the smallest capture budget
  const io = ioBudgetBytes([{ input: '1 2\n', expectedOutput: '3\n' }]);
  assert.equal(runMemoryCapMb(80, io), 80 + Math.ceil(io / MIB) + SCRATCH_ALLOWANCE_MB);
  assert.equal(runMemoryCapMb(80, io), 80 + 9 + 96);
  // Both tmpfs mounts can be filled completely and still leave room for the supervisor: otherwise a program that fills
  // them gets oj-run itself killed after it ends, which reads as a (free) system error, not as its result (audit NF-1).
  assert.ok(SCRATCH_ALLOWANCE_MB >= BOX_TMPFS_MB + TMP_TMPFS_MB + SUPERVISOR_HEADROOM_MB);
  assert.ok(SUPERVISOR_HEADROOM_MB >= 16);
  assert.ok(runMemoryCapMb(16, 0) >= 16 + SCRATCH_ALLOWANCE_MB);
});

const job = (tests: number, timeLimitMs = 1000) => ({
  timeLimitMs,
  testCases: Array.from({ length: tests }, () => ({ id: 't', input: '', expectedOutput: '', points: 1, isSample: false })),
});

test('job deadline: start + write + build + every test at its wall limit + margin', () => {
  // 60s start + 20s write + (30s build + 5s docker + 15s memory update) + 3 x (4s wall + 5s docker) + 30s margin
  assert.equal(jobDeadlineMs(job(3), true), 60_000 + 20_000 + 50_000 + 3 * 9_000 + 30_000);
  assert.equal(jobDeadlineMs(job(3), false), 60_000 + 20_000 + 3 * 9_000 + 30_000);
});

test('job deadline grows with tests and with the time limit, and always leaves room to start', () => {
  assert.ok(jobDeadlineMs(job(20), true) > jobDeadlineMs(job(3), true));
  assert.ok(jobDeadlineMs(job(3, 5000), true) > jobDeadlineMs(job(3, 1000), true));
  assert.ok(jobDeadlineMs(job(0), false) >= 60_000 + 20_000);
});

test('JudgeSubmission derives the deadline from the language: compiled languages get build time', () => {
  const judge = new JudgeSubmission(new LocalSandbox());
  const j = (language: 'cpp' | 'javascript') => ({ submissionId: 's', judgeRun: 1, language, sourceCode: 'x', timeLimitMs: 1000, memoryLimitMb: 64, testCases: job(2).testCases });
  assert.ok(judge.deadlineMs(j('cpp')) > judge.deadlineMs(j('javascript')));
  assert.equal(languageSpecFor('javascript', '').compile, undefined);
});
