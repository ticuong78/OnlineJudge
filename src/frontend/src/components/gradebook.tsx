'use client';

import type { ProblemSetType } from '@oj/contracts';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Badge, Button, Card, EmptyState, ErrorState, inputClass, ProblemSetTypeBadge, TableSkeleton } from './ui';
import { api } from '@/lib/api';
import { gradebookCsv, gradebookView, type GradebookSort } from '@/lib/gradebook';
import { studentSubmissionsHref } from '@/lib/results-links';
import { useAsync } from '@/lib/use-async';
import { scoreTone } from '@/lib/score-tone';
import { cn, formatDate, formatPoints } from '@/lib/utils';
import { CLICKABLE, PartialDot, ScoreLegend, TONE_TEXT } from './score-tone';

/**
 * Every student's score in every opened session of the class, one CSV for the term (OJ-31). Shown in the class page's
 * "Bảng điểm" tab since OJ-32.
 */
export function ClassGradebook({ classId: id, className: name }: { classId: string; className: string }) {
  const t = useTranslations('classes.gradebook');
  const te = useTranslations('enums.problemSetType');
  const { data, error, loading, reload } = useAsync(() => api.getClassGradebook(id), [id]);

  const [types, setTypes] = useState<ProblemSetType[]>([]);
  const [sort, setSort] = useState<GradebookSort>('name');
  const view = useMemo(() => (data ? gradebookView(data, types, sort) : null), [data, types, sort]);
  // Only the types this class actually has, in a fixed order, so the filter never offers an empty choice.
  const present = useMemo(
    () => (['EXAM', 'TEST', 'HOMEWORK', 'PRACTICE'] as const).filter((ty) => data?.sessions.some((s) => s.type === ty)),
    [data],
  );
  const toggle = (ty: ProblemSetType) => setTypes((cur) => (cur.includes(ty) ? cur.filter((x) => x !== ty) : [...cur, ty]));

  const exportCsv = () => {
    if (!view) return;
    const csv = gradebookCsv(
      view,
      { index: t('csv.index'), student: t('student'), left: t('left'), earned: t('earned'), possible: t('csv.possible'), percent: t('percent') },
      formatPoints,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('csv.fileName', { name: name || id });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        {view && <span>{t('count', { students: view.rows.length, sessions: view.sessions.length })}</span>}
        <span className="min-w-0 flex-1 basis-64">{t('subtitle')}</span>
        {view && view.rows.length > 0 && view.sessions.length > 0 && (
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4 shrink-0" />
            {t('export')}
          </Button>
        )}
      </div>

      {data && data.sessions.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <div role="group" aria-label={t('typeFilter')} className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={types.length === 0}
              onClick={() => setTypes([])}
              className={chip(types.length === 0)}
            >
              {t('allTypes')}
            </button>
            {present.map((ty) => (
              <button key={ty} type="button" aria-pressed={types.includes(ty)} onClick={() => toggle(ty)} className={chip(types.includes(ty))}>
                {te(ty)}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            {t('sortLabel')}
            <select className={cn(inputClass, 'w-auto')} value={sort} onChange={(e) => setSort(e.target.value as GradebookSort)}>
              <option value="name">{t('sortName')}</option>
              <option value="total">{t('sortTotal')}</option>
            </select>
          </label>
        </Card>
      )}

      <Card>
        {loading && !data ? (
          <TableSkeleton />
        ) : error || !data || !view ? (
          <div className="p-4">
            <ErrorState message={error ?? t('loadFailed')} onRetry={reload} />
          </div>
        ) : data.sessions.length === 0 ? (
          <EmptyState title={t('emptyTitle')}>{t('emptyBody')}</EmptyState>
        ) : view.rows.length === 0 ? (
          <EmptyState title={t('noStudents')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 align-bottom">{t('student')}</th>
                  {view.sessions.map((s) => (
                    <th key={s.id} className="min-w-36 px-3 py-2.5 text-right align-bottom font-normal">
                      <ProblemSetTypeBadge type={s.type} />
                      <Link href={`/sessions/${s.id}/results`} className="mt-1 block font-medium text-slate-700 hover:text-ink-700">
                        {s.title}
                      </Link>
                      <div>{t('max', { points: formatPoints(s.maxPoints) })}</div>
                      <div>{s.closesAt ? t('closes', { date: formatDate(s.closesAt) }) : t('openNow')}</div>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right align-bottom">
                    {t('earned')}
                    <div className="font-normal">{t('max', { points: formatPoints(view.rows[0].possible) })}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right align-bottom">{t('percent')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.rows.map((r) => (
                  <tr key={r.userId} className={cn('hover:bg-slate-50', r.left && 'text-slate-500')}>
                    <td className="sticky left-0 bg-surface px-4 py-2 font-medium whitespace-nowrap">
                      {r.displayName}
                      {r.left && <Badge className="ml-2 bg-slate-100 text-slate-600">{t('left')}</Badge>}
                    </td>
                    {view.sessions.map((s) => {
                      const v = r.scores[s.id];
                      // Same look as the session results board (OJ-33): bold green, amber with a dot, grey.
                      const tone = v === null ? 'none' : scoreTone(v, s.maxPoints);
                      // Same text for the tooltip and the accessible name, as on the results board.
                      const label =
                        v === null
                          ? t('cellEmpty', { name: r.displayName, title: s.title })
                          : t('cellScore', { name: r.displayName, title: s.title, score: formatPoints(v), max: formatPoints(s.maxPoints) });
                      return (
                        <td key={s.id} className={cn('px-3 py-2 text-right tabular-nums', TONE_TEXT[tone])}>
                          <Link
                            href={studentSubmissionsHref(s.id, r.userId)}
                            className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-ink-50 hover:text-ink-700', v !== null && CLICKABLE)}
                            title={label}
                            aria-label={label}
                          >
                            {tone === 'partial' && <PartialDot />}
                            {v === null ? '—' : formatPoints(v)}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatPoints(r.earned)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {r.percent === null ? '—' : `${formatPoints(r.percent)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!error && data && view && data.sessions.length > 0 && view.rows.length > 0 && <ScoreLegend />}
      </Card>
    </div>
  );
}

function chip(on: boolean) {
  return cn(
    'rounded-full border px-3 py-1 text-sm',
    on ? 'border-ink-500 bg-ink-50 font-medium text-ink-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50',
  );
}
