/** Elements a keyboard user can Tab to. Disabled and hidden ones are filtered by `focusables`. */
export const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
  );
}

/**
 * Where Tab should go inside a dialog so focus never leaves it: past the last element it wraps to the first, before
 * the first (Shift+Tab) to the last. `null` lets the browser move focus normally (between two inner elements).
 * `index` is the position of the focused element, or -1 when focus is on the dialog itself or outside it.
 */
export function trapTarget(count: number, index: number, backwards: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return backwards ? count - 1 : 0;
  if (backwards && index === 0) return count - 1;
  if (!backwards && index === count - 1) return 0;
  return null;
}

/** What a dialog remembers between renders about who opened it. */
export interface OpenerState<T> {
  wasOpen: boolean;
  opener: T | null;
}

/**
 * Called on every render of a dialog. The opener is read only on the render that opens it: by the time effects run, a
 * field with autoFocus inside the dialog already has focus, and would be taken for the opener (review of OJ-13).
 */
export function trackOpener<T>(state: OpenerState<T>, open: boolean, focused: T | null): OpenerState<T> {
  if (open && !state.wasOpen) return { wasOpen: true, opener: focused };
  return { wasOpen: open, opener: state.opener };
}
