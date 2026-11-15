import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiUsageDto } from '@oj/contracts';
import { featureState, showUsesLeft } from '../src/lib/ai-usage-state';

/** OJ-21: what the AI buttons show for a teacher's monthly allowance. */

const usage = (plan: AiUsageDto['plan'], features: AiUsageDto['features']): AiUsageDto => ({
  plan, period: '2026-11', resetsAt: '2026-11-30T17:00:00.000Z', aiAvailable: true, features,
});

test('a free teacher sees uses left, and the control stops at the limit', () => {
  const u = usage('FREE', [{ feature: 'TESTS', limit: 3, used: 1 }, { feature: 'AI_USAGE_CHECK', limit: 0, used: 0 }]);
  const tests = featureState('FREE', u, 'TESTS');
  assert.deepEqual(tests, { enabled: true, exhausted: false, limit: 3, left: 2, resetsAt: '2026-11-30T17:00:00.000Z' });
  assert.equal(showUsesLeft('FREE', tests), true);
  assert.equal(featureState('FREE', usage('FREE', [{ feature: 'TESTS', limit: 3, used: 3 }]), 'TESTS').exhausted, true);
  assert.equal(featureState('FREE', u, 'AI_USAGE_CHECK').enabled, false, 'a zero allowance means the feature is not in the plan');
});

test('VIP sees the count only when running low; unlimited never; students have nothing', () => {
  assert.equal(showUsesLeft('PLUS', featureState('PLUS', usage('PLUS', [{ feature: 'SECTION', limit: 500, used: 20 }]), 'SECTION')), false);
  assert.equal(showUsesLeft('PLUS', featureState('PLUS', usage('PLUS', [{ feature: 'SECTION', limit: 500, used: 495 }]), 'SECTION')), true);
  const admin = featureState('UNLIMITED', usage('UNLIMITED', [{ feature: 'TESTS', limit: null, used: 40 }]), 'TESTS');
  assert.deepEqual([admin.enabled, admin.exhausted, admin.left, showUsesLeft('UNLIMITED', admin)], [true, false, null, false]);
  assert.equal(featureState('NONE', null, 'TESTS').enabled, false);
});

test('before the usage has loaded, a teacher\'s controls are enabled from the plan alone', () => {
  assert.equal(featureState('FREE', null, 'SECTION').enabled, true);
  assert.equal(featureState('FREE', null, 'SECTION').exhausted, false);
});
