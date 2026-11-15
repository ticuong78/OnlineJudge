'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { leavesPage } from '@/lib/unsaved';

/** Ends the bar if a navigation never completes (offline, a cancelled click): it must not hang at the top. */
const GIVE_UP_MS = 10_000;

/**
 * A thin ink bar at the top while an in-app link is loading its page (OJ-16): without it a click looked like it did
 * nothing until the next page appeared, and students clicked again.
 *
 * It listens on the document in the capture phase, after the leave guard's window listener: a click the guard stops
 * (it calls stopImmediatePropagation on window) never reaches it, so no bar appears behind the "leave?" dialog.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!a) return;
      const to = leavesPage(
        {
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          download: a.hasAttribute('download'),
          button: e.button,
          modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
          defaultPrevented: e.defaultPrevented,
        },
        new URL(window.location.href),
      );
      if (to) setActive(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Arrived: the address changed.
  useEffect(() => setActive(false), [pathname, search]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(false), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden" aria-hidden="true">
      <div className="nav-progress h-full bg-ink-solid" />
    </div>
  );
}
