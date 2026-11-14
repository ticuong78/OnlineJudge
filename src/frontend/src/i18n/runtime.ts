import { createTranslator } from 'use-intl/core';
import { DEFAULT_LOCALE, INTL_TAG, TIME_ZONE, type Locale } from './config';
import type { Messages } from './messages';
// Only the default dictionary is imported here; the active one arrives from the server through I18nProvider, so a
// browser never downloads the language it is not using (except Vietnamese, the default, which this file needs).
import { vi } from './messages/vi';

/**
 * The active interface language for code outside React components (formatters in lib/, the API client's error text,
 * helpers like formatRemaining). Components use `useTranslations` instead.
 *
 * Browser only. On the server this module is shared by every request, so it is never switched there and always
 * answers in Vietnamese: text rendered on the server must come from hooks (`useTranslations`, `useLocale`), which
 * are per request. Today server renders of signed-in pages show only a loading state, so nothing depends on it.
 * In the browser it is set once per page load by I18nProvider; switching language reloads the page, so it never
 * changes under a mounted tree. Unit tests run in Node without a provider and call setActiveLocale themselves.
 */
let active: Locale = DEFAULT_LOCALE;
let translator = createTranslator({ locale: active, messages: vi, timeZone: TIME_ZONE });

export function setActiveLocale(locale: Locale, messages: Messages) {
  if (locale === active) return;
  active = locale;
  translator = createTranslator({ locale, messages, timeZone: TIME_ZONE });
}

export function activeLocale(): Locale {
  return active;
}

/** BCP 47 tag of the active locale, for Intl and toLocale* calls. */
export function intlTag(): string {
  return INTL_TAG[active];
}

/** Typed translator for the active locale, for non-React code: `tr()('common.retry')`. */
export function tr() {
  return translator;
}
