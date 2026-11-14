'use client';

import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { usePageTitle } from '@/lib/page-title';

export default function NotFound() {
  const t = useTranslations('common');
  usePageTitle(t('notFound.title'));
  return (
    <div className="grid-paper flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-hand text-6xl text-mark">404</p>
      <h1 className="text-xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-sm text-slate-600">{t('notFound.body')}</p>
      <Link href="/" className="font-medium text-ink-600 hover:underline">
        {t('home')}
      </Link>
    </div>
  );
}
