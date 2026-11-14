'use client';

import type { Role, SessionDto, ThreadKind, ThreadSummaryDto } from '@oj/contracts';
import { HelpCircle, Megaphone, MessageSquare, Pin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn, formatDateTime } from '@/lib/utils';
import { MarkdownField } from './form-fields';
import { useToast } from './toast';
import { Badge, Button, Card, EmptyState, ErrorState, Field, InlineAlert, inputClass, ListSkeleton, Modal } from './ui';

export function ThreadKindBadge({ kind }: { kind: ThreadKind }) {
  const t = useTranslations('classes.threads.kind');
  return kind === 'ANNOUNCEMENT' ? (
    <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">
      <Megaphone className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
      {t('ANNOUNCEMENT')}
    </Badge>
  ) : (
    <Badge className="bg-sky-50 text-sky-800 ring-1 ring-sky-200">
      <HelpCircle className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
      {t('QUESTION')}
    </Badge>
  );
}

export function AuthorName({ name, role }: { name: string; role: Role }) {
  const t = useTranslations('classes.threads');
  const staff = role === 'TEACHER' || role === 'ADMIN';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('font-medium', staff ? 'text-ink-700' : 'text-slate-800')}>{name}</span>
      {staff && <Badge className="bg-ink-solid text-white">{t('teacherBadge')}</Badge>}
    </span>
  );
}

/** Pinned first, then latest activity (the backend already sorts; this keeps local inserts in order). */
function sortThreads(list: ThreadSummaryDto[]) {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function ThreadList({ threads, compact }: { threads: ThreadSummaryDto[]; compact?: boolean }) {
  const tt = useTranslations('classes.threads');
  return (
    <ul className="divide-y divide-slate-100">
      {sortThreads(threads).map((t) => (
        <li key={t.id}>
          <Link href={`/threads/${t.id}`} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 hover:bg-slate-50', compact ? 'py-2.5' : 'py-3.5')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {t.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-ink-600" aria-label={tt('pinned')} />}
                <ThreadKindBadge kind={t.kind} />
                <span className="min-w-0 font-medium break-words text-slate-900">{t.title}</span>
                {t.awaitingAnswer && <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-200">{tt('awaitingAnswer')}</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-4 text-xs text-slate-500">
                <AuthorName name={t.authorName} role={t.authorRole} />
                {t.sessionTitle && (
                  <span>
                    {t.problemKey
                      ? tt('aboutProblem', { problem: t.problemKey, session: t.sessionTitle })
                      : tt('aboutSession', { session: t.sessionTitle })}
                  </span>
                )}
                <span>{tt('activity', { date: formatDateTime(t.lastActivityAt) })}</span>
              </div>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-500 tabular-nums"
              title={tt('replyCount', { count: t.replyCount })}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {t.replyCount}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NewThreadDialog({
  open,
  onClose,
  classId,
  isManager,
  preset,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  isManager: boolean;
  preset?: { sessionId: string; problemKey: string | null };
  onCreated?: (t: ThreadSummaryDto) => void;
}) {
  const t = useTranslations('classes.threads.form');
  const tk = useTranslations('classes.threads.kind');
  const tc = useTranslations('common');
  const toast = useToast();
  const router = useRouter();
  const sessions = useAsync<SessionDto[]>(() => api.listSessions({ classId }), [classId], open);
  const [kind, setKind] = useState<ThreadKind>('QUESTION');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [problemKey, setProblemKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(preset ? 'QUESTION' : isManager ? 'ANNOUNCEMENT' : 'QUESTION');
    setTitle('');
    setBody('');
    setSessionId(preset?.sessionId ?? '');
    setProblemKey(preset?.problemKey ?? '');
    setError(null);
  }, [open, preset, isManager]);

  const session = (sessions.data ?? []).find((s) => s.id === sessionId);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t('titleRequired'));
    if (!body.trim()) return setError(kind === 'QUESTION' ? t('questionRequired') : t('announcementRequired'));
    setSaving(true);
    try {
      const created = await api.createThread(classId, {
        kind,
        title: title.trim(),
        body,
        sessionId: sessionId || null,
        problemKey: sessionId && problemKey ? problemKey : null,
      });
      toast.success(kind === 'QUESTION' ? t('questionSent') : t('announcementPosted'));
      onCreated?.(created);
      onClose();
      // From a problem (preset) the student stays on it: mid-exam, a page change costs time on the clock (UAT M7).
      // The new question shows in that problem's list, which links to the thread.
      if (!preset) router.push(`/threads/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={kind === 'QUESTION' ? t('askTitle') : t('announceTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {kind === 'QUESTION' ? t('sendQuestion') : t('postAnnouncement')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {isManager && !preset && (
          <div className="inline-flex rounded-control bg-slate-100 p-1 text-sm" role="radiogroup" aria-label={t('kindLabel')}>
            {(['ANNOUNCEMENT', 'QUESTION'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn('rounded-[4px] px-3 py-1 whitespace-nowrap', kind === k ? 'bg-surface font-medium ring-1 ring-slate-300' : 'text-slate-600')}
              >
                {tk(k)}
              </button>
            ))}
          </div>
        )}
        <Field label={t('titleLabel')}>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'QUESTION' ? t('questionPlaceholder') : t('announcementPlaceholder')}
            autoFocus
          />
        </Field>
        <MarkdownField
          label={kind === 'QUESTION' ? t('questionLabel') : t('bodyLabel')}
          value={body}
          onChange={setBody}
          rows={6}
          placeholder={kind === 'QUESTION' ? t('questionBodyPlaceholder') : undefined}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('sessionLabel')}>
            <select
              className={inputClass}
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setProblemKey('');
              }}
            >
              <option value="">{t('noSession')}</option>
              {(sessions.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('problemLabel')}>
            <select className={inputClass} value={problemKey} onChange={(e) => setProblemKey(e.target.value)} disabled={!session}>
              <option value="">{t('wholeSession')}</option>
              {[...(session?.problems ?? [])]
                .sort((a, b) => a.order - b.order)
                .map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key}. {p.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** "Bảng tin lớp": announcements and Q&A of one class. */
export function ClassBoard({
  classId,
  archived,
  isManager,
  canPost = true,
}: {
  classId: string;
  archived: boolean;
  isManager: boolean;
  /** false for classes the student has left. */
  canPost?: boolean;
}) {
  const t = useTranslations('classes.threads.board');
  const { data, error, loading, reload, setData } = useAsync(() => api.listThreads(classId), [classId]);
  const [creating, setCreating] = useState(false);
  const writable = !archived && canPost;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{t('title')}</h2>
        {writable && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 shrink-0" />
            {isManager ? t('post') : t('ask')}
          </Button>
        )}
      </div>
      {archived && <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{t('archivedNote')}</p>}
      {loading && !data ? (
        <ListSkeleton />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('emptyTitle')}>
          {writable ? (isManager ? t('emptyManager') : t('emptyStudent')) : undefined}
        </EmptyState>
      ) : (
        <ThreadList threads={data} />
      )}
      {writable && (
        <NewThreadDialog
          open={creating}
          onClose={() => setCreating(false)}
          classId={classId}
          isManager={isManager}
          onCreated={(t) => setData((prev) => [t, ...(prev ?? [])])}
        />
      )}
    </Card>
  );
}

/** Solve page: questions about this problem, plus "Hỏi về bài này". */
export function ProblemQuestions({
  classId,
  sessionId,
  problemKey,
  canAsk,
  isManager,
}: {
  classId: string;
  sessionId: string;
  problemKey: string;
  canAsk: boolean;
  isManager: boolean;
}) {
  const t = useTranslations('classes.threads.problem');
  const tc = useTranslations('common');
  const { data, loading, setData } = useAsync(() => api.listThreads(classId, { sessionId, problemKey }), [classId, sessionId, problemKey]);
  const [asking, setAsking] = useState(false);
  const [preset] = useState(() => ({ sessionId, problemKey }));
  return (
    <section className="mt-8 border-t border-rule pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        {canAsk && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="-my-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-sm font-medium text-ink-600 hover:underline"
          >
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('ask')}
          </button>
        )}
      </div>
      {loading && !data ? (
        <p className="text-sm text-slate-500">{tc('loading')}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <div className="-mx-5">
          <ThreadList threads={data} compact />
        </div>
      )}
      {canAsk && (
        <NewThreadDialog
          open={asking}
          onClose={() => setAsking(false)}
          classId={classId}
          isManager={isManager}
          preset={preset}
          onCreated={(created) => setData((prev) => [created, ...(prev ?? [])])}
        />
      )}
    </section>
  );
}
