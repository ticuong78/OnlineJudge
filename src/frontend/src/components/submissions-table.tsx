'use client';

import { LanguageLabels, type SubmissionDto } from '@oj/contracts';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { sessionHref, solveHref } from '@/lib/sessions';
import { cn, formatDateTime, formatMemory, formatTime, formatPoints } from '@/lib/utils';
import { Badge, VerdictBadge } from './ui';

export function SubmissionsTable({
  items,
  showUser,
  showProblem = true,
  dim,
}: {
  items: SubmissionDto[];
  showUser?: boolean;
  showProblem?: boolean;
  dim?: boolean;
}) {
  const t = useTranslations('session.table');
  const ts = useTranslations('session');
  return (
    <div className={cn('overflow-x-auto', dim && 'opacity-60')}>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold whitespace-nowrap text-slate-500">
          <tr>
            <th className="px-4 py-2.5">{t('when')}</th>
            {showUser && <th className="px-4 py-2.5">{t('user')}</th>}
            {showProblem && <th className="px-4 py-2.5">{t('problem')}</th>}
            <th className="px-4 py-2.5">{t('result')}</th>
            <th className="px-4 py-2.5 text-right">{t('points')}</th>
            <th className="hidden px-4 py-2.5 sm:table-cell">{t('language')}</th>
            <th className="hidden px-4 py-2.5 text-right md:table-cell">{t('time')}</th>
            <th className="hidden px-4 py-2.5 text-right md:table-cell">{t('memory')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 whitespace-nowrap">
                <Link href={`/submissions/${s.id}`} className="text-ink-600 hover:underline">
                  {formatDateTime(s.createdAt)}
                </Link>
              </td>
              {showUser && <td className="px-4 py-2.5">{s.userDisplayName}</td>}
              {showProblem && (
                <td className="px-4 py-2.5">
                  <Link href={solveHref(s.sessionId, s.problemKey)} className="font-medium hover:text-ink-600">
                    {s.problemTitle}
                  </Link>
                  <Link href={sessionHref(s.sessionId)} className="block text-xs text-slate-500 hover:text-ink-600">
                    {s.sessionTitle}
                  </Link>
                </td>
              )}
              <td className="px-4 py-2.5">
                <Link href={`/submissions/${s.id}`}>
                  {s.resultsHidden && s.status === 'DONE' ? (
                    <Badge className="bg-ink-50 text-ink-700">{ts('submitted')}</Badge>
                  ) : (
                    <VerdictBadge verdict={s.verdict} status={s.status} />
                  )}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{s.status === 'DONE' && !s.resultsHidden ? `${formatPoints(s.score)}%` : '—'}</td>
              <td className="hidden px-4 py-2.5 whitespace-nowrap text-slate-600 sm:table-cell">{LanguageLabels[s.language] ?? s.language}</td>
              <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-slate-600 md:table-cell">{formatTime(s.maxTimeMs)}</td>
              <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-slate-600 md:table-cell">{formatMemory(s.maxMemoryKb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
