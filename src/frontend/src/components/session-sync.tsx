'use client';

import type { SessionDto, SessionSyncPreviewDto } from '@oj/contracts';
import { ArrowDownUp, GitCompare, Minus, PenLine, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './toast';
import { Button, ErrorState, InlineAlert, LoadingState, Modal } from './ui';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 flex items-start gap-1.5 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </h3>
      <ul className="space-y-0.5 pl-6 text-sm text-slate-700">{children}</ul>
    </div>
  );
}

function Changes({ p }: { p: SessionSyncPreviewDto }) {
  const affected = p.removed.reduce((n, r) => n + r.studentsWithSubmissions, 0);
  const t = useTranslations('student.sessionSync');
  return (
    <div className="space-y-4">
      {p.added.length > 0 && (
        <Section icon={<Plus className="mt-0.5 h-4 w-4 shrink-0 text-chalk-700" />} title={t('added', { count: p.added.length })}>
          {p.added.map((a) => (
            <li key={a.code}>
              {a.code} · {a.title} <span className="text-slate-500">{t('points', { points: a.points })}</span>
            </li>
          ))}
        </Section>
      )}
      {p.removed.length > 0 && (
        <Section icon={<Minus className="mt-0.5 h-4 w-4 shrink-0 text-mark-600" />} title={t('removed', { count: p.removed.length })}>
          {p.removed.map((r) => (
            <li key={r.key}>
              {t('problem', { key: r.key, title: r.title })}
              {r.studentsWithSubmissions > 0 && (
                <span className="text-mark-700"> {t('removedSubmitted', { count: r.studentsWithSubmissions })}</span>
              )}
            </li>
          ))}
        </Section>
      )}
      {p.pointsChanged.length > 0 && (
        <Section icon={<PenLine className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" />} title={t('pointsChanged')}>
          {p.pointsChanged.map((c) => (
            <li key={c.key}>
              {t('pointsChange', { key: c.key, title: c.title, from: c.from, to: c.to })}
            </li>
          ))}
        </Section>
      )}
      {p.contentChanged.length > 0 && (
        <Section icon={<GitCompare className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" />} title={t('contentChanged')}>
          {p.contentChanged.map((c) => (
            <li key={c.key}>{t('problem', { key: c.key, title: c.title })}</li>
          ))}
        </Section>
      )}
      {p.reordered && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-slate-800">
          <ArrowDownUp className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" />
          <span>
            {t('reordered')} <span className="font-normal text-slate-500">{t('reorderedHint')}</span>
          </span>
        </p>
      )}
      {affected > 0 && (
        <InlineAlert kind="warning">
          {t('removedNote')}
        </InlineAlert>
      )}
    </div>
  );
}

/** "Đồng bộ với đề gốc": preview what changed in the source set since it was given, then apply and rejudge. */
export function SessionSyncButton({ session, onSession }: { session: SessionDto; onSession: (s: SessionDto) => void }) {
  const toast = useToast();
  const t = useTranslations('student.sessionSync');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SessionSyncPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.previewSessionSync(session.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const show = () => {
    setOpen(true);
    setPreview(null);
    void load();
  };

  const apply = async () => {
    setApplying(true);
    try {
      const { session: updated, changes } = await api.syncSession(session.id);
      onSession(updated);
      let queued = 0;
      for (const c of changes.contentChanged) queued += (await api.rejudgeSession(session.id, { problemKey: c.key })).queued;
      toast.success(queued ? t('toastQueued', { count: queued }) : t('toastDone'));
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={show}>
        <GitCompare className="h-4 w-4 shrink-0" />
        {t('button')}
      </Button>
      <Modal
        open={open}
        onClose={() => !applying && setOpen(false)}
        title={preview ? t('titleWithSet', { title: preview.setTitle }) : t('button')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={applying}>
              {preview && !preview.hasChanges ? tc('close') : tc('cancel')}
            </Button>
            {preview?.hasChanges && (
              <Button onClick={apply} loading={applying}>
                {t('apply')}
              </Button>
            )}
          </>
        }
      >
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : preview && !preview.hasChanges ? (
          <p className="text-sm text-slate-600">{t('noChanges')}</p>
        ) : preview ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{t('intro')}</p>
            <Changes p={preview} />
            {session.state === 'OPEN' && (
              <InlineAlert kind="info">{t('openNote')}</InlineAlert>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
