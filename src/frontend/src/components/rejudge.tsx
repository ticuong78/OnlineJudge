'use client';

import type { SessionDto } from '@oj/contracts';
import { RefreshCcw, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './toast';
import { Button, Card, ConfirmDialog, inputClass } from './ui';
import { cn } from '@/lib/utils';

type Pending = { kind: 'rejudge'; key: string | null } | { kind: 'refresh' } | null;

/** Manager tools: rejudge (all or one problem) and refresh problems from the bank, then rejudge. */
export function RejudgeTools({ session, onSession }: { session: SessionDto; onSession: (s: SessionDto) => void }) {
  const t = useTranslations('assign.rejudge');
  const toast = useToast();
  const [key, setKey] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const problems = [...session.problems].sort((a, b) => a.order - b.order);

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'refresh') {
        const s = await api.refreshSession(session.id);
        onSession(s);
        const r = await api.rejudgeSession(session.id, {});
        toast.success(t('refreshedToast', { count: r.queued }));
        setNote(t('refreshedNote', { count: r.queued }));
      } else {
        const r = await api.rejudgeSession(session.id, pending.key ? { problemKey: pending.key } : {});
        toast.success(t('queuedToast', { count: r.queued }));
        setNote(t('queuedNote', { count: r.queued }));
      }
      setPending(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const target = pending?.kind === 'rejudge' && pending.key ? problems.find((p) => p.key === pending.key) : null;

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('intro')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPending({ kind: 'rejudge', key: null })}>
          <RotateCw className="h-4 w-4 shrink-0" />
          {t('all')}
        </Button>
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
          <select
            className={cn(inputClass, 'w-auto max-w-[16rem] min-w-0 py-1 text-sm')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-label={t('pickLabel')}
          >
            <option value="">{t('pick')}</option>
            {problems.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key}. {p.title}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" disabled={!key} onClick={() => setPending({ kind: 'rejudge', key })}>
            {t('one', { key: key || '…' })}
          </Button>
        </span>
        <Button
          variant="secondary"
          size="sm"
          // The longest label here: let it wrap on a phone instead of overflowing the card.
          className="whitespace-normal text-left"
          onClick={() => setPending({ kind: 'refresh' })}
        >
          <RefreshCcw className="h-4 w-4 shrink-0" />
          {t('refresh')}
        </Button>
      </div>
      {note && (
        <p className="mt-3 text-sm text-slate-600">
          {note} {t('noteTail')}
        </p>
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
    </Card>
  );
}
