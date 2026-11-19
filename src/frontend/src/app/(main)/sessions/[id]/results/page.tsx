'use client';

import { ArrowDown, ArrowUp, CheckCircle2, Download } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { StudentWorkPanel, type StudentWorkTarget } from '@/components/student-work';
import { Button, Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { csvFile } from '@/lib/csv';
import { useAsync } from '@/lib/use-async';
import { solvedByProblem, sortResults, type ResultSort, type SortDirection } from '@/lib/results';
import { studentSubmissionsHref } from '@/lib/results-links';
import { scoreTone, sessionPoints } from '@/lib/score-tone';
import { CLICKABLE, PartialDot, ScoreLegend, TONE_TEXT } from '@/components/score-tone';
import { intlTag } from '@/i18n/runtime';
import { resultsWide } from '@/lib/layout';
import { cn, formatDateTime, formatPoints } from '@/lib/utils';

export default function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('session');
  const session = useAsync(() => api.getSession(id), [id]);
  const { data, error, loading, reload } = useAsync(() => api.getSessionResults(id), [id]);

  // Sortable by any column (U4); highest total first by default.
  const [sort, setSort] = useState<ResultSort>({ by: 'total' });
  const [direction, setDirection] = useState<SortDirection>('desc');
  const rows = useMemo(() => sortResults(data?.rows ?? [], sort, direction), [data, sort, direction]);
  const maxPoints = useMemo(() => (data ? sessionPoints(id, { id, problems: data.problems }) : undefined), [id, data]);
  const solvedBy = useMemo(() => solvedByProblem(data?.rows ?? [], data?.problems ?? []), [data]);
  const sameSort = (a: ResultSort, b: ResultSort) => a.by === b.by && (a.by !== 'problem' || (b.by === 'problem' && a.key === b.key));
  const sortBy = (next: ResultSort) => {
    if (sameSort(next, sort)) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(next);
      setDirection(next.by === 'name' ? 'asc' : 'desc');
    }
  };
  const ariaSort = (col: ResultSort) => (sameSort(col, sort) ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');

  // One student's attempts (OJ-30): a score cell opens that problem, the name opens every problem.
  const [work, setWork] = useState<StudentWorkTarget | null>(null);

  // Live while the session is open (U4): the board refreshes every 30 s while the tab is visible.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (data) setUpdatedAt(new Date());
  }, [data]);
  const live = session.data?.state === 'OPEN';
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 30_000);
    return () => clearInterval(timer);
  }, [live, reload]);
  const maxTotal = data?.problems.reduce((s, p) => s + p.points, 0) ?? 0;
  const completed = rows.filter((r) => r.completed).length;

  const exportCsv = () => {
    if (!data) return;
    const header = [
      t('results.csv.index'),
      t('results.student'),
      ...data.problems.map((p, i) => t('results.csv.problem', { n: i + 1, code: p.code })),
      t('results.total'),
      t('results.csv.solvedCount'),
      t('results.completed'),
      t('results.lastSubmission'),
    ];
    const lines = rows.map((r, i) => [
      i + 1,
      r.displayName,
      ...data.problems.map((p) => formatPoints(r.scores[p.key] ?? 0)),
      formatPoints(r.total),
      r.solvedCount,
      r.completed ? t('results.csv.yes') : t('results.csv.no'),
      r.lastSubmissionAt ? formatDateTime(r.lastSubmissionAt) : '',
    ]);
    const csv = csvFile([header, ...lines]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('results.csv.fileName', { title: session.data?.title ?? id });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RequireRole roles={STAFF}>
      <Container wide={resultsWide(data?.problems.length ?? session.data?.problems.length ?? 0)}>
        <PageHeader
          back={{ href: `/sessions/${id}`, label: t('results.back') }}
          title={t('results.title', { title: session.data?.title ?? '' })}
          subtitle={
            data && (
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  {session.data?.audience === 'PUBLIC'
                    ? t('results.public')
                    : t('className', { name: session.data?.className ?? '' })}
                </span>
                <span>{t('results.completedCount', { done: completed, total: rows.length })}</span>
                <span>{t('results.scoringNote')}</span>
                {live && updatedAt && (
                  <span className="text-slate-500">{t('results.liveUpdated', { time: updatedAt.toLocaleTimeString(intlTag()) })}</span>
                )}
              </span>
            )
          }
          actions={
            data &&
            rows.length > 0 && (
              <Button variant="secondary" onClick={exportCsv}>
                <Download className="h-4 w-4 shrink-0" />
                {t('results.export')}
              </Button>
            )
          }
        />
        <Card>
          {loading && !data ? (
            <TableSkeleton />
          ) : error || !data ? (
            <div className="p-4">
              <ErrorState message={error ?? t('results.loadFailed')} onRetry={reload} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title={t('results.emptyTitle')}>{t('results.emptyBody')}</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
                  <tr>
                    <th className="sticky left-0 bg-slate-50 px-4 py-2.5" aria-sort={ariaSort({ by: 'name' })}>
                      <SortButton onClick={() => sortBy({ by: 'name' })} active={sort.by === 'name'} direction={direction}>
                        {t('results.student')}
                      </SortButton>
                    </th>
                    <th className="px-3 py-2.5 text-center" aria-sort={ariaSort({ by: 'solved' })}>
                      <SortButton onClick={() => sortBy({ by: 'solved' })} active={sort.by === 'solved'} direction={direction}>
                        {t('results.solved')}
                      </SortButton>
                    </th>
                    {data.problems.map((p, i) => (
                      <th key={p.key} className="px-3 py-2.5 text-right" title={p.title} aria-sort={ariaSort({ by: 'problem', key: p.key })}>
                        <SortButton
                          onClick={() => sortBy({ by: 'problem', key: p.key })}
                          active={sort.by === 'problem' && sort.key === p.key}
                          direction={direction}
                          align="right"
                        >
                          {t('problemNo', { n: i + 1 })}
                        </SortButton>
                        <div className="font-normal text-slate-500">{t('points', { points: p.points })}</div>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right" aria-sort={ariaSort({ by: 'total' })}>
                      <SortButton onClick={() => sortBy({ by: 'total' })} active={sort.by === 'total'} direction={direction} align="right">
                        {t('results.total')}
                      </SortButton>
                      <div className="font-normal text-slate-500">{t('points', { points: maxTotal })}</div>
                    </th>
                    <th className="hidden px-4 py-2.5 lg:table-cell" aria-sort={ariaSort({ by: 'last' })}>
                      <SortButton onClick={() => sortBy({ by: 'last' })} active={sort.by === 'last'} direction={direction}>
                        {t('results.lastSubmission')}
                      </SortButton>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.userId} className="hover:bg-slate-50">
                      <td className="sticky left-0 bg-surface px-4 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setWork({ userId: r.userId, displayName: r.displayName })}
                            className={cn(
                              // One line; below sm a very long name is cut so the score columns keep room (full name in title).
                              '-mx-1 block max-w-[45vw] truncate rounded px-1 text-left whitespace-nowrap hover:bg-ink-50 hover:text-ink-700 sm:max-w-none',
                              CLICKABLE,
                            )}
                            title={t('results.studentLink', { name: r.displayName })}
                          >
                            {r.displayName}
                          </button>
                          {r.completed && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-chalk-600" aria-label={t('results.completed')} />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {r.solvedCount}/{data.problems.length}
                      </td>
                      {data.problems.map((p, i) => {
                        const v = r.scores[p.key] ?? 0;
                        const tone = scoreTone(v, p.points);
                        const label = t('results.cellScore', {
                          name: r.displayName,
                          n: i + 1,
                          score: formatPoints(v),
                          max: formatPoints(p.points),
                        });
                        return (
                          <td key={p.key} className={cn('px-3 py-2 text-right tabular-nums', TONE_TEXT[tone])}>
                            {/* This student's attempts on this problem (OJ-30; before, every student's). */}
                            <button
                              type="button"
                              onClick={() => setWork({ userId: r.userId, displayName: r.displayName, problem: { key: p.key, n: i + 1 } })}
                              className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 tabular-nums hover:bg-ink-50 hover:text-ink-700', CLICKABLE)}
                              // One text for the tooltip and the accessible name, so a screen reader does not say it twice.
                              title={label}
                              aria-label={label}
                            >
                              {tone === 'partial' && <PartialDot />}
                              {formatPoints(v)}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-bold tabular-nums">{formatPoints(r.total)}</td>
                      <td className="hidden px-4 py-2 whitespace-nowrap text-slate-500 lg:table-cell">
                        {r.lastSubmissionAt ? (
                          <Link href={studentSubmissionsHref(id, r.userId)} className="hover:text-ink-700">
                            {formatDateTime(r.lastSubmissionAt)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* How many students have full points on each problem: where the class is stuck (U4). */}
                <tfoot className="border-t border-rule bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th scope="row" className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium">
                      {t('results.solvedBy')}
                    </th>
                    <td />
                    {data.problems.map((p) => (
                      <td key={p.key} className="px-3 py-2 text-right tabular-nums">
                        {solvedBy[p.key]}/{rows.length}
                      </td>
                    ))}
                    <td />
                    <td className="hidden lg:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {!error && data && rows.length > 0 && <ScoreLegend />}
        </Card>
        <StudentWorkPanel sessionId={id} target={work} onClose={() => setWork(null)} maxPoints={maxPoints} />
      </Container>
    </RequireRole>
  );
}

/** A column header that sorts the board; the arrow shows the current order. */
function SortButton({
  children,
  onClick,
  active,
  direction,
  align = 'left',
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
  align?: 'left' | 'right';
}) {
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 font-medium hover:text-ink-700', align === 'right' && 'flex-row-reverse', active && 'text-slate-800')}
    >
      {children}
      <Arrow className={cn('h-3 w-3 shrink-0', active ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
    </button>
  );
}
