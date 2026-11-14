'use client';

import { ProblemSetTypes, type BankScope, type ProblemSetType } from '@oj/contracts';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { BankTabs, CopiedFrom, ScopeSwitch, SharingBadge } from '@/components/bank';
import { RequireRole, STAFF } from '@/components/guards';
import { Card, EmptyState, ErrorState, inputClass, LinkButton, PageHeader, ProblemSetTypeBadge, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { cn, storageGet, storageSet } from '@/lib/utils';

const SCOPE_KEY = 'oj:bankScope';

export default function BankSetsPage() {
  const t = useTranslations('bank');
  const tType = useTranslations('enums.problemSetType');
  const { user } = useAuth();
  const [scope, setScopeState] = useState<BankScope>('mine');
  const [type, setType] = useState<ProblemSetType | ''>('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const s = storageGet(SCOPE_KEY) as BankScope | null;
    if (s === 'mine' || s === 'public' || s === 'all') setScopeState(s);
    // The administrator has no bank of their own: start on everything unless they chose otherwise.
    else if (user?.role === 'ADMIN') setScopeState('all');
  }, [user?.role]);
  const setScope = (s: BankScope) => {
    setScopeState(s);
    storageSet(SCOPE_KEY, s);
  };
  const { data, error, loading, reload } = useAsync(() => api.listProblemSets(scope), [scope]);

  const sets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((s) => (!type || s.type === type) && (!needle || s.title.toLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data, type, q]);

  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          title={t('title')}
          subtitle={t('sets.subtitle')}
          actions={
            <LinkButton href="/bank/sets/new">
              <Plus className="h-4 w-4 shrink-0" />
              {t('sets.create')}
            </LinkButton>
          }
        />
        <BankTabs />

        <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <ScopeSwitch value={scope} onChange={setScope} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={cn(inputClass, 'pl-9')} placeholder={t('filters.searchSets')} aria-label={t('filters.searchSets')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select
            className={cn(inputClass, 'lg:w-44')}
            value={type}
            onChange={(e) => setType(e.target.value as ProblemSetType | '')}
            aria-label={t('filters.setType')}
          >
            <option value="">{t('filters.anySetType')}</option>
            {ProblemSetTypes.map((pt) => (
              <option key={pt} value={pt}>
                {tType(pt)}
              </option>
            ))}
          </select>
        </Card>

        <Card>
          {loading && !data ? (
            <TableSkeleton />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : sets.length === 0 ? (
            <EmptyState title={scope === 'mine' ? t('sets.emptyMine') : t('sets.emptyOther')}>
              {scope === 'mine' && (
                <Link href="/bank/sets/new" className="text-ink-600 hover:underline">
                  {t('sets.createFromBank')}
                </Link>
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sets.map((s) => (
                <li key={s.id}>
                  <Link href={`/bank/sets/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50">
                    <ProblemSetTypeBadge type={s.type} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{s.title}</div>
                      <div className="flex flex-wrap gap-x-4 text-sm text-slate-500">
                        <span>{t('countSummary', { count: s.items.length, points: s.totalPoints })}</span>
                        {s.ownerId !== user?.id && <span>{t('ownedBy', { name: s.ownerName })}</span>}
                        <CopiedFrom src={s.copiedFrom} />
                      </div>
                    </div>
                    <SharingBadge isPublic={s.isPublic} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Container>
    </RequireRole>
  );
}
