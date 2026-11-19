'use client';

import type { SessionDto } from '@oj/contracts';
import { ChevronDown, RefreshCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './toast';
import { buttonClass, ConfirmDialog } from './ui';
import { cn } from '@/lib/utils';

type Pending = { kind: 'rejudge'; key: string | null } | { kind: 'refresh' } | null;

/**
 * Manager tools in one "Chấm lại ▾" menu next to "Sửa" (OJ-34): rejudge everything, one problem, or refresh the problems
 * from the bank and rejudge. It replaces a card with four controls, one of them cut off. Each action still asks first.
 * "Đồng bộ với đề gốc" stays separate: it brings in the set's added or removed problems and new points, while "refresh"
 * only re-reads the content of the problems already in the session.
 */
export function RejudgeMenu({
  session,
  onSession,
  onNote,
}: {
  session: SessionDto;
  onSession: (s: SessionDto) => void;
  /** What was queued, for the page to show under its header ("… đang được chấm lại"). */
  onNote: (note: string) => void;
}) {
  const t = useTranslations('assign.rejudge');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Where the panel goes, from the button's place on screen: phones get the full width under the button; wider screens
  // align it to the side with room. The header's buttons wrap, so a fixed side ran off the screen.
  const [place, setPlace] = useState<CSSProperties>({});
  const toggle = () => {
    if (!open && button.current) {
      const rect = button.current.getBoundingClientRect();
      const width = window.innerWidth;
      setPlace(
        width < 640
          ? { position: 'fixed', left: 16, right: 16, top: rect.bottom + 4 }
          : rect.left + 352 <= width - 16
            ? { left: 0 }
            : { right: 0 },
      );
    }
    setOpen((v) => !v);
  };
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const problems = [...session.problems].sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    // On phones the panel is fixed under the button: close it rather than leave it hanging while the page scrolls.
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  const choose = (next: Pending) => {
    setOpen(false);
    setPending(next);
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'refresh') {
        const s = await api.refreshSession(session.id);
        onSession(s);
        const r = await api.rejudgeSession(session.id, {});
        toast.success(t('refreshedToast', { count: r.queued }));
        onNote(`${t('refreshedNote', { count: r.queued })} ${t('noteTail')}`);
      } else {
        const r = await api.rejudgeSession(session.id, pending.key ? { problemKey: pending.key } : {});
        toast.success(t('queuedToast', { count: r.queued }));
        onNote(`${t('queuedNote', { count: r.queued })} ${t('noteTail')}`);
      }
      setPending(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const target = pending?.kind === 'rejudge' && pending.key ? problems.find((p) => p.key === pending.key) : null;
  const item = 'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 focus-visible:bg-ink-50';

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={buttonClass('secondary', 'md')}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="rejudge-menu"
        title={t('intro')}
      >
        <RotateCw className="h-4 w-4 shrink-0" />
        {t('title')}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          id="rejudge-menu"
          style={place}
          className="absolute z-30 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-panel border border-rule bg-surface shadow-lg max-sm:w-auto"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">{t('intro')}</p>
          <button type="button" className={item} onClick={() => choose({ kind: 'rejudge', key: null })}>
            <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            {t('all')}
          </button>
          {problems.length > 1 && (
            <div role="group" aria-label={t('pickLabel')} className="max-h-60 overflow-y-auto border-t border-slate-100">
              <p className="px-3 pt-2 pb-1 text-xs font-medium text-slate-500">{t('pickLabel')}</p>
              {problems.map((p) => (
                <button key={p.key} type="button" className={item} onClick={() => choose({ kind: 'rejudge', key: p.key })}>
                  <span className="w-6 shrink-0 font-semibold text-slate-500 tabular-nums">{p.key}</span>
                  <span className="min-w-0">{p.title}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className={cn(item, 'border-t border-slate-100')} onClick={() => choose({ kind: 'refresh' })}>
            <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            {t('refresh')}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        danger={false}
        loading={busy}
        title={
          pending?.kind === 'refresh'
            ? t('refreshTitle')
            : target
              ? t('oneTitle', { key: target.key })
              : t('allTitle')
        }
        confirmLabel={pending?.kind === 'refresh' ? t('refreshConfirm') : t('confirm')}
        message={
          pending?.kind === 'refresh' ? (
            <>
              {t('refreshBody')}
              {session.sourceSetId && ` ${t('refreshSyncHint')}`}
            </>
          ) : target ? (
            t('oneBody', { key: target.key, title: target.title })
          ) : (
            t('allBody')
          )
        }
        onConfirm={run}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
