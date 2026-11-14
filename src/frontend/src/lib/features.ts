'use client';

import type { FeaturesDto } from '@oj/contracts';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

// One request per page load: the answer changes only when the server is reconfigured and restarted.
let cached: Promise<FeaturesDto> | null = null;

/**
 * What the server can do (OJ-13). `null` while loading, for students (the endpoint is staff-only) and when the
 * request fails; callers then keep today's behaviour, where using the feature explains itself.
 */
export function useFeatures(): FeaturesDto | null {
  const { isStaff } = useAuth();
  const [features, setFeatures] = useState<FeaturesDto | null>(null);
  useEffect(() => {
    if (!isStaff) return;
    let live = true;
    cached ??= api.features().catch((e) => {
      cached = null;
      throw e;
    });
    cached.then((f) => live && setFeatures(f)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isStaff]);
  return features;
}
