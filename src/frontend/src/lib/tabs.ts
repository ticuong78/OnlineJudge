/** Keyboard keys the tab bar reacts to, as the WAI-ARIA tabs pattern expects with one tab stop (OJ-32). */
export interface TabKey {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Index of the tab a key moves to, or -1 when the key is not ours. Arrows wrap around; Home and End jump to the ends.
 * A key held with a modifier is left to the browser (Alt+Left is Back on Windows and Linux).
 */
export function nextTabIndex(e: TabKey, current: number, count: number): number {
  if (count <= 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return -1;
  const i = current < 0 ? 0 : current;
  switch (e.key) {
    case 'ArrowRight':
      return (i + 1) % count;
    case 'ArrowLeft':
      return (i - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}

/** Text for a count badge: nothing at 0, so a quiet screen stays quiet; "99+" above 99. */
export function badgeText(count: number | null | undefined): string | null {
  if (!count || count < 0) return null;
  return count > 99 ? '99+' : String(count);
}
