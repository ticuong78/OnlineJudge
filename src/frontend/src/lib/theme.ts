'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/** The user's choice; "system" follows the operating system's light/dark setting (OJ-19). */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'oj:theme';
/** Fired on window when the preference changes in this tab, so every useTheme() follows at once. */
const CHANGED = 'oj:theme-changed';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Printed pages are always light: paper, black ink. */
const PRINT_PATH = /\/(print|answer-key)\/?$/;

export const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean, pathname = ''): Theme {
  if (PRINT_PATH.test(pathname)) return 'light';
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** The switch cycles system -> light -> dark -> system. */
export function nextPreference(current: ThemePreference): ThemePreference {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
}

/**
 * Runs in <head> before the first paint, so a dark-mode user never sees a light flash. Kept small and self-contained
 * (it cannot import): it repeats parsePreference/resolveTheme, which the tests check against it.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');p=p==='light'||p==='dark'?p:'system';var d=p==='dark'||(p==='system'&&matchMedia('${DARK_QUERY}').matches);if(${PRINT_PATH}.test(location.pathname))d=false;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function apply(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches, window.location.pathname);
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** The current preference and the theme in effect; follows the system while set to "system". */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const sync = () => {
      const p = readPreference();
      setPreferenceState(p);
      setTheme(apply(p));
    };
    sync();
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', sync);
    window.addEventListener(CHANGED, sync);
    // Another tab changed it.
    const onStorage = (e: StorageEvent) => e.key === THEME_KEY && sync();
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      if (p === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {
      // Storage blocked: the choice still applies to this page.
    }
    setPreferenceState(p);
    setTheme(apply(p));
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { preference, theme, setPreference };
}

/**
 * Printed pages are light even when they are reached by an in-app link, where the boot script does not run again.
 * Leaving them restores the user's theme.
 */
export function useLightThemeOnly() {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = 'light';
    // Not by the current path: during the navigation away it may still be the printed page's.
    return () => {
      document.documentElement.dataset.theme = resolveTheme(readPreference(), window.matchMedia(DARK_QUERY).matches);
    };
  }, []);
}
