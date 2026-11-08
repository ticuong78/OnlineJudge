'use client';

import type { VerificationTicketDto } from '@oj/contracts';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, InlineAlert, inputClass } from '@/components/ui';
import { ResendCodeButton, useEmailLink, useNow, type EmailLink } from '@/components/verification';
import { useToast } from '@/components/toast';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Password reset is by emailed link only (no code to type): step 1 asks for the address, step 2 says to open the
 * email, and the link brings the user back here to choose the new password.
 */
export default function ForgotPasswordPage() {
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
          <ChevronLeft className="h-4 w-4" />
          Đăng nhập
        </Link>
        <h2 className="text-lg font-semibold">Quên mật khẩu</h2>
        <p className="mb-4 text-sm text-slate-500">Nhập email bạn dùng để đăng nhập. Chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.</p>
        <form onSubmit={sendLink} className="space-y-4">
          <Field label="Email">
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
            Gửi liên kết
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
        <ChevronLeft className="h-4 w-4" />
        Đổi email
      </button>
      <h2 className="text-lg font-semibold">Kiểm tra email</h2>
      <p className="mt-1 text-sm text-slate-600">
        Nếu email có tài khoản, liên kết đặt mật khẩu mới đã được gửi tới <b className="text-slate-900">{ticket.email}</b>.
        Mở email và bấm vào liên kết để đặt mật khẩu mới.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Liên kết có hiệu lực đến {new Date(ticket.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} và
        chỉ dùng được một lần.
      </p>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>Không thấy email? Xem cả thư mục Spam.</span>
        <ResendCodeButton ticket={ticket} now={now} what="email" onResent={(t) => { setTicket(t); setError(null); }} />
      </div>
    </Card>
  );
}

/** Opened from the link in the reset email: the only way to set a new password. */
function ResetFromLink({ link }: { link: EmailLink }) {
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
    if (password.length < 6) return setError('Mật khẩu mới cần ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Hai mật khẩu chưa khớp. Nhập lại mật khẩu ở ô thứ hai.');
    setSubmitting(true);
    try {
      signIn(await api.resetPassword({ ...link, newPassword: password }));
      toast.success('Đã đặt lại mật khẩu');
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Đặt mật khẩu mới</h2>
      <form onSubmit={reset} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mật khẩu mới">
            <input
              type="password"
              required
              autoComplete="new-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
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
          Đặt lại mật khẩu
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Liên kết hết hạn hoặc đã dùng?{' '}
        <a href="/forgot-password" className="font-medium text-ink-600 hover:underline">
          Gửi lại email
        </a>
      </p>
    </Card>
  );
}
