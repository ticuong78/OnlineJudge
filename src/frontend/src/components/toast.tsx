'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

/** How long a toast stays: errors longer, as they usually ask the user to do something. */
const STAY_MS = { success: 3500, info: 3500, error: 6000 } as const;
/** Matches --duration-1, the exit transition in globals.css. */
const EXIT_MS = 120;

export function ToastProvider({ children }: { children: ReactNode }) {
  const tc = useTranslations('common');
  const [items, setItems] = useState<(ToastItem & { leaving?: boolean })[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  /** Plays the exit (OJ-17), then removes it. */
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), EXIT_MS);
  }, []);

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => dismiss(id), STAY_MS[kind]));
    },
    [dismiss],
  );

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-4), { id, kind, message }]);
      schedule(id, kind);
    },
    [schedule],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  const apiValue = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      {/* Announced (OJ-17): polite for notices; errors are role="alert" below. On phones the stack sits at the top,
          clear of the sticky Submit and save bars; from sm it is bottom-right. */}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-full sm:max-w-sm sm:items-stretch"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            data-state={t.leaving ? 'closing' : 'open'}
            // Paused while the pointer is on it, so a long message can be read.
            onMouseEnter={() => clearTimeout(timers.current.get(t.id))}
            onMouseLeave={() => !t.leaving && schedule(t.id, t.kind)}
            className={cn(
              'motion-toast pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-panel border bg-surface px-3 py-2.5 text-sm shadow-lg shadow-slate-900/10',
              t.kind === 'success' && 'border-chalk-200',
              t.kind === 'error' && 'border-mark-200',
              t.kind === 'info' && 'border-ink-200',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chalk-600" aria-hidden="true" />}
            {t.kind === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-mark-600" aria-hidden="true" />}
            {t.kind === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" aria-hidden="true" />}
            <span className="min-w-0 flex-1 break-words text-slate-700">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label={tc('close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
