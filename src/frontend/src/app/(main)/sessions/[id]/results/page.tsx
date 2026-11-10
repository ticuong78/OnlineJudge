'use client';

import { CheckCircle2, Download } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn, formatDateTime, formatPoints } from '@/lib/utils';

export default function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('session');
  const session = useAsync(() => api.getSession(id), [id]);
  const { data, error, loading, reload } = useAsync(() => api.getSessionResults(id), [id]);

  const rows = useMemo(
    () => [...(data?.rows ?? [])].sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, 'vi')),
    [data],
  );
  const maxTotal = data?.problems.reduce((s, p) => s + p.points, 0) ?? 0;
  const completed = rows.filter((r) => r.completed).length;

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
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
    const csv = '﻿' + [header, ...lines].map((l) => l.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('results.csv.fileName', { title: session.data?.title ?? id });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RequireRole roles={STAFF}>
      <Container wide>
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
            <LoadingState />
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
                    <th className="sticky left-0 bg-slate-50 px-4 py-2.5">{t('results.student')}</th>
                    <th className="px-3 py-2.5 text-center">{t('results.solved')}</th>
                    {data.problems.map((p, i) => (
                      <th key={p.key} className="px-3 py-2.5 text-right" title={p.title}>
                        {t('problemNo', { n: i + 1 })}
                        <div className="font-normal text-slate-400">{t('points', { points: p.points })}</div>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right">
                      {t('results.total')}
                      <div className="font-normal text-slate-400">{t('points', { points: maxTotal })}</div>
                    </th>
                    <th className="hidden px-4 py-2.5 lg:table-cell">{t('results.lastSubmission')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.userId} className="hover:bg-slate-50">
                      <td className="sticky left-0 bg-white px-4 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.displayName}
                          {r.completed && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-chalk-600" aria-label={t('results.completed')} />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {r.solvedCount}/{data.problems.length}
                      </td>
                      {data.problems.map((p) => {
                        const v = r.scores[p.key] ?? 0;
                        return (
                          <td
                            key={p.key}
                            className={cn(
                              'px-3 py-2 text-right tabular-nums',
                              v >= p.points ? 'font-semibold text-chalk-700' : v > 0 ? 'text-slate-800' : 'text-slate-300',
                            )}
                          >
                            {formatPoints(v)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-bold tabular-nums">{formatPoints(r.total)}</td>
                      <td className="hidden px-4 py-2 whitespace-nowrap text-slate-500 lg:table-cell">
                        {r.lastSubmissionAt ? (
                          <Link href={`/submissions?sessionId=${id}`} className="hover:text-ink-700">
                            {formatDateTime(r.lastSubmissionAt)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Container>
    </RequireRole>
  );
}
