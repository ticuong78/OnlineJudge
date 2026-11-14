'use client';

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError, errorMessage } from './api';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  /** HTTP status of the failed call (0 when the server could not be reached), for branching without reading text. */
  errorStatus: number | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/** Small data-loading hook: runs `fn` whenever deps change; ignores stale responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, enabled = true): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const callId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    fn()
      .then((d) => {
        if (id === callId.current) setDataState(d);
      })
      .catch((e) => {
        if (id === callId.current) {
          setError(errorMessage(e));
          setErrorStatus(e instanceof ApiError ? e.status : null);
        }
      })
      .finally(() => {
        if (id === callId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater,
    );
  }, []);

  return { data, error, errorStatus, loading, reload, setData };
}
