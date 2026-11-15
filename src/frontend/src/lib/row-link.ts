import type { MouseEvent } from 'react';

/**
 * A table row that opens a page when clicked anywhere (bank, U2). Not done with a "stretched link" (an absolutely
 * positioned ::after over a `position: relative` row): Safari does not position table rows, so the overlay escaped the
 * row and covered the whole page, and every click on Safari opened the last row (found in the Safari check, OJ-20).
 *
 * The row's own link stays the real link (keyboard, screen readers, "open in new tab"); this only handles pointer
 * clicks elsewhere in the row. Clicks on interactive children and the end of a text selection are left alone.
 */
export function rowClick(open: (href: string, newTab: boolean) => void, href: string) {
  const handle = (e: MouseEvent<HTMLElement>, newTab: boolean) => {
    if (!shouldOpenRow(e.target as Element, e.currentTarget, window.getSelection()?.toString() ?? '')) return;
    open(href, newTab);
  };
  return {
    onClick: (e: MouseEvent<HTMLElement>) => handle(e, e.metaKey || e.ctrlKey),
    // Middle click opens a new tab, as on a link.
    onAuxClick: (e: MouseEvent<HTMLElement>) => e.button === 1 && handle(e, true),
  };
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

/** Open only for a click on the row itself, not on something inside it that does its own thing. */
export function shouldOpenRow(target: Element | null, row: Element, selection: string): boolean {
  if (selection.trim()) return false;
  const hit = target?.closest(INTERACTIVE);
  return !hit || !row.contains(hit);
}
