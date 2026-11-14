'use client';

import {
  type Difficulty,
  type ProblemSetType,
  type SubmissionStatus,
  type Verdict,
} from '@oj/contracts';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { focusables, trackOpener, trapTarget, type OpenerState } from '@/lib/focus';
import { usePageTitle } from '@/lib/page-title';
import { usePresence } from '@/lib/presence';
import { cn } from '@/lib/utils';

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md';

const variantClass: Record<Variant, string> = {
  primary: 'bg-ink-solid text-white hover:bg-ink-solid-hover',
  secondary: 'bg-surface text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  danger: 'bg-mark-solid text-white hover:bg-mark-solid-hover',
  success: 'bg-chalk-solid text-white hover:bg-chalk-solid-hover',
  ghost: 'text-slate-600 hover:bg-slate-100',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    // A small press (OJ-17): the button answers the finger or click before the result does.
    'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-[var(--duration-1)] active:translate-y-px',
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
  'w-full rounded-control border border-slate-300 bg-surface px-3 py-2 text-sm placeholder:text-slate-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-500/20 focus-visible:outline-none disabled:bg-slate-100';
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
    <div className={cn('rounded-panel border border-rule bg-surface', className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  docTitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Tab title when `title` is not plain text (M9). */
  docTitle?: string;
}) {
  usePageTitle(docTitle ?? (typeof title === 'string' ? title : null));
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-1 -ml-1 inline-flex min-h-7 items-center gap-1 rounded px-1 py-1 text-sm text-slate-500 hover:text-ink-600"
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
  // Errors and warnings interrupt a screen reader (a wrong password, a refused save); notices wait their turn (M6).
  const role = kind === 'error' || kind === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={cn('rounded-lg border px-3 py-2 text-sm', cls)}>
      {children}
    </div>
  );
}

// ---------- Skeletons (OJ-16) ----------
// The shape of what is coming, instead of a spinner that is then replaced: the page does not jump, and the user can
// already see where things will be. The pulse stops under prefers-reduced-motion (global rule in globals.css).

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-control bg-slate-200/70', className)} />;
}

/** Wraps skeletons: announced once as loading, hidden from the accessibility tree otherwise. */
function SkeletonFrame({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  const t = useTranslations('common');
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label ?? t('loading')}</span>
      {children}
    </div>
  );
}

/** Rows of a list: a title line and a meta line each, like SessionList and ThreadList. */
export function ListSkeleton({ rows = 3, label, className }: { rows?: number; label?: string; className?: string }) {
  return (
    <SkeletonFrame label={label} className={cn('divide-y divide-slate-100', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-5 py-3.5">
          <Skeleton className={cn('h-4', i % 2 ? 'w-2/5' : 'w-1/2')} />
          <Skeleton className={cn('h-3', i % 2 ? 'w-3/5' : 'w-2/3')} />
        </div>
      ))}
    </SkeletonFrame>
  );
}

/** A table body: `cols` cells per row, the first one wider. */
export function TableSkeleton({ rows = 5, cols = 4, label }: { rows?: number; cols?: number; label?: string }) {
  return (
    <SkeletonFrame label={label} className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-1/3' : 'w-16')} />
          ))}
        </div>
      ))}
    </SkeletonFrame>
  );
}

/** A page while its route or data loads: title, subtitle and one panel of rows. */
export function PageSkeleton({ label, inset }: { label?: string; /** Already inside a Container. */ inset?: boolean }) {
  return (
    <SkeletonFrame label={label} className={inset ? undefined : 'mx-auto w-full max-w-6xl px-4 py-6'}>
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 rounded-panel border border-rule bg-surface">
        <div className="space-y-2 px-5 py-3.5">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="border-t border-slate-100">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 border-b border-slate-100 px-5 py-3.5 last:border-b-0">
              <Skeleton className={cn('h-4', i % 2 ? 'w-2/5' : 'w-1/2')} />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}

/** The app frame before the account is known (first visit, no cached account): header bar plus a page skeleton. */
export function ShellSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-14 border-b border-slate-200 bg-surface/90" aria-hidden="true">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <span className="h-8 w-8 rounded-lg bg-ink-solid" />
          <Skeleton className="hidden h-4 w-72 sm:block" />
          <Skeleton className="ml-auto h-6 w-24" />
        </div>
      </div>
      <PageSkeleton label={label} />
    </div>
  );
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
            aria-current={n === page ? 'page' : undefined}
            className={cn(
              'h-8 min-w-8 rounded-md px-2 text-sm',
              n === page ? 'bg-ink-solid text-white' : 'text-slate-600 hover:bg-slate-100',
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
/** Open dialogs, innermost last: only the top one answers Escape. */
const openDialogs: symbol[] = [];

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
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Who opened the dialog, read while rendering the opening: a field with autoFocus inside takes focus during the
  // commit, before any effect runs, so an effect would see that field instead of the button that opened the dialog.
  const opener = useRef<OpenerState<HTMLElement>>({ wasOpen: false, opener: null });
  const focused = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  opener.current = trackOpener(opener.current, open, focused);

  // M5: focus moves into the dialog (a data-autofocus control, else the first control, else the panel), stays there,
  // and goes back to whatever opened it. Escape closes only the dialog on top. onClose is read through a ref so a
  // new callback each render does not re-run this effect and pull focus back to the start while the user types.
  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    openDialogs.push(token);
    const root = panel.current;
    if (root && !root.contains(document.activeElement)) {
      const auto = root.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? focusables(root).find((el) => !el.dataset.dialogClose) ?? root).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === token) close.current();
    };
    window.addEventListener('keydown', onKey);
    const returnTo = opener.current.opener;
    return () => {
      window.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open]);

  const onTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    // A dialog opened from inside this one is a DOM child: its own handler has dealt with the key.
    if ((e.target as Element).closest('[role="dialog"]') !== panel.current) return;
    const items = focusables(panel.current);
    const to = trapTarget(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (to === null) return;
    e.preventDefault();
    items[to].focus();
  };

  // Exit motion (OJ-17): stays mounted for its closing transition, showing what it showed when it was open (the parent
  // may already have cleared it, e.g. the test being edited).
  const presence = usePresence(open);
  const shown = useRef({ title, children, footer });
  if (open) shown.current = { title, children, footer };
  if (presence === 'closed') return null;
  const view = open ? { title, children, footer } : shown.current;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="motion-fade absolute inset-0 bg-scrim/40" data-state={presence} onClick={onClose} />
      <div
        ref={panel}
        data-state={presence}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onTab}
        className={cn(
          'motion-rise relative flex max-h-[90vh] w-full flex-col rounded-panel bg-surface shadow-xl shadow-slate-900/10 focus:outline-none',
          wide ? 'max-w-3xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={titleId} className="font-semibold text-slate-900">{view.title}</h2>
          <button
            type="button"
            onClick={onClose}
            data-dialog-close="true"
            className="-mr-1.5 rounded p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label={tc('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{view.children}</div>
        {view.footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{view.footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
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
          <Button variant="secondary" onClick={onClose} disabled={loading} data-autofocus>
            {cancelLabel ?? t('cancel')}
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
/**
 * Tab bar (OJ-17): real tab roles for screen readers, and an underline that slides to the selected tab instead of
 * jumping. The underline is measured from the selected button, so labels of any length work.
 */
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
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const measure = () => {
      const selected = root.querySelector<HTMLElement>('[aria-selected="true"]');
      setBar(selected ? { left: selected.offsetLeft, width: selected.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, tabs.length]);
  return (
    <div ref={list} role="tablist" className={cn('relative flex gap-1 border-b border-slate-200', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px px-3 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'text-ink-700' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
      {bar && (
        <span
          aria-hidden="true"
          className="absolute -bottom-px h-0.5 bg-ink-solid transition-[left,width] duration-[var(--duration-2)] ease-[var(--ease-standard)]"
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </div>
  );
}
