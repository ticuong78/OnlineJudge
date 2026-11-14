'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { nextPreference, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** One button that cycles the theme: system -> light -> dark (OJ-19). Its label says the current choice and the next. */
export function ThemeSwitch({ className }: { className?: string }) {
  const t = useTranslations('common.theme');
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  const next = nextPreference(preference);
  const label = t('label', { current: t(preference), next: t(next) });
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800',
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
