'use client';

import type { ProblemSetDto } from '@oj/contracts';
import { BookmarkPlus, FileKey2, Globe2, Lock, Pencil, Printer, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { CopiedFrom, SharingBadge } from '@/components/bank';
import { RequireRole, STAFF } from '@/components/guards';
import { Markdown } from '@/components/markdown';
import { CreateSessionDialog } from '@/components/sessions';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  ConfirmDialog,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  InlineAlert,
  LinkButton,
  LoadingState,
  PageHeader,
  ProblemSetTypeBadge,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

function ShareCard({ set, onChange }: { set: ProblemSetDto; onChange: (s: ProblemSetDto) => void }) {
  const t = useTranslations('bank');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.updateProblemSetSharing(set.id, !set.isPublic);
      onChange(s);
      toast.success(s.isPublic ? t('set.madePublic') : t('set.madePrivate'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('sharing.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {set.isPublic ? t('set.publicHint') : t('set.privateHint')}
      </p>
      {error && (
        <div className="mt-3">
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}
      <Button variant="secondary" className="mt-3" onClick={toggle} loading={busy}>
        {set.isPublic ? <Lock className="h-4 w-4 shrink-0" /> : <Globe2 className="h-4 w-4 shrink-0" />}
        <span key={set.isPublic ? 'public' : 'private'}>{set.isPublic ? t('set.makePrivate') : t('set.makePublic')}</span>
      </Button>
    </Card>
  );
}

export default function BankSetPage() {
  const t = useTranslations('bank');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: set, error, loading, reload, setData } = useAsync(() => api.getProblemSet(id), [id]);
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);

  if (loading && !set) return <LoadingState />;
  if (error || !set)
    return (
      <Container>
        <ErrorState message={error ?? t('set.notFound')} onRetry={reload} />
      </Container>
    );

  const items = [...set.items].sort((a, b) => a.order - b.order);

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteProblemSet(set.id);
      toast.success(t('set.deleted'));
      router.replace('/bank/sets');
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  const copy = async () => {
    setCopying(true);
    try {
      const c = await api.copyProblemSet(set.id);
      toast.success(t('set.copied'));
      router.push(`/bank/sets/${c.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCopying(false);
    }
  };

  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          back={{ href: '/bank/sets', label: t('title') }}
          title={set.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <ProblemSetTypeBadge type={set.type} />
              <SharingBadge isPublic={set.isPublic} />
              <span>{t('countSummary', { count: items.length, points: set.totalPoints })}</span>
              <span>{t('ownedBy', { name: set.ownerName })}</span>
              <CopiedFrom src={set.copiedFrom} />
            </span>
          }
          actions={
            set.canEdit ? (
              <>
                <Button onClick={() => setAssigning(true)} disabled={items.length === 0}>
                  <Send className="h-4 w-4 shrink-0" />
                  {t('assign')}
                </Button>
                <LinkButton href={`/bank/sets/${set.id}/print`} variant="secondary" target="_blank">
                  <Printer className="h-4 w-4 shrink-0" />
                  {t('set.print')}
                </LinkButton>
                <LinkButton href={`/bank/sets/${set.id}/answer-key`} variant="secondary" target="_blank">
                  <FileKey2 className="h-4 w-4 shrink-0" />
                  {t('set.printAnswerKey')}
                </LinkButton>
                <LinkButton href={`/bank/sets/${set.id}/edit`} variant="secondary">
                  <Pencil className="h-4 w-4 shrink-0" />
                  {tc('edit')}
                </LinkButton>
                <Button variant="ghost" className="text-mark-600 hover:bg-mark-50" onClick={() => setConfirmDelete(true)} aria-label={t('set.delete')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button onClick={copy} loading={copying}>
                <BookmarkPlus className="h-4 w-4 shrink-0" />
                {t('saveToMyBank')}
              </Button>
            )
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {set.description?.trim() && (
              <Card className="px-5 py-4">
                <Markdown className="max-w-[72ch]">{set.description}</Markdown>
              </Card>
            )}
            <Card>
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">{t('set.problems')}</h2>
              </div>
              {items.length === 0 ? (
                <EmptyState title={t('set.empty')} />
              ) : (
                <ol className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    // '?' = deleted, or not public for this viewer: there is no page to open.
                    const unavailable = it.problemCode === '?';
                    const row = (
                      <>
                        <span className="min-w-12 text-sm font-semibold whitespace-nowrap text-slate-500 tabular-nums">
                          {t('set.problemNumber', { n: idx + 1 })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={unavailable ? 'font-medium text-slate-400 italic' : 'font-medium text-slate-900'}>
                            {it.problemTitle}
                          </div>
                          {!unavailable && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="tabular-nums">{it.problemCode}</span>
                              <DifficultyBadge difficulty={it.difficulty} />
                            </div>
                          )}
                        </div>
                        <span className="text-sm whitespace-nowrap text-slate-600 tabular-nums">{t('set.points', { points: it.points })}</span>
                      </>
                    );
                    const rowClass = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3';
                    return (
                      <li key={it.problemId}>
                        {unavailable ? (
                          <div className={rowClass}>{row}</div>
                        ) : (
                          <Link href={`/bank/problems/${it.problemId}`} className={`${rowClass} hover:bg-slate-50`}>
                            {row}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>
          <div className="space-y-5">
            {set.canEdit ? (
              <ShareCard set={set} onChange={(s) => setData(s)} />
            ) : (
              <Card className="p-5 text-sm text-slate-600">
                {t('set.copyNote')}
              </Card>
            )}
          </div>
        </div>

        <CreateSessionDialog
          open={assigning}
          onClose={() => setAssigning(false)}
          source={{ kind: 'SET', setId: set.id }}
          defaultTitle={set.title}
          setType={set.type}
        />
        <ConfirmDialog
          open={confirmDelete}
          title={t('set.deleteTitle')}
          message={t.rich('set.deleteBody', { title: set.title, b: (c) => <b>{c}</b> })}
          loading={deleting}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      </Container>
    </RequireRole>
  );
}
