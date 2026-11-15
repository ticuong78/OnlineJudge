'use client';

import { useEffect, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { TIME_ZONE, type Locale } from './config';
import type { Messages } from './messages';
import { vi } from './messages/vi';
import { setActiveLocale } from './runtime';
import { localizeValidation } from '@/lib/validation';

/**
 * Gives every client component `useTranslations` for the locale the server read from the cookie. Vietnamese, the
 * default, is bundled (runtime.ts needs it anyway); any other language arrives as `messages` from the root layout, so
 * a browser downloads only the dictionaries it uses.
 */
export function I18nProvider({ locale, messages: sent, children }: { locale: Locale; messages?: Messages; children: ReactNode }) {
  const messages = sent ?? vi;
  // Browser only (see runtime.ts): on the server this module state would be shared between requests. During render,
  // not in an effect, so formatters called by children in this same first render already see the locale.
  if (typeof window !== 'undefined') setActiveLocale(locale, messages);
  // Browser validation bubbles in the interface language, not the browser's (UAT L4).
  useEffect(() => localizeValidation(document), []);
  return (
    <IntlProvider locale={locale} messages={messages} timeZone={TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}
