'use client';

import type { AiFeature, AiUsageDto } from '@oj/contracts';
import { useEffect, useState } from 'react';
import { api, getToken } from './api';
import { featureState, type AiFeatureState } from './ai-usage-state';
import { useAuth } from './auth';

export { showUsesLeft, type AiFeatureState } from './ai-usage-state';

/** Fired after any AI request (success or failure) so every "uses left" label refreshes (OJ-21). */
export const AI_USED_EVENT = 'oj:ai-used';

/**
 * One request shared by every AI control on the page, refreshed after each AI action. Keyed by the sign-in (account and
 * token), and a failed request is never kept: after a rejected token and a new sign-in it is asked again.
 */
let cache: { key: string; promise: Promise<AiUsageDto | null> } | null = null;

function load(userId: string, fresh = false): Promise<AiUsageDto | null> {
  const key = `${userId}|${(getToken() ?? '').slice(-16)}`;
  if (!cache || cache.key !== key || fresh) {
    const entry = {
      key,
      promise: api.aiUsage().catch(() => {
        if (cache === entry) cache = null;
        return null;
      }),
    };
    cache = entry;
  }
  return cache.promise;
}

/** The signed-in teacher's AI allowances this month; null while loading, for students, or when unavailable. */
export function useAiUsage(): AiUsageDto | null {
  const { user } = useAuth();
  const [usage, setUsage] = useState<AiUsageDto | null>(null);
  const eligible = !!user && user.aiPlan !== 'NONE';
  useEffect(() => {
    if (!eligible || !user) return setUsage(null);
    let alive = true;
    const refresh = (fresh: boolean) => load(user.id, fresh).then((u) => alive && setUsage(u));
    refresh(false);
    const onUsed = () => refresh(true);
    window.addEventListener(AI_USED_EVENT, onUsed);
    return () => {
      alive = false;
      window.removeEventListener(AI_USED_EVENT, onUsed);
    };
  }, [eligible, user]);
  return usage;
}

export function useAiFeature(feature: AiFeature): AiFeatureState {
  const { user } = useAuth();
  return featureState(user?.aiPlan, useAiUsage(), feature);
}
