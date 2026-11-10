'use client';

import type { VerificationTicketDto } from '@oj/contracts';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { intlTag } from '@/i18n/runtime';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from './toast';
import { Button } from './ui';

export const OTP_LENGTH = 6;

/** Current time, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export interface EmailLink {
  verificationId: string;
  token: string;
}

/**
 * The link from a sign-up or password-reset email: `?v=<ticket>#t=<token>`. The token sits in the fragment, which
 * the browser never sends to a server; once read it is removed from the address bar so it does not stay in the
 * history. `undefined` until the URL has been read (first render), then the link or `null`.
 */
export function useEmailLink(): EmailLink | null | undefined {
  const [link, setLink] = useState<EmailLink | null | undefined>(undefined);
  useEffect(() => {
    const verificationId = new URLSearchParams(window.location.search).get('v');
    const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
    // Strict Mode runs this twice in development, the second time after the token was removed from the address
    // bar: keep what the first run read.
    setLink((read) => read ?? (verificationId && token ? { verificationId, token } : null));
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return link;
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });
}

/**
 * Six one-digit boxes. Typing advances, Backspace goes back, and pasting a full code
 * (or an SMS/email autofill into the first box) fills every box.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations('auth.verification');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(clean);
    refs.current[Math.min(focusIndex, OTP_LENGTH - 1)]?.focus();
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
  };

  const onInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or paste into a single box: spread from this position.
      commit(value.slice(0, i) + typed, i + typed.length);
      return;
    }
    const arr = digits.slice();
    arr[i] = typed;
    commit(arr.join('').replace(/\s/g, ''), i + 1);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) {
        arr[i] = '';
        onChange(arr.join(''));
      } else if (i > 0) {
        arr[i - 1] = '';
        onChange(arr.join(''));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    commit(text, text.length);
  };

  return (
    <div className="flex gap-2" role="group" aria-label={t('otpGroup')}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={i === 0 ? OTP_LENGTH : 1}
          aria-label={t('otpDigit', { n: i + 1 })}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-11 rounded-control border bg-white text-center font-mono text-2xl font-semibold text-slate-900 sm:w-12',
            'focus:border-ink-500 focus:ring-2 focus:ring-ink-500/20 focus-visible:outline-none',
            invalid ? 'border-mark-400' : 'border-slate-300',
            disabled && 'bg-slate-100',
          )}
        />
      ))}
    </div>
  );
}

/** Expiry line for a code: neutral while valid, red with the next step once expired. */
export function CodeExpiry({ ticket, now }: { ticket: VerificationTicketDto; now: number }) {
  const t = useTranslations('auth.verification');
  const expired = new Date(ticket.expiresAt).getTime() <= now;
  if (expired) {
    return <p className="text-sm text-mark-700">{t('expired')}</p>;
  }
  return <p className="text-sm text-slate-500">{t('validUntil', { time: formatClock(ticket.expiresAt) })}</p>;
}

/** "Resend code" button, disabled with a countdown until `resendAvailableAt`. `what` names what is sent again. */
export function ResendCodeButton({
  ticket,
  now,
  onResent,
  what = 'code',
}: {
  ticket: VerificationTicketDto;
  now: number;
  onResent: (t: VerificationTicketDto) => void;
  what?: 'code' | 'email';
}) {
  const t = useTranslations('auth.verification');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const wait = Math.max(0, Math.ceil((new Date(ticket.resendAvailableAt).getTime() - now) / 1000));

  const resend = async () => {
    setBusy(true);
    try {
      const next = await api.resendCode({ verificationId: ticket.verificationId });
      onResent(next);
      toast.success(t(`resent.${what}`, { email: next.email }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={resend} disabled={wait > 0} loading={busy} className="text-ink-700">
      {wait > 0 ? t(`resendIn.${what}`, { seconds: wait }) : t(`resend.${what}`)}
    </Button>
  );
}
