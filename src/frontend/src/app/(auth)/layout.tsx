'use client';

import { Code2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { LocaleSwitch } from '@/components/locale-switch';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  return (
    <div className="grid-paper flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LocaleSwitch />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-ink-600 text-white">
            <Code2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl leading-tight font-bold text-slate-900">{t('appName')}</h1>
            <p className="text-sm text-slate-600">{t('appTagline')}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
