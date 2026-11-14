'use client';

import { Code2, Printer, Send, Users } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { LocaleSwitch } from '@/components/locale-switch';
import { ThemeSwitch } from '@/components/theme-switch';

function Brand({ large }: { large?: boolean }) {
  const t = useTranslations('common');
  return (
    <div className="flex items-center gap-3">
      <span className={large ? 'flex h-14 w-14 items-center justify-center rounded-panel bg-ink-solid text-white' : 'flex h-11 w-11 items-center justify-center rounded-panel bg-ink-solid text-white'}>
        <Code2 className={large ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <div>
        <h1 className={large ? 'text-3xl leading-tight font-bold text-slate-900' : 'text-xl leading-tight font-bold text-slate-900'}>{t('appName')}</h1>
        <p className={large ? 'text-base text-slate-600' : 'text-sm text-slate-600'}>{t('appTagline')}</p>
      </div>
    </div>
  );
}

/**
 * Sign-in, sign-up and reset pages. From lg the empty grid either side of a small card is used (OJ-17, U5): the brand
 * and three lines on what the app does sit on the left, the form on the right. Below lg it is the single column it was.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('auth.intro');
  const points = [
    { icon: Send, text: t('submit') },
    { icon: Users, text: t('teach') },
    { icon: Printer, text: t('print') },
  ];
  return (
    <div className="grid-paper flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md lg:grid lg:max-w-5xl lg:grid-cols-[1fr_28rem] lg:items-center lg:gap-16">
        <div className="hidden lg:block">
          <Brand large />
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-slate-700">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface text-ink-600 ring-1 ring-rule">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-4 flex items-center justify-end gap-2">
            <ThemeSwitch />
            <LocaleSwitch />
          </div>
          <div className="mb-6 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
