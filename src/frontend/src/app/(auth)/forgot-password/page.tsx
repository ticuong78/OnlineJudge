'use client';

import type { VerificationTicketDto } from '@oj/contracts';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { PasswordInput } from '@/components/form-fields';
import { usePageTitle } from '@/lib/page-title';
import { Button, Card, Field, InlineAlert, inputClass } from '@/components/ui';
import { ResendCodeButton, useEmailLink, useNow, type EmailLink } from '@/components/verification';
import { useToast } from '@/components/toast';
import { api, errorMessage } from '@/lib/api';
import { intlTag } from '@/i18n/runtime';
import { useAuth } from '@/lib/auth';

/**
 * Password reset is by emailed link only (no code to type): step 1 asks for the address, step 2 says to open the
 * email, and the link brings the user back here to choose the new password.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  usePageTitle(t('forgot.title'));
  const now = useNow();
  const link = useEmailLink();

  const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState<VerificationTicketDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setTicket(await api.forgotPassword({ email: email.trim() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (link === undefined) return null; // the address bar has not been read yet
  if (link) return <ResetFromLink link={link} />;

  if (!ticket) {
    return (
      <Card className="p-6">
        <Link href="/login" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink-700">
          <ChevronLeft className="h-4 w-4 shrink-0" />
          {t('forgot.signIn')}
        </Link>
        <h2 className="text-lg font-semibold">{t('forgot.title')}</h2>
        <p className="mb-4 text-sm text-slate-500">{t('forgot.intro')}</p>
        <form onSubmit={sendLink} className="space-y-4">
          <Field label={t('fields.email')}>
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && <InlineAlert>{error}</InlineAlert>}
          <Button type="submit" className="w-full" loading={submitting}>
            {t('forgot.sendLink')}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <button
        type="button"
        onClick={() => {
          setTicket(null);
          setError(null);
        }}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink-700"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        {t('changeEmail')}
      </button>
      <h2 className="text-lg font-semibold">{t('forgot.checkTitle')}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {t.rich('forgot.checkBody', { email: ticket.email, b: (c) => <b className="text-slate-900">{c}</b> })}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {t('forgot.linkValid', {
          time: new Date(ticket.expiresAt).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' }),
        })}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-500">
        <span>{t('noEmail')}</span>
        <ResendCodeButton ticket={ticket} now={now} what="email" onResent={(next) => { setTicket(next); setError(null); }} />
      </div>
    </Card>
  );
}

/** Opened from the link in the reset email: the only way to set a new password. */
function ResetFromLink({ link }: { link: EmailLink }) {
  const t = useTranslations('auth');
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError(t('forgot.newPasswordTooShort'));
    if (password !== confirm) return setError(t('validation.passwordMismatch'));
    setSubmitting(true);
    try {
      signIn(await api.resetPassword({ ...link, newPassword: password }));
      toast.success(t('forgot.resetDone'));
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{t('forgot.resetTitle')}</h2>
      <form onSubmit={reset} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('forgot.newPassword')}>
            <PasswordInput
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t('forgot.confirmNewPassword')}>
            <PasswordInput
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" className="w-full" loading={submitting}>
          {t('forgot.resetSubmit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {t('forgot.linkUsed')}{' '}
        <a href="/forgot-password" className="font-medium text-ink-600 hover:underline">
          {t('forgot.resendEmail')}
        </a>
      </p>
    </Card>
  );
}
