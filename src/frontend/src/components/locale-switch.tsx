'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { LOCALES, localeCookie, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

const SHORT: Record<Locale, string> = { vi: 'VI', en: 'EN' };

/**
 * Two-button language switch. Writes the cookie and reloads: the server renders the new language from the first
 * byte (`<html lang>`, page title), and no component can keep text from the old one.
 */
export function LocaleSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('common.language');

  const choose = (next: Locale) => {
    if (next === locale) return;
    document.cookie = localeCookie(next);
    window.location.reload();
  };

  return (
    <div role="group" aria-label={t('label')} className={cn('inline-flex items-center gap-1', className)}>
      <Languages className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => choose(l)}
            aria-pressed={l === locale}
            aria-label={t(l)}
            title={t(l)}
            className={cn(
              'h-7 min-w-9 rounded-md px-2 text-xs font-semibold transition-colors',
              l === locale ? 'bg-surface text-ink-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {SHORT[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
