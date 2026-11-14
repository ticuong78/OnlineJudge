'use client';

import type { VerificationTicketDto } from '@oj/contracts';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { PasswordInput } from '@/components/form-fields';
import { usePageTitle } from '@/lib/page-title';
import { Button, Card, Field, InlineAlert, inputClass } from '@/components/ui';
import { CodeExpiry, OTP_LENGTH, OtpInput, ResendCodeButton, useNow } from '@/components/verification';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const t = useTranslations('auth');
  usePageTitle(t('register.title'));
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const now = useNow();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [classCode, setClassCode] = useState('');
  const [ticket, setTicket] = useState<VerificationTicketDto | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneClean = phone.trim();
    if (password.length < 6) return setError(t('validation.passwordTooShort'));
    if (password !== confirm) return setError(t('validation.passwordMismatch'));
    setSubmitting(true);
    try {
      const sent = await api.register({
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phoneClean || null,
        password,
        classCode: classCode.trim() || null,
      });
      setTicket(sent);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (value = code) => {
    if (!ticket) return;
    setError(null);
    if (value.length !== OTP_LENGTH) return setError(t('register.codeIncomplete'));
    setSubmitting(true);
    try {
      const res = await api.verifyRegistration({ verificationId: ticket.verificationId, code: value });
      signIn(res);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  if (ticket) {
    const expired = new Date(ticket.expiresAt).getTime() <= now;
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
        <h2 className="text-lg font-semibold">{t('register.verifyTitle')}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t.rich('register.codeSent', {
            email: ticket.email,
            b: (c) => <b className="text-slate-900">{c}</b>,
          })}
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <OtpInput value={code} onChange={setCode} onComplete={verify} autoFocus disabled={submitting} invalid={!!error} />
          <CodeExpiry ticket={ticket} now={now} />
          {error && <InlineAlert>{error}</InlineAlert>}
          <Button type="submit" className="w-full" loading={submitting} disabled={expired || code.length !== OTP_LENGTH}>
            {t('register.verifySubmit')}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-500">
          <span>{t('noEmail')}</span>
          <ResendCodeButton
            ticket={ticket}
            now={now}
            onResent={(next) => {
              setTicket(next);
              setCode('');
              setError(null);
            }}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{t('register.title')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('register.teacherNote')}</p>
      <form onSubmit={sendCode} className="space-y-4">
        <Field label={t('fields.displayName')}>
          <input
            required
            autoComplete="name"
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('register.namePlaceholder')}
          />
        </Field>
        <Field label={t('fields.email')} hint={t('register.emailHint')}>
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('register.phone')} hint={t('register.phoneHint')}>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912345678"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('fields.password')}>
            <PasswordInput
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t('fields.confirmPassword')}>
            <PasswordInput
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={t('register.classCode')}
          hint={t('register.classCodeHint')}
        >
          <input
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${inputClass} font-mono tracking-widest uppercase`}
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            placeholder="22DTHC5"
          />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" className="w-full" loading={submitting}>
          {t('register.sendCode')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {t('register.hasAccount')}{' '}
        <Link href="/login" className="font-medium text-ink-600 hover:underline">
          {t('register.signIn')}
        </Link>
      </p>
    </Card>
  );
}
