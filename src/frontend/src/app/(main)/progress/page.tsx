'use client';

import type { LearningRecordDto } from '@oj/contracts';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { Badge, Card, EmptyState, ErrorState, LinkButton, LoadingState, ProblemSetTypeBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { sessionHref, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, formatPoints } from '@/lib/utils';

type Group = LearningRecordDto['groups'][number];
type Rec = Group['sessions'][number];

const groupOrder = (g: Group) =>
  g.classId === null ? 3 : g.classStatus === 'ACTIVE' ? 0 : g.classStatus === 'ARCHIVED' ? 1 : 2;

/** One notebook cell per problem: filled = solved, red edge = tried but not accepted yet, empty = not tried. */
function ProblemCell({ rec, p }: { rec: Rec; p: Rec['problems'][number] }) {
  const tried = !p.solved && p.bestScore > 0;
  const t = useTranslations('student.progress.cell');
  const cell = (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center border text-[10px] font-semibold tabular-nums',
        p.solved ? 'border-chalk-600 bg-chalk-600 text-white' : tried ? 'border-mark-300 bg-white text-mark-600' : 'border-rule bg-white text-slate-300',
      )}
    >
      {p.solved ? '' : tried ? `${Math.round(p.bestScore)}%` : ''}
    </span>
  );
  const status = p.solved
    ? p.solvedAt
      ? t('solvedOn', { date: formatDate(p.solvedAt) })
      : t('solved')
    : tried
      ? t('tried', { score: formatPoints(p.bestScore) })
      : t('none');
  const title = `${p.title}: ${status}`;
  return rec.available ? (
    <Link href={solveHref(rec.sessionId, p.key)} title={title} aria-label={title} className="focus-visible:outline-2">
      {cell}
    </Link>
  ) : (
    <span title={title} aria-label={title}>
      {cell}
    </span>
  );
}

function SessionRow({ rec }: { rec: Rec }) {
  const t = useTranslations('student.progress');
  const titleEl = rec.available ? (
    <Link href={sessionHref(rec.sessionId)} className="font-medium text-slate-900 hover:text-ink-700">
      {rec.title}
    </Link>
  ) : (
    <span className="font-medium text-slate-600">{rec.title}</span>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          {titleEl}
          {rec.completed && !rec.resultsHidden && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-chalk-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {rec.completedAt ? t('completedOn', { date: formatDate(rec.completedAt) }) : t('done')}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <ProblemSetTypeBadge type={rec.type} />
          {rec.resultsHidden ? (
            <span>{t('resultsHidden')}</span>
          ) : (
            <span className="tabular-nums">
              {t('summary', {
                solved: rec.solvedProblems,
                total: rec.totalProblems,
                earned: formatPoints(rec.earnedPoints),
                points: rec.totalPoints,
              })}
            </span>
          )}
        </div>
      </div>
      {rec.resultsHidden ? null : (
      <div className="grid-paper flex flex-wrap gap-[3px] rounded-control p-1">
        {rec.problems.map((p) => (
          <ProblemCell key={p.key} rec={rec} p={p} />
        ))}
      </div>
      )}
    </li>
  );
}

function GroupCard({ g }: { g: Group }) {
  const deleted = g.classStatus === 'DELETED';
  const solved = g.sessions.reduce((n, s) => n + s.solvedProblems, 0);
  const t = useTranslations('student');
  return (
    <Card className={cn('mb-6', deleted && 'border-dashed')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-5 py-3">
        <h2 className="text-lg font-semibold">
          {g.classId === null ? (
            t('progress.publicGroup')
          ) : deleted ? (
            t('classTitle', { name: g.className ?? '' })
          ) : (
            <Link href={`/my-class/${g.classId}`} className="hover:text-ink-700">
              {t('classTitle', { name: g.className ?? '' })}
            </Link>
          )}
        </h2>
        {g.classStatus === 'ARCHIVED' && <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">{t('archived')}</Badge>}
        {deleted && <Badge className="bg-slate-100 text-slate-600">{t('progress.deleted')}</Badge>}
        <span className="ml-auto text-sm whitespace-nowrap text-slate-500 tabular-nums">{t('progress.solvedCount', { count: solved })}</span>
      </div>
      {deleted && (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{t('progress.deletedHint')}</p>
      )}
      <ul className="divide-y divide-slate-100">
        {g.sessions.map((s) => (
          <SessionRow key={s.sessionId} rec={s} />
        ))}
      </ul>
    </Card>
  );
}

export default function ProgressPage() {
  const { data, error, loading, reload } = useAsync(() => api.myProgress(), []);
  const tp = useTranslations('student.progress');
  if (loading && !data) return <LoadingState />;
  if (error || !data)
    return (
      <Container>
        <ErrorState message={error ?? tp('loadError')} onRetry={reload} />
      </Container>
    );

  const groups = [...data.groups].filter((g) => g.sessions.length > 0).sort((a, b) => groupOrder(a) - groupOrder(b));
  const t = data.totals;

  return (
    <Container>
      <header className="mb-8">
        <h1 className="text-[1.75rem] leading-tight font-bold text-slate-900">{tp('title')}</h1>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-lg text-slate-700">
          <span>
            {tp.rich('solved', {
              count: t.solvedProblems,
              n: (c) => <span className="mx-1 font-hand text-5xl leading-none text-chalk-700">{c}</span>,
            })}
          </span>
          <span>
            {tp.rich('completed', {
              done: t.completedSessions,
              started: t.startedSessions,
              n: (c) => <span className="mx-1 font-hand text-5xl leading-none text-chalk-700">{c}</span>,
            })}
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 border border-chalk-600 bg-chalk-600" /> {tp('legendSolved')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 border border-mark-300 bg-white" /> {tp('legendTried')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 border border-rule bg-white" /> {tp('legendNone')}
          </span>
        </p>
      </header>

      {groups.length === 0 ? (
        <Card>
          <EmptyState title={tp('emptyTitle')}>
            {tp('emptyBody')}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <LinkButton href="/my-class">{tp('goMyClass')}</LinkButton>
              <LinkButton href="/practice" variant="secondary">
                {tp('practice')}
              </LinkButton>
            </div>
          </EmptyState>
        </Card>
      ) : (
        groups.map((g) => <GroupCard key={g.classId ?? 'public'} g={g} />)
      )}
    </Container>
  );
}
