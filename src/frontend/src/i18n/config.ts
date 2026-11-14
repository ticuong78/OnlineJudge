/** Interface languages (OJ-12). Vietnamese is the default and the source of truth for wording. */
export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

/** Cookie holding the chosen language. Read on the server so the first render is already in that language. */
export const LOCALE_COOKIE = 'oj_locale';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Anything other than a known locale (missing, tampered, old) falls back to Vietnamese. */
export function resolveLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

/**
 * Time zone for dates formatted by use-intl itself. Dates on screen go through lib/utils (the viewer's own zone, as
 * before OJ-12); this only keeps server and browser renders identical if a message ever formats a date.
 */
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** BCP 47 tag for Intl formatters (dates, numbers). */
export const INTL_TAG: Record<Locale, string> = { vi: 'vi-VN', en: 'en-GB' };

/** Cookie string written by the language switch (client side). */
export function localeCookie(locale: Locale) {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
