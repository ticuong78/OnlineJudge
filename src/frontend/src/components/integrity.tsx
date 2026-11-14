'use client';

import type { IntegrityFlagDto, IntegrityFlagKind } from '@oj/contracts';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn, formatDateTime } from '@/lib/utils';
import { Badge, Card, ErrorState, LoadingState } from './ui';

export function FlagKindBadge({ kind }: { kind: IntegrityFlagKind }) {
  const t = useTranslations('admin.integrity.kind');
  return (
    <Badge className={kind === 'PLAGIARISM' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'}>
      {t(kind)}
    </Badge>
  );
}

export function FlagLevel({ flag }: { flag: Pick<IntegrityFlagDto, 'kind' | 'level' | 'score'> }) {
  const t = useTranslations('admin.integrity');
  const high = flag.level === 'HIGH';
  return (
    <span className={cn('text-xs font-medium whitespace-nowrap', high ? 'text-mark-700' : 'text-amber-800')}>
      {t(`level.${flag.level}`)}
      {flag.kind === 'PLAGIARISM' ? t('similarSuffix', { percent: Math.round(flag.score * 100) }) : ''}
    </span>
  );
}

export function FlagStatus({ flag }: { flag: Pick<IntegrityFlagDto, 'status'> }) {
  const t = useTranslations('admin.integrity.status');
  return flag.status === 'OPEN' ? (
    <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">{t('OPEN')}</Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-500">{t('ACKNOWLEDGED')}</Badge>
  );
}

export function FlagList({ flags, showSession }: { flags: IntegrityFlagDto[]; showSession?: boolean }) {
  const t = useTranslations('admin.integrity');
  return (
    <ul className="divide-y divide-slate-100">
      {flags.map((f) => (
        <li key={f.id}>
          <Link
            href={`/integrity/${f.id}`}
            className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50', f.status !== 'OPEN' && 'opacity-70')}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <FlagKindBadge kind={f.kind} />
                <FlagLevel flag={f} />
                <span className="font-medium text-slate-900">{f.userDisplayName}</span>
                <span className="text-sm text-slate-500">{f.problemTitle}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{f.summary}</p>
              {showSession && <p className="text-xs text-slate-500">{t('session', { title: f.sessionTitle })}</p>}
            </div>
            <span className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(f.createdAt)}</span>
            <FlagStatus flag={f} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Review" card on a session page (managers only). */
export function SessionIntegrity({ sessionId, enabled }: { sessionId: string; enabled: boolean }) {
  const t = useTranslations('admin.integrity');
  const { data, error, loading, reload } = useAsync(() => api.listIntegrityFlags({ sessionId }), [sessionId]);
  if (!enabled && (!data || data.length === 0)) return null;
  const open = (data ?? []).filter((f) => f.status === 'OPEN').length;
  const sorted = [...(data ?? [])].sort(
    (a, b) => (a.status === b.status ? 0 : a.status === 'OPEN' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <Card className="mt-6">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          {t('title')}
          {open > 0 && <span className="text-sm font-normal text-slate-500">{t('newCount', { count: open })}</span>}
        </h2>
        <p className="text-xs text-slate-500">{t('cardNote')}</p>
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : sorted.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t('cardEmpty')}</p>
      ) : (
        <FlagList flags={sorted} />
      )}
    </Card>
  );
}
