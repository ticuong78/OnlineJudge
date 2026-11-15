import type { LastProblem } from './utils';

/**
 * The "Làm tiếp" shortcut: the last problem a student opened, per account (K-2). Stored in the browser, so it is keyed
 * by the account and forgotten on sign-out: on a shared school computer the next student never sees it.
 */
const PREFIX = 'oj:lastSessionProblem:';
/** Earlier versions kept one shortcut for everyone under this key. */
const LEGACY_KEY = 'oj:lastSessionProblem';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function browserStorage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastProblem(userId: string, store: Store | null = browserStorage()): LastProblem | null {
  try {
    const raw = store?.getItem(PREFIX + userId);
    const v = raw ? (JSON.parse(raw) as LastProblem) : null;
    return v?.sessionId && v.key ? v : null;
  } catch {
    return null;
  }
}

export function writeLastProblem(userId: string, last: LastProblem, store: Store | null = browserStorage()): void {
  try {
    store?.setItem(PREFIX + userId, JSON.stringify(last));
  } catch {
    /* storage full or blocked: the shortcut is a convenience */
  }
}

/** Drops the shortcut when it points to this problem (e.g. it can no longer be opened). */
export function forgetLastProblem(userId: string, sessionId: string, key: string, store: Store | null = browserStorage()): void {
  const last = readLastProblem(userId, store);
  if (last?.sessionId === sessionId && last.key === key) {
    try {
      store?.removeItem(PREFIX + userId);
    } catch {
      /* ignore */
    }
  }
}

/** On sign-out: every account's shortcut and the old shared one. */
export function forgetAllLastProblems(store: Store | null = browserStorage()): void {
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k === LEGACY_KEY || k.startsWith(PREFIX))) keys.push(k);
    }
    keys.forEach((k) => store.removeItem(k));
  } catch {
    /* ignore */
  }
}
