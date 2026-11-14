'use client';

import type { LearningPathSummaryDto } from '@oj/contracts';
import { useState } from 'react';
import { Lock, Map as MapIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { TopicBadge } from './topics';
import { Button, Card, ErrorState, LinkButton, ListSkeleton } from './ui';

/** A thin progress bar: solved out of total. */
export function ProgressBar({ solved, total, className }: { solved: number; total: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-slate-100', className)} aria-hidden="true">
      <div className="h-full rounded-full bg-chalk-solid" style={{ width: `${total ? Math.round((solved / total) * 100) : 0}%` }} />
    </div>
  );
}

function PathCard({ p }: { p: LearningPathSummaryDto }) {
  const t = useTranslations('paths.section');
  return (
    <Link href={`/paths/${p.id}`} className="block rounded-panel border border-rule bg-surface p-4 transition-colors hover:border-ink-300 hover:bg-ink-50/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{p.title}</span>
        {p.topic && <TopicBadge tag={p.topic} />}
        {!p.isPublic && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t('private')}
          </span>
        )}
      </div>
      {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          {t('steps', { count: p.stepCount })} · {t('by', { name: p.ownerName })}
        </span>
        <span className="tabular-nums">{t('progress', { solved: p.solved, total: p.total })}</span>
      </div>
      <ProgressBar solved={p.solved} total={p.total} className="mt-1.5" />
    </Link>
  );
}

/**
 * Paths a page at a time (OJ-27, OJ-28): the first page loads at once, `more` appends the page after the server's
 * `next` cursor. The server says when nothing follows, so the button never leads to an empty page.
 */
function usePathPages(scope: 'public' | 'mine', enabled = true) {
  const first = useAsync(() => (enabled ? api.listPaths({ scope }) : Promise.resolve({ items: [], next: null })), [scope, enabled]);
  const [extra, setExtra] = useState<{ items: LearningPathSummaryDto[]; next: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const next = extra ? extra.next : (first.data?.next ?? null);
  const more = async () => {
    if (!next) return;
    setBusy(true);
    setMoreError(null);
    try {
      const page = await api.listPaths({ scope, before: next });
      setExtra((prev) => ({ items: [...(prev?.items ?? []), ...page.items], next: page.next }));
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { data: first.data ? items : undefined, loading: first.loading, error: first.error, reload: first.reload, hasMore: next !== null, more, busy, moreError };
}

function MoreButton({ pages }: { pages: ReturnType<typeof usePathPages> }) {
  const t = useTranslations('paths.section');
  if (!pages.hasMore) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" loading={pages.busy} onClick={pages.more}>
        {t('more')}
      </Button>
      {pages.moreError && <span className="text-sm text-red-600" role="alert">{pages.moreError}</span>}
    </div>
  );
}

/** "Lộ trình" on the practice page (OJ-24): public paths for everyone, and the teacher's own ones. */
export function PathsSection() {
  const t = useTranslations('paths.section');
  const { isStaff } = useAuth();
  const pub = usePathPages('public');
  const mine = usePathPages('mine', isStaff);
  // A teacher's own public paths appear under "yours"; the public list shows everyone else's.
  const mineIds = new Set((mine.data ?? []).map((p) => p.id));
  const others = (pub.data ?? []).filter((p) => !mineIds.has(p.id));

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <MapIcon className="h-4 w-4 text-ink-600" aria-hidden="true" />
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('hint')}</p>
        </div>
        {isStaff && (
          <LinkButton href="/paths/new" size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            {t('create')}
          </LinkButton>
        )}
      </div>
      {pub.loading && !pub.data ? (
        <ListSkeleton rows={2} className="mt-3" />
      ) : pub.error ? (
        <ErrorState message={pub.error} onRetry={pub.reload} />
      ) : (
        <>
          {isStaff && (mine.data?.length ?? 0) > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-medium text-slate-700">{t('mine')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {mine.data!.map((p) => <PathCard key={p.id} p={p} />)}
              </div>
              <MoreButton pages={mine} />
            </>
          )}
          {others.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {others.map((p) => <PathCard key={p.id} p={p} />)}
            </div>
          ) : (pub.data?.length ?? 0) > 0 ? null : (
            !(isStaff && (mine.data?.length ?? 0) > 0) && (
              <p className="mt-3 text-sm text-slate-500">{isStaff ? t('emptyStaff') : t('empty')}</p>
            )
          )}
          <MoreButton pages={pub} />
        </>
      )}
    </Card>
  );
}
