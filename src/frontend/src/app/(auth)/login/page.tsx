'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { PasswordInput } from '@/components/form-fields';
import { usePageTitle } from '@/lib/page-title';
import { Button, Card, Field, InlineAlert, inputClass, LoadingState } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';

function LoginForm() {
  const t = useTranslations('auth');
  usePageTitle(t('login.title'));
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get('next');
  // Resolved against this page's origin when used (in the browser only): see lib/safe-next.ts.
  const target = () => safeNext(rawNext, window.location.origin);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(safeNext(rawNext, window.location.origin));
  }, [loading, user, router, rawNext]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      router.replace(target());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">{t('login.title')}</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label={t('fields.email')}>
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('login.emailPlaceholder')}
          />
        </Field>
        <Field label={t('fields.password')}>
          <PasswordInput
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-sm text-ink-600 hover:underline">
            {t('login.forgot')}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          {t('login.submit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="font-medium text-ink-600 hover:underline">
          {t('login.register')}
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}
