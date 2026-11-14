import { storageGet, storageSet } from './utils';

/** Whether a form's value differs from what was loaded or last saved. Key order does not matter. */
export function isDirty(current: unknown, saved: unknown): boolean {
  return stableJson(current) !== stableJson(saved);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** The part of a link click the leave guard needs; a plain object so the decision can be tested without a DOM. */
export interface LinkClick {
  href: string | null;
  target: string | null;
  download: boolean;
  button: number;
  modified: boolean;
  defaultPrevented: boolean;
}

/**
 * Whether a click on a link leaves the current page inside this app, so unsaved work would be lost without a word.
 * New tabs, downloads, other sites and links to a spot on the same page are left alone.
 */
export function leavesPage(click: LinkClick, here: URL): URL | null {
  if (!click.href || click.defaultPrevented || click.button !== 0 || click.modified || click.download) return null;
  if (click.target && click.target !== '_self') return null;
  let to: URL;
  try {
    to = new URL(click.href, here);
  } catch {
    return null;
  }
  if (to.origin !== here.origin) return null;
  if (to.pathname === here.pathname && to.search === here.search) return null;
  return to;
}

/** A form's work kept in this browser until it is saved, so leaving by accident (Back, a crash) loses nothing. */
export interface Draft<T> {
  value: T;
  savedAt: string;
}

export function readDraft<T>(key: string): Draft<T> | null {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft<T>>;
    return parsed && typeof parsed === 'object' && 'value' in parsed && typeof parsed.savedAt === 'string'
      ? (parsed as Draft<T>)
      : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T, now = new Date()): void {
  storageSet(key, JSON.stringify({ value, savedAt: now.toISOString() } satisfies Draft<T>));
}

/** Key prefix of the problem drafts (one per teacher account): see ProblemForm and NewProblemPage. */
export const PROBLEM_DRAFT_PREFIX = 'oj:draft:problem-new:';

interface KeyStore {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/**
 * Key of a student's code draft on the solve page. It names the account: on a shared lab computer the next student
 * who opens the same problem must start from the template, not from the previous student's code.
 */
export function codeDraftKey(userId: string, sessionId: string, problemKey: string, language: string): string {
  return `${CODE_DRAFT_PREFIX}${userId}:${sessionId}:${problemKey}:${language}`;
}

const DRAFT_PREFIX = 'oj:draft:';
const CODE_DRAFT_PREFIX = `${DRAFT_PREFIX}u:`;

/**
 * What sign-out removes from this browser:
 * - every teacher's problem draft, since a shared computer must not keep an unpublished problem (the same reason the
 *   "continue" shortcut is forgotten, K-2);
 * - code drafts saved before they were keyed by account (`oj:draft:<session>:<problem>:<language>`), which any
 *   student on the same computer could open.
 * Code drafts keyed by account stay, so a student who signs back in on the same computer keeps their work.
 */
export function shouldForgetOnSignOut(key: string): boolean {
  if (!key.startsWith(DRAFT_PREFIX)) return false;
  return key.startsWith(PROBLEM_DRAFT_PREFIX) || !key.startsWith(CODE_DRAFT_PREFIX);
}

export function forgetDraftsOnSignOut(store: KeyStore | null = browserStore()): void {
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && shouldForgetOnSignOut(k)) keys.push(k);
  }
  for (const k of keys) store.removeItem(k);
}

function browserStore(): KeyStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * The form after the page hands it the stored version (for example after a save, which the server normalises: tags
 * lowercased, title trimmed). Untouched since the last save: show the stored version and count it as saved. Edited
 * since: keep the edits, against the new saved version (review of OJ-13: the form stayed "unsaved" after saving).
 */
export function adoptStored<T>(current: T, lastSaved: T, stored: T): { value: T; saved: T } {
  return { value: isDirty(current, lastSaved) ? current : stored, saved: stored };
}

/**
 * Writes a draft a moment after the last change. `stop()` after a successful save also cancels a write still waiting:
 * a save that finished inside the delay used to be followed by that write, leaving a stale draft (review of OJ-13).
 */
export function createDraftAutosave<T>(write: (value: T) => void, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  return {
    schedule(value: T) {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (!stopped) write(value);
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
    stop() {
      stopped = true;
      this.cancel();
    },
    get stopped() {
      return stopped;
    },
  };
}
