import type { UserDto } from '@oj/contracts';

/**
 * The signed-in account's summary, kept so a page can draw its shell before `/auth/me` answers (OJ-16). Only a hint
 * for the interface: the server checks every request. Stored next to the token (same storage, ADR 0002), tagged with
 * the token it belongs to, so one account's name is never shown with another account's token.
 */
const KEY = 'oj:me';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Enough of the token to tell two tokens apart; the token itself already sits in the same storage. */
const fingerprint = (token: string) => token.slice(-16);

function browserStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedUser(token: string | null, store: Store | null = browserStore()): UserDto | null {
  if (!token || !store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { for?: string; user?: UserDto };
    return cached.for === fingerprint(token) && cached.user?.id ? cached.user : null;
  } catch {
    return null;
  }
}

export function writeCachedUser(token: string | null, user: UserDto, store: Store | null = browserStore()): void {
  if (!token || !store) return;
  try {
    store.setItem(KEY, JSON.stringify({ for: fingerprint(token), user }));
  } catch {
    /* storage full or blocked: the shell just waits for /auth/me */
  }
}

export function clearCachedUser(store: Store | null = browserStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
