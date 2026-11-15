import { useEffect, useState } from 'react';

/** What a closing element is doing: shown, playing its exit (still mounted), or gone. */
export type PresenceState = 'open' | 'closing' | 'closed';

/**
 * Keeps an element mounted for its exit transition (OJ-17 motion). Entry needs nothing: CSS `@starting-style` animates
 * from the first frame. On close the element gets `data-state="closing"` for `exitMs`, then unmounts. Reduced motion
 * makes the CSS transition instant; the short wait is harmless.
 */
export function usePresence(open: boolean, exitMs = 120): PresenceState {
  const [state, setState] = useState<PresenceState>(open ? 'open' : 'closed');
  useEffect(() => {
    if (open) {
      setState('open');
      return;
    }
    setState((s) => (s === 'closed' ? 'closed' : 'closing'));
    const timer = setTimeout(() => setState('closed'), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return open ? 'open' : state;
}
