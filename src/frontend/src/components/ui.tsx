'use client';

import {
  type Difficulty,
  type ProblemSetType,
  type SubmissionStatus,
  type Verdict,
} from '@oj/contracts';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md';

const variantClass: Record<Variant, string> = {
  primary: 'bg-ink-600 text-white hover:bg-ink-700',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  danger: 'bg-mark-600 text-white hover:bg-mark-700',
  success: 'bg-chalk-600 text-white hover:bg-chalk-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-control font-medium transition-colors whitespace-nowrap',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    variantClass[variant],
    sizeClass[size],
    extra,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {/* Its own element (laid out as if absent): browser translation replaces bare text nodes, and React would then
          fail to insert the spinner next to one ("insertBefore ... not a child of this node"). */}
      <span className="contents">{children}</span>
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  target,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  target?: string;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} target={target}>
      {children}
    </Link>
  );
}

// ---------- Form controls ----------
export const inputClass =
  'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-500/20 focus-visible:outline-none disabled:bg-slate-100';
export const monoTextareaClass = cn(inputClass, 'font-mono text-[13px] leading-5');

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// ---------- Layout ----------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-panel border border-rule bg-white', className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink-600"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-bold text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ---------- States ----------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-600', className)} />;
}

export function LoadingState({ label }: { label?: string }) {
  const t = useTranslations('common');
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner />
      {label ?? t('loading')}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-mark-200 bg-mark-50 px-4 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-mark-500" />
      <p className="text-sm text-mark-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-8 w-8 text-slate-300" />
      <p className="font-medium text-slate-600">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function InlineAlert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'warning' | 'info' | 'success';
  children: ReactNode;
}) {
  const cls = {
    error: 'border-mark-200 bg-mark-50 text-mark-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-ink-200 bg-ink-50 text-ink-800',
    success: 'border-chalk-200 bg-chalk-50 text-chalk-800',
  }[kind];
  return <div className={cn('rounded-lg border px-3 py-2 text-sm', cls)}>{children}</div>;
}

// ---------- Badges ----------
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </span>
  );
}

const difficultyClass: Record<Difficulty, string> = {
  EASY: 'bg-chalk-100 text-chalk-700 ring-1 ring-chalk-200',
  MEDIUM: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  HARD: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  EXPERT: 'bg-mark-100 text-mark-700 ring-1 ring-mark-200',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const t = useTranslations('enums.difficulty');
  return <Badge className={difficultyClass[difficulty]}>{t(difficulty)}</Badge>;
}

const verdictClass: Record<Verdict, string> = {
  AC: 'bg-chalk-100 text-chalk-700',
  WA: 'bg-mark-100 text-mark-700',
  TLE: 'bg-amber-100 text-amber-800',
  MLE: 'bg-amber-100 text-amber-800',
  RE: 'bg-purple-100 text-purple-700',
  CE: 'bg-slate-200 text-slate-700',
  IE: 'bg-slate-200 text-slate-700',
};

export function VerdictBadge({
  verdict,
  status,
  short,
}: {
  verdict: Verdict | null;
  status?: SubmissionStatus;
  short?: boolean;
}) {
  const t = useTranslations();
  if (status && status !== 'DONE') {
    return (
      <Badge className="bg-ink-50 text-ink-700">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {status === 'PENDING' ? t('common.status.pending') : t('common.status.judging')}
      </Badge>
    );
  }
  if (!verdict) return <Badge>—</Badge>;
  return (
    <Badge className={verdictClass[verdict]}>
      {short ? verdict : t(`enums.verdict.${verdict}`)}
    </Badge>
  );
}

const setTypeClass: Record<ProblemSetType, string> = {
  EXAM: 'bg-mark-50 text-mark-700 ring-1 ring-mark-200',
  TEST: 'bg-ink-50 text-ink-700 ring-1 ring-ink-200',
  HOMEWORK: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  PRACTICE: 'bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200',
};

export function ProblemSetTypeBadge({ type }: { type: ProblemSetType }) {
  const t = useTranslations('enums.problemSetType');
  return <Badge className={setTypeClass[type]}>{t(type)}</Badge>;
}

// ---------- Pagination ----------
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const t = useTranslations('common.pagination');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let i = Math.max(1, end - 4); i <= end; i++) nums.push(i);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">
        {t('summary', { page, pages, total })}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('previous')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'h-8 min-w-8 rounded-md px-2 text-sm',
              n === page ? 'bg-ink-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {n}
          </button>
        ))}
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Modal / confirm ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const tc = useTranslations('common');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col rounded-panel bg-white shadow-xl shadow-slate-900/10',
          wide ? 'max-w-3xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label={tc('close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = true,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('common');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('delete')}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 border-b border-slate-200', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value
              ? 'border-ink-600 text-ink-700'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
