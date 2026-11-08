'use client';

import type { ThreadReplyDto } from '@oj/contracts';
import { Pin, PinOff, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Container } from '@/components/app-shell';
import { MarkdownField } from '@/components/form-fields';
import { Markdown } from '@/components/markdown';
import { AuthorName, ThreadKindBadge } from '@/components/threads';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, ErrorState, InlineAlert, LoadingState, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sessionHref, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDateTime } from '@/lib/utils';

type Deleting = { kind: 'thread' } | { kind: 'reply'; reply: ThreadReplyDto } | null;

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { isStaff } = useAuth();
  const { data: t, error, loading, reload, setData } = useAsync(() => api.getThread(id), [id]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !t) return <LoadingState />;
  if (error || !t)
    return (
      <Container>
        <ErrorState message={error ?? 'Không tìm thấy bài đăng'} onRetry={reload} />
      </Container>
    );

  const back = { href: isStaff ? `/classes/${t.classId}` : `/my-class/${t.classId}`, label: 'Về lớp' };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return setReplyError('Viết nội dung trả lời trước khi gửi.');
    setSending(true);
    setReplyError(null);
    try {
      const r = await api.replyThread(t.id, { body: reply });
      setData({ ...t, replies: [...t.replies, r], replyCount: t.replyCount + 1, lastActivityAt: r.createdAt });
      setReply('');
      toast.success('Đã gửi trả lời');
    } catch (err) {
      setReplyError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const togglePin = async () => {
    setBusy(true);
    try {
      const n = await api.pinThread(t.id, !t.pinned);
      setData({ ...t, ...n, replies: n.replies ?? t.replies });
      toast.success(n.pinned ? 'Đã ghim lên đầu bảng tin' : 'Đã bỏ ghim');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      if (deleting.kind === 'thread') {
        await api.deleteThread(t.id);
        toast.success('Đã xóa bài đăng');
        router.replace(back.href);
        return;
      }
      await api.deleteReply(t.id, deleting.reply.id);
      setData({ ...t, replies: t.replies.filter((r) => r.id !== deleting.reply.id), replyCount: Math.max(0, t.replyCount - 1) });
      toast.success('Đã xóa trả lời');
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container>
      <PageHeader
        back={back}
        title={t.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {t.pinned && (
              <span className="inline-flex items-center gap-1 text-ink-700">
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                Đã ghim
              </span>
            )}
            <ThreadKindBadge kind={t.kind} />
            <AuthorName name={t.authorName} role={t.authorRole} />
            <span>{formatDateTime(t.createdAt)}</span>
            {t.sessionId && t.sessionTitle && (
              <Link href={t.problemKey ? solveHref(t.sessionId, t.problemKey) : sessionHref(t.sessionId)} className="hover:text-ink-700">
                Về {t.problemKey ? `bài ${t.problemKey}, ` : ''}
                {t.sessionTitle}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            {t.canPin && (
              <Button variant="secondary" onClick={togglePin} loading={busy && !deleting}>
                {t.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                <span key={t.pinned ? 'pinned' : 'unpinned'}>{t.pinned ? 'Bỏ ghim' : 'Ghim'}</span>
              </Button>
            )}
            {t.canDelete && (
              <Button variant="ghost" className="text-mark-600 hover:bg-mark-50" onClick={() => setDeleting({ kind: 'thread' })}>
                <Trash2 className="h-4 w-4" />
                Xóa
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-6 px-6 py-5">
        <Markdown className="max-w-[72ch]">{t.body}</Markdown>
      </Card>

      <h2 className="mb-3 font-semibold">{t.replies.length ? `${t.replies.length} trả lời` : 'Chưa có trả lời'}</h2>
      <ol className="mb-6 space-y-3">
        {t.replies.map((r) => {
          const staff = r.authorRole === 'TEACHER' || r.authorRole === 'ADMIN';
          return (
            <li
              key={r.id}
              className={cn('rounded-panel border px-5 py-4', staff ? 'border-ink-200 bg-ink-50/60' : 'border-rule bg-white')}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 text-sm">
                <AuthorName name={r.authorName} role={r.authorRole} />
                <span className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</span>
                {r.canDelete && (
                  <button
                    type="button"
                    className="ml-auto text-xs text-slate-500 hover:text-mark-600"
                    onClick={() => setDeleting({ kind: 'reply', reply: r })}
                  >
                    Xóa
                  </button>
                )}
              </div>
              <Markdown className="max-w-[72ch]">{r.body}</Markdown>
            </li>
          );
        })}
      </ol>

      {t.canReply ? (
        <Card className="p-5">
          <form onSubmit={send} className="space-y-3">
            <MarkdownField label="Trả lời" value={reply} onChange={setReply} rows={4} />
            {replyError && <InlineAlert>{replyError}</InlineAlert>}
            <div className="flex justify-end">
              <Button type="submit" loading={sending}>
                <Send className="h-4 w-4" />
                Gửi trả lời
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">Bảng tin chỉ còn để đọc: lớp đã lưu trữ hoặc bạn không còn trong lớp.</p>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={deleting?.kind === 'thread' ? 'Xóa bài đăng này?' : 'Xóa trả lời này?'}
        message={deleting?.kind === 'thread' ? 'Bài đăng và mọi trả lời sẽ bị xóa.' : 'Trả lời sẽ bị xóa khỏi bài đăng.'}
        loading={busy}
        onConfirm={doDelete}
        onClose={() => setDeleting(null)}
      />
    </Container>
  );
}
