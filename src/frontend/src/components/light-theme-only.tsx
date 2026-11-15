'use client';

import { useLightThemeOnly } from '@/lib/theme';

/** Keeps the light theme while a printed page is shown (OJ-19). */
export function LightThemeOnly() {
  useLightThemeOnly();
  return null;
}
