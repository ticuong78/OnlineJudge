'use client';

import { Difficulties, type BankScope, type Difficulty } from '@oj/contracts';
import { BookOpenCheck, Clock, Cpu, FileUp, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { BankTabs, CopiedFrom, OwnerNote, ScopeSwitch, SharingBadge } from '@/components/bank';
import { RequireRole, STAFF } from '@/components/guards';
import { useAuth } from '@/lib/auth';
import {
  Badge,
  Card,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  inputClass,
  LinkButton,
  LoadingState,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn, storageGet, storageSet } from '@/lib/utils';

const PAGE_SIZE = 20;
const SCOPE_KEY = 'oj:bankScope';

export default function BankProblemsPage() {
  const t = useTranslations('bank');
  const tDifficulty = useTranslations('enums.difficulty');
  const { user } = useAuth();
  const [scope, setScopeState] = useState<BankScope>('mine');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const s = storageGet(SCOPE_KEY) as BankScope | null;
    if (s === 'mine' || s === 'public' || s === 'all' || (s === 'organization' && !!user?.organizations.length)) setScopeState(s);
    // The administrator has no bank of their own: start on everything unless they chose otherwise.
    else if (user?.role === 'ADMIN') setScopeState('all');
  }, [user?.role, user?.organizations.length]);
  const setScope = (s: BankScope) => {
    setScopeState(s);
    storageSet(SCOPE_KEY, s);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setTag(tagInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, tagInput]);
  useEffect(() => setPage(1), [search, difficulty, tag, scope]);

  const { data, error, loading, reload } = useAsync(
    () => api.listProblems({ scope, search, difficulty, tag, page, pageSize: PAGE_SIZE }),
    [scope, search, difficulty, tag, page],
  );
  const hasFilter = !!(search || difficulty || tag);

  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          title={t('title')}
          subtitle={t('problems.subtitle')}
          actions={
            <>
              <LinkButton href="/import" variant="secondary">
                <FileUp className="h-4 w-4 shrink-0" />
                {t('problems.importFile')}
              </LinkButton>
              <LinkButton href="/bank/problems/new">
                <Plus className="h-4 w-4 shrink-0" />
                {t('problems.create')}
              </LinkButton>
            </>
          }
        />
        <BankTabs />

        <Card className="mb-4 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <ScopeSwitch value={scope} onChange={setScope} withOrganization />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={cn(inputClass, 'pl-9')}
                placeholder={t('filters.searchProblems')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <input
              className={cn(inputClass, 'lg:w-40')}
              placeholder={t('filters.tag')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <select
              className={cn(inputClass, 'lg:w-36')}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
              aria-label={t('filters.difficulty')}
            >
              <option value="">{t('filters.anyDifficulty')}</option>
              {Difficulties.map((d) => (
                <option key={d} value={d}>
                  {tDifficulty(d)}
                </option>
              ))}
            </select>
            {hasFilter && (
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setSearchInput('');
                  setTagInput('');
                  setDifficulty('');
                }}
              >
                <X className="h-4 w-4 shrink-0" />
                {t('filters.clear')}
              </button>
            )}
          </div>
        </Card>

        <Card>
          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title={
                hasFilter
                  ? t('problems.emptyFiltered')
                  : scope === 'mine'
                    ? t('problems.emptyMine')
                    : scope === 'organization'
                      ? t('problems.emptyOrganization')
                      : t('problems.emptyPublic')
              }
            >
              {scope === 'mine' && !hasFilter && (
                <span>
                  {t.rich('problems.emptyMineHint', {
                    create: (c) => (
                      <Link href="/bank/problems/new" className="text-ink-600 hover:underline">
                        {c}
                      </Link>
                    ),
                    import: (c) => (
                      <Link href="/import" className="text-ink-600 hover:underline">
                        {c}
                      </Link>
                    ),
                  })}
                </span>
              )}
            </EmptyState>
          ) : (
            <>
              <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
                <table className="w-full text-sm">
                  <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
                    <tr>
                      <th className="w-20 px-4 py-2.5">{t('problems.col.code')}</th>
                      <th className="px-4 py-2.5">{t('problems.col.title')}</th>
                      <th className="w-28 px-4 py-2.5">{t('problems.col.difficulty')}</th>
                      <th className="hidden px-4 py-2.5 lg:table-cell">{t('problems.col.tags')}</th>
                      <th className="hidden px-4 py-2.5 md:table-cell">{t('problems.col.sharing')}</th>
                      <th className="hidden w-40 px-4 py-2.5 xl:table-cell">{t('problems.col.limits')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">{p.code}</td>
                        <td className="px-4 py-2.5">
                          <Link href={`/bank/problems/${p.id}`} className="font-medium text-slate-900 hover:text-ink-700">
                            {p.title}
                          </Link>
                          {p.hasSolution && (
                            <span title={t('problems.hasSolution')} className="ml-2 inline-flex align-middle text-chalk-500">
                              <BookOpenCheck className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <div className="flex flex-wrap gap-x-3">
                            <OwnerNote p={p} />
                            <CopiedFrom src={p.copiedFrom} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <DifficultyBadge difficulty={p.difficulty} />
                        </td>
                        <td className="hidden px-4 py-2.5 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {p.tags.map((t) => (
                              <button key={t} type="button" onClick={() => setTagInput(t)}>
                                <Badge className="bg-slate-100 text-slate-600 hover:bg-ink-100 hover:text-ink-700">{t}</Badge>
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="hidden px-4 py-2.5 md:table-cell">
                          <SharingBadge isPublic={p.sharing.isPublic} organizationCount={p.sharing.organizationIds.length} />
                        </td>
                        <td className="hidden px-4 py-2.5 text-xs whitespace-nowrap text-slate-500 xl:table-cell">
                          <span className="mr-3 inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {p.timeLimitMs} ms
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Cpu className="h-3.5 w-3.5" />
                            {p.memoryLimitMb} MB
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
            </>
          )}
        </Card>
      </Container>
    </RequireRole>
  );
}
