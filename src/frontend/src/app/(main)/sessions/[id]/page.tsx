'use client';

import { BarChart3, CheckCircle2, ChevronRight, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { ExamTimer, SettingsInfo, StartScreen, useServerOffset } from '@/components/exam';
import { Markdown } from '@/components/markdown';
import { RejudgeMenu } from '@/components/rejudge';
import { SessionIntegrity } from '@/components/integrity';
import { SessionSyncButton } from '@/components/session-sync';
import { AudienceLabel, EditSessionDialog, ProgressCells, SessionStateBadge, SessionWindow } from '@/components/sessions';
import { useToast } from '@/components/toast';
import { TopicBadges } from '@/components/topics';
import { Button, Card, ConfirmDialog, DeleteButton, DifficultyBadge, ErrorState, InlineAlert, LinkButton, PageHeader, PageSkeleton, ProblemSetTypeBadge } from '@/components/ui';
import { useNow } from '@/components/verification';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { integritySummary, isExamLike, timerTarget } from '@/lib/exam';
import { cannotSubmitReason, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatPoints } from '@/lib/utils';
import { problemStatus } from '@/lib/session-status';
import { solvedByProblem } from '@/lib/results';

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
  const [rejudgeNote, setRejudgeNote] = useState<string | null>(null);
  const offset = useServerOffset(s?.serverNow);
  // Managers: the class's progress per problem, from the results board (OJ-34).
  const results = useAsync(() => api.getSessionResults(id), [id], !!s?.canManage);
  const t = useTranslations('session');
  const tc = useTranslations('common');

  if (loading && !s) return <PageSkeleton />;
  if (error || !s)
    return (
      <Container>
        <ErrorState message={error ?? t('page.notFound')} onRetry={reload} />
      </Container>
    );

  const problems = [...s.problems].sort((a, b) => a.order - b.order);
  // No timer until the server clock is known: its first check must use server time (OJ-15 F3).
  const target = offset === null ? null : timerTarget(s, Date.now() + offset);
  const hidden = !!s.myProgress?.resultsHidden;
  const counts = s.myProgress?.submissionCounts ?? {};
  const limit = s.settings?.maxSubmissionsPerProblem ?? null;
  const solved = new Set(s.myProgress?.solvedKeys ?? []);
  const best = s.myProgress?.bestScores ?? {};
  const classSolved =
    s.canManage && results.data
      ? { solved: solvedByProblem(results.data.rows, results.data.problems), total: results.data.rows.length }
      : undefined;
  const back =
    s.audience === 'PUBLIC'
      ? { href: '/practice', label: t('page.backPractice') }
      : isStaff && s.classId
        ? { href: `/classes/${s.classId}`, label: t('className', { name: s.className ?? '' }) }
        : s.classId
          ? { href: `/my-class/${s.classId}`, label: t('className', { name: s.className ?? '' }) }
          : { href: '/my-class', label: t('page.backMyClass') };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteSession(s.id);
      toast.success(t('page.deleted'));
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
            <span>{t('page.assignedBy', { name: s.createdByName })}</span>
          </span>
        }
        actions={
          s.canManage && (
            <>
              <LinkButton href={`/sessions/${s.id}/results`}>
                <BarChart3 className="h-4 w-4 shrink-0" />
                {t('page.results')}
              </LinkButton>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 shrink-0" />
                {tc('edit')}
              </Button>
              <RejudgeMenu session={s} onSession={(n) => setData(n)} onNote={setRejudgeNote} />
              <DeleteButton onClick={() => setConfirmDelete(true)} />
            </>
          )
        }
      />

      {rejudgeNote && (
        <div className="mb-6">
          <InlineAlert kind="info">{rejudgeNote}</InlineAlert>
        </div>
      )}

      {(target || (s.settings && (isExamLike(s.settings) || (s.canManage && integritySummary(s.settings).length > 0)))) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {target && (
            <ExamTimer
              id={s.id}
              endsAt={target.endsAt}
              offset={offset ?? 0 /* target is null until the offset is known */}
              kind={target.kind}
              onTimeUp={() => setData((prev) => (prev ? { ...prev, canSubmit: false } : prev!))}
            />
          )}
          {/* The start screen lists the same rules as bullets; one list is enough (UAT L7). */}
          {s.settings && !(s.needsStart && !s.canManage) && <SettingsInfo settings={s.settings} manager={s.canManage} />}
        </div>
      )}

      {s.needsStart && !s.canManage ? (
        <StartScreen session={s} onStarted={(n) => setData(n)} />
      ) : (
      <>
      {!s.canSubmit && !s.canManage && (
        <div className="mb-6">
          <InlineAlert kind={s.state === 'UPCOMING' ? 'warning' : 'info'}>{cannotSubmitReason(s)}</InlineAlert>
        </div>
      )}

      {s.description?.trim() && (
        <Card className="mb-6 p-5">
          <Markdown className="max-w-[72ch]">{s.description}</Markdown>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">{t('page.problems')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {s.canManage && s.sourceSetId && <SessionSyncButton session={s} onSession={(n) => setData(n)} />}
            {/* "Solved 0/1": the caller's own progress, which means nothing to the teacher (UAT L8). */}
            {s.canManage ? null : hidden ? (
              <span className="text-sm text-slate-600">{t('page.hiddenUntilClose')}</span>
            ) : (
            <>
            <ProgressCells total={problems.length} solved={solved.size} size="md" />
            {s.myProgress?.completed ? (
              <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-chalk-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t('page.completed')}
              </span>
            ) : (
              <span className="text-sm text-slate-600 tabular-nums">
                {t('page.progress', {
                  solved: solved.size,
                  total: problems.length,
                  earned: formatPoints(s.myProgress?.earnedPoints ?? 0),
                  max: formatPoints(s.totalPoints),
                })}
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
            const status = problemStatus({
              manager: s.canManage,
              classProgress: classSolved ? { solved: classSolved.solved[p.key] ?? 0, total: classSolved.total } : undefined,
              hidden,
              solved: isSolved,
              best: b,
              submissions: n,
              points: p.points,
            });
            return (
              <li key={p.key}>
                <Link href={solveHref(s.id, p.key)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50">
                  <span className="min-w-12 shrink-0 text-sm font-semibold whitespace-nowrap text-slate-500 tabular-nums">
                    {t('problemNo', { n: idx + 1 })}
                  </span>
                  {/* Phones: the title takes the line, status and points go under it (as session rows, P1-5); the topic
                      badges (OJ-20) made the squeezed column even taller. */}
                  <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                    <div className="font-medium text-slate-900">{p.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{p.code}</span>
                      <DifficultyBadge difficulty={p.difficulty} />
                      {/* Empty for students while a test or exam runs: the server leaves them out (OJ-20). */}
                      <TopicBadges tags={p.tags ?? []} />
                    </div>
                  </div>
                  {status && (
                    <span
                      className={cn(
                        'ml-16 text-sm tabular-nums sm:ml-0',
                        status.kind === 'class'
                          ? 'text-slate-600'
                          : status.kind === 'solved'
                            ? 'font-semibold text-chalk-700'
                            : status.kind === 'best'
                              ? 'font-medium text-mark-700'
                              : 'text-slate-500',
                      )}
                    >
                      {status.kind === 'class'
                        ? t('page.classSolved', { solved: status.solved, total: status.total })
                        : status.kind === 'hidden'
                          ? t('page.submittedTimes', { count: status.submissions })
                          : status.kind === 'solved'
                            ? t('solvedMark')
                            : status.kind === 'best'
                              ? // In this problem's points, as on the teacher's results board.
                                t('page.best', { earned: formatPoints(status.earned), max: formatPoints(status.max) })
                              : t('page.notStarted')}
                    </span>
                  )}
                  {limit && !s.canManage && s.state === 'OPEN' && (
                    <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">
                      {t('attemptsLeft', { left: Math.max(0, limit - n), limit })}
                    </span>
                  )}
                  <span className="ml-auto min-w-16 text-right text-sm whitespace-nowrap text-slate-600 tabular-nums sm:ml-0">
                    {t('points', { points: p.points })}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>
      </>
      )}

      {s.canManage && (
        <SessionIntegrity sessionId={s.id} enabled={!!(s.settings?.checkPlagiarism || s.settings?.checkAiUsage)} />
      )}

      {s.canManage && (
        <>
          <EditSessionDialog open={editing} onClose={() => setEditing(false)} session={s} onSaved={(n) => setData(n)} />
          <ConfirmDialog
            open={confirmDelete}
            title={t('page.deleteTitle')}
            message={t.rich('page.deleteMessage', { title: s.title, b: (c) => <b>{c}</b> })}
            loading={deleting}
            onConfirm={remove}
            onClose={() => setConfirmDelete(false)}
          />
        </>
      )}
    </Container>
  );
}
