import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrialRunDto, TrialRunTestDto } from '@oj/contracts';
import { nextTrialPoll, TRIAL_FAST_FOR_MS, TRIAL_FAST_POLL_MS, TRIAL_SLOW_POLL_MS, trialSummary } from '../src/lib/trial';

/** OJ-18: the trial panel's headline and polling rhythm. */

const sample = (verdict: TrialRunTestDto['verdict']): TrialRunTestDto => ({
  input: '1 2', expectedOutput: '3', output: verdict ? '3' : null, verdict, timeMs: verdict ? 5 : null, memoryKb: null, message: null,
});
const trial = (over: Partial<TrialRunDto>): TrialRunDto => ({
  id: 't', sessionId: 's', problemKey: 'A', language: 'python', status: 'DONE', verdict: 'AC', compileOutput: null,
  tests: [sample('AC'), sample('AC')], createdAt: '', ...over,
});

test('the headline says waiting, a build or system failure, or how many samples passed', () => {
  assert.deepEqual(trialSummary(trial({ status: 'PENDING', verdict: null, tests: [sample(null)] })), { kind: 'pending' });
  assert.deepEqual(trialSummary(trial({ status: 'JUDGING', verdict: null })), { kind: 'judging' });
  assert.deepEqual(trialSummary(trial({ verdict: 'CE', tests: [sample(null)] })), { kind: 'compileError' });
  assert.deepEqual(trialSummary(trial({ verdict: 'IE' })), { kind: 'systemError' });
  assert.deepEqual(trialSummary(trial({})), { kind: 'passed', passed: 2, total: 2 });
  assert.deepEqual(trialSummary(trial({ verdict: 'WA', tests: [sample('AC'), sample('WA')] })), { kind: 'failed', passed: 1, total: 2 });
  // A program stopped early (leftovers) leaves later samples not run: they do not count as passed.
  assert.deepEqual(trialSummary(trial({ verdict: 'RE', tests: [sample('RE'), sample(null)] })), { kind: 'failed', passed: 0, total: 2 });
});

test('polling: every second for a minute, then slowly, and never after the result is in', () => {
  const pending = trial({ status: 'PENDING', verdict: null });
  assert.equal(nextTrialPoll(null, 0), TRIAL_FAST_POLL_MS);
  assert.equal(nextTrialPoll(pending, TRIAL_FAST_FOR_MS - 1), TRIAL_FAST_POLL_MS);
  assert.equal(nextTrialPoll(pending, TRIAL_FAST_FOR_MS), TRIAL_SLOW_POLL_MS);
  assert.equal(nextTrialPoll(trial({}), 0), null);
});
