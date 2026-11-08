'use client';

import { BarChart3, CheckCircle2, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Container } from '@/components/app-shell';
import { ExamTimer, SettingsInfo, StartScreen, useServerOffset } from '@/components/exam';
import { Markdown } from '@/components/markdown';
import { RejudgeTools } from '@/components/rejudge';
import { SessionIntegrity } from '@/components/integrity';
import { SessionSyncButton } from '@/components/session-sync';
import { AudienceLabel, EditSessionDialog, ProgressCells, SessionStateBadge, SessionWindow } from '@/components/sessions';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  ConfirmDialog,
  DifficultyBadge,
  ErrorState,
  InlineAlert,
  LinkButton,
  LoadingState,
  PageHeader,
  ProblemSetTypeBadge,
} from '@/components/ui';
import { useNow } from '@/components/verification';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { integritySummary, isExamLike, timerTarget } from '@/lib/exam';
import { cannotSubmitReason, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, earnedPoints, formatPoints } from '@/lib/utils';

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { isStaff } = useAuth();
  const now = useNow(30_000);
  const { data: s, error, loading, reload, setData } = useAsync(() => api.getSession(id), [id]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const offset = useServerOffset(s?.serverNow);

  if (loading && !s) return <LoadingState />;
  if (error || !s)
    return (
      <Container>
        <ErrorState message={error ?? 'Không tìm thấy phiên'} onRetry={reload} />
      </Container>
    );

  const problems = [...s.problems].sort((a, b) => a.order - b.order);
  const target = timerTarget(s, Date.now() + offset);
  const hidden = !!s.myProgress?.resultsHidden;
  const counts = s.myProgress?.submissionCounts ?? {};
  const limit = s.settings?.maxSubmissionsPerProblem ?? null;
  const solved = new Set(s.myProgress?.solvedKeys ?? []);
  const best = s.myProgress?.bestScores ?? {};
  const back =
    s.audience === 'PUBLIC'
      ? { href: '/practice', label: 'Luyện tập' }
      : isStaff && s.classId
        ? { href: `/classes/${s.classId}`, label: `Lớp ${s.className ?? ''}` }
        : s.classId
          ? { href: `/my-class/${s.classId}`, label: `Lớp ${s.className ?? ''}` }
          : { href: '/my-class', label: 'Lớp của tôi' };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteSession(s.id);
      toast.success('Đã xóa phiên');
      router.replace(back.href);
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <Container>
      <PageHeader
        back={back}
        title={s.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ProblemSetTypeBadge type={s.type} />
            <SessionStateBadge state={s.state} />
            <AudienceLabel s={s} />
            <SessionWindow s={s} now={now} />
            <span>Giao bởi {s.createdByName}</span>
          </span>
        }
        actions={
          s.canManage && (
            <>
              <LinkButton href={`/sessions/${s.id}/results`}>
                <BarChart3 className="h-4 w-4" />
                Kết quả
              </LinkButton>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                Sửa
              </Button>
              <Button variant="ghost" className="text-mark-600 hover:bg-mark-50" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Xóa
              </Button>
            </>
          )
        }
      />

      {(target || (s.settings && (isExamLike(s.settings) || (s.canManage && integritySummary(s.settings).length > 0)))) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {target && (
            <ExamTimer
              id={s.id}
              endsAt={target.endsAt}
              offset={offset}
              kind={target.kind}
              onTimeUp={() => setData((prev) => (prev ? { ...prev, canSubmit: false } : prev!))}
            />
          )}
          {s.settings && <SettingsInfo settings={s.settings} manager={s.canManage} />}
        </div>
      )}

      {s.needsStart && !s.canManage ? (
        <StartScreen session={s} onStarted={(n) => setData(n)} />
      ) : (
      <>
      {!s.canSubmit && !s.canManage && (
        <div className="mb-4">
          <InlineAlert kind={s.state === 'UPCOMING' ? 'warning' : 'info'}>{cannotSubmitReason(s)}</InlineAlert>
        </div>
      )}

      {s.description?.trim() && (
        <Card className="mb-5 px-5 py-4">
          <Markdown className="max-w-[72ch]">{s.description}</Markdown>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Các bài</h2>
          <div className="flex flex-wrap items-center gap-3">
            {s.canManage && s.sourceSetId && <SessionSyncButton session={s} onSession={(n) => setData(n)} />}
            {hidden ? (
              <span className="text-sm text-slate-600">Kết quả hiện sau khi phiên đóng</span>
            ) : (
            <>
            <ProgressCells total={problems.length} solved={solved.size} size="md" />
            {s.myProgress?.completed ? (
              <span className="inline-flex items-center gap-1 font-semibold text-chalk-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Hoàn thành
              </span>
            ) : (
              <span className="text-sm text-slate-600 tabular-nums">
                Đã giải {solved.size}/{problems.length}, {formatPoints(s.myProgress?.earnedPoints ?? 0)}/{s.totalPoints} điểm
              </span>
            )}
            </>
            )}
          </div>
        </div>
        <ol className="divide-y divide-slate-100">
          {problems.map((p, idx) => {
            const isSolved = !hidden && solved.has(p.key);
            const b = hidden ? undefined : best[p.key];
            const n = counts[p.key] ?? 0;
            return (
              <li key={p.key}>
                <Link href={solveHref(s.id, p.key)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50">
                  <span className="w-12 text-sm font-semibold text-slate-500 tabular-nums">Bài {idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{p.title}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{p.code}</span>
                      <DifficultyBadge difficulty={p.difficulty} />
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-sm tabular-nums',
                      isSolved ? 'font-semibold text-chalk-700' : b !== undefined ? 'font-medium text-mark-700' : 'text-slate-400',
                    )}
                  >
                    {hidden
                      ? n > 0
                        ? `Đã nộp ${n} lần`
                        : 'Chưa làm'
                      : isSolved
                        ? 'Đã giải ✓'
                        : b !== undefined
                          ? // In this problem's points, as on the teacher's results board (b is a percentage).
                            `Cao nhất ${formatPoints(earnedPoints(b, p.points))}/${formatPoints(p.points)} điểm`
                          : 'Chưa làm'}
                  </span>
                  {limit && !s.canManage && s.state === 'OPEN' && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      Còn {Math.max(0, limit - n)}/{limit} lần nộp
                    </span>
                  )}
                  <span className="w-16 text-right text-sm text-slate-600 tabular-nums">{p.points} điểm</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>
      </>
      )}

      {s.canManage && (
        <div className="mt-6">
          <RejudgeTools session={s} onSession={(n) => setData(n)} />
        </div>
      )}
      {s.canManage && (
        <SessionIntegrity sessionId={s.id} enabled={!!(s.settings?.checkPlagiarism || s.settings?.checkAiUsage)} />
      )}

      {s.canManage && (
        <>
          <EditSessionDialog open={editing} onClose={() => setEditing(false)} session={s} onSaved={(n) => setData(n)} />
          <ConfirmDialog
            open={confirmDelete}
            title="Xóa phiên này?"
            message={
              <>
                Phiên <b>{s.title}</b> cùng mọi bài nộp và kết quả của phiên sẽ bị xóa. Đề gốc trong ngân hàng không bị ảnh
                hưởng.
              </>
            }
            loading={deleting}
            onConfirm={remove}
            onClose={() => setConfirmDelete(false)}
          />
        </>
      )}
    </Container>
  );
}
