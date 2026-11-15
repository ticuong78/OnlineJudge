import type { AiFeature, AiUsageDto } from '@oj/contracts';

/** Pure helpers for the AI allowance labels (OJ-21), kept apart from the HTTP client so they can be tested. */

export interface AiFeatureState {
  /** The plan includes this feature (before any use). */
  enabled: boolean;
  /** This month's uses are gone. */
  exhausted: boolean;
  /** null = no limit. */
  limit: number | null;
  left: number | null;
  resetsAt: string | null;
}

/** Pure: a feature's state from the plan and the usage (tested). */
export function featureState(plan: string | undefined, usage: AiUsageDto | null, feature: AiFeature): AiFeatureState {
  const row = usage?.features.find((f) => f.feature === feature);
  // Until the usage is known, trust the plan: teachers have the import, rewrite and test features.
  const enabled = row ? row.limit !== 0 : plan === 'FREE' || plan === 'PLUS' || plan === 'UNLIMITED';
  const limit = row ? row.limit : null;
  const left = row && row.limit !== null ? Math.max(0, row.limit - row.used) : null;
  return { enabled, exhausted: enabled && left === 0, limit, left, resetsAt: usage?.resetsAt ?? null };
}

/** Whether to show the "uses left" label: always on a free allowance, otherwise only when it is running low. */
export function showUsesLeft(plan: string | undefined, state: AiFeatureState): boolean {
  if (state.limit === null || !state.enabled) return false;
  return plan === 'FREE' || (state.left ?? 0) <= 10;
}
