'use client';

import { MailWarning } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { useToast } from '@/components/toast';
import { Button, Card, Field, InlineAlert, inputClass, LoadingState } from '@/components/ui';
import { OTP_LENGTH, OtpInput } from '@/components/verification';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { formatDateTime } from '@/lib/utils';

/** `askedToResend`: the server's message already tells the user to get the invitation sent again. */
function InvalidInvite({ message, askedToResend = false }: { message: string; askedToResend?: boolean }) {
  const t = useTranslations('auth.invite');
  return (
    <Card className="p-6">
      <MailWarning className="mb-3 h-7 w-7 text-mark-600" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{t('invalidTitle')}</h2>
      <p className="mt-1 text-sm text-mark-700">{message}</p>
      <p className="mt-3 text-sm text-slate-600">
        {askedToResend ? t('afterResend') : t('askResend')}
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-medium text-ink-600 hover:underline">
          {t('backToLogin')}
        </Link>
      </p>
    </Card>
  );
}

function AcceptInvite() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const t = useTranslations('auth');
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [errorCode, setErrorCode] = useState<string | undefined>();
  const invite = useAsync(
    () =>
      api.getInvitation(id).catch((e: unknown) => {
        setErrorCode(e instanceof ApiError ? e.code : undefined);
        throw e;
      }),
    [id],
    !!id,
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The code comes in the fragment (#c=), which the browser never sends to a server; links sent before that change
  // carry it as ?code=. Either way it is read once and removed from the address bar, so it does not stay in history.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('c') ?? params.get('code') ?? '';
    // Strict Mode runs this twice in development: the second run finds the address bar already cleaned and must
    // leave the code read by the first one alone.
    if (!fromLink) return;
    setCode(fromLink.replace(/\D/g, '').slice(0, OTP_LENGTH));
    window.history.replaceState(null, '', `${window.location.pathname}?id=${encodeURIComponent(id)}`);
    // read the link once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!id) return <InvalidInvite message={t('invite.missingId')} />;
  if (invite.loading) return <LoadingState label={t('invite.opening')} />;
  if (invite.error || !invite.data) {
    return (
      <InvalidInvite
        message={invite.error ?? t('invite.invalid')}
        askedToResend={errorCode === 'identity.invitation_expired'}
      />
    );
  }
  const inv = invite.data;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.length !== OTP_LENGTH) return setError(t('invite.codeIncomplete'));
    if (password.length < 6) return setError(t('validation.passwordTooShort'));
    if (password !== confirm) return setError(t('validation.passwordMismatch'));
    setSubmitting(true);
    try {
      const res = await api.acceptInvitation({ invitationId: id, code, password });
      signIn(res);
      toast.success(t('invite.activated'));
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{t('invite.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('invite.intro')}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control border border-rule bg-slate-50 px-4 py-3 text-sm">
        <dt className="text-slate-500">{t('invite.name')}</dt>
        <dd className="font-medium text-slate-900">{inv.displayName}</dd>
        <dt className="text-slate-500">{t('fields.email')}</dt>
        <dd className="font-medium break-all text-slate-900">{inv.email}</dd>
        <dt className="text-slate-500">{t('invite.expires')}</dt>
        <dd className="text-slate-700">{formatDateTime(inv.expiresAt)}</dd>
      </dl>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">{t('invite.code')}</span>
          <OtpInput value={code} onChange={setCode} disabled={submitting} />
          <span className="mt-1 block text-xs text-slate-500">{t('invite.codeHint')}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('fields.password')}>
            <input
              type="password"
              required
              autoComplete="new-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t('fields.confirmPassword')}>
            <input
              type="password"
              required
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" className="w-full" loading={submitting}>
          {t('invite.submit')}
        </Button>
      </form>
    </Card>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AcceptInvite />
    </Suspense>
  );
}
