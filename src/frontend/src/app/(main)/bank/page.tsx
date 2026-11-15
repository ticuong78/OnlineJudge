'use client';

import { Difficulties, type BankScope, type Difficulty } from '@oj/contracts';
import { BookOpenCheck, Clock, Cpu, FileUp, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { BankTabs, CopiedFrom, OwnerNote, ScopeSwitch, SharingBadge } from '@/components/bank';
import { RequireRole, STAFF } from '@/components/guards';
import { useAuth } from '@/lib/auth';
import { rowClick } from '@/lib/row-link';
import { TopicPicker, useTagLabel } from '@/components/topics';
import { Badge, Card, DifficultyBadge, EmptyState, ErrorState, inputClass, LinkButton, PageHeader, Pagination, TableSkeleton } from '@/components/ui';
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
  // Topics (OJ-20): several may be chosen; the bank lists problems carrying all of them.
  const [tags, setTags] = useState<string[]>([]);
  const addTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur : [...cur, tag]));
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
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const tagsKey = tags.join(',');
  useEffect(() => setPage(1), [search, difficulty, tagsKey, scope]);

  const { data, error, loading, reload } = useAsync(
    () => api.listProblems({ scope, search, difficulty, tags, page, pageSize: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, search, difficulty, tagsKey, page],
  );
  // Reloaded with the list, so counts follow problems created, edited or deleted since (a small query).
  const tagCounts = useAsync(() => api.problemTags(scope), [scope, data]);
  const tagLabel = useTagLabel();
  const router = useRouter();
  const openRow = (href: string, newTab: boolean) => (newTab ? window.open(href, '_blank', 'noopener') : router.push(href));
  const hasFilter = !!(search || difficulty || tags.length);

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
                aria-label={t('filters.searchProblems')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
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
                  setTags([]);
                  setDifficulty('');
                }}
              >
                <X className="h-4 w-4 shrink-0" />
                {t('filters.clear')}
              </button>
            )}
          </div>
          {/* Topics in this scope, most used first (OJ-20). Kept while reloading, so the bar does not jump. */}
          {tagCounts.data && tagCounts.data.length > 0 && (
            <TopicPicker counts={tagCounts.data} value={tags} onChange={setTags} className="mt-3 border-t border-slate-100 pt-3" />
          )}
        </Card>

        <Card>
          {loading && !data ? (
            <TableSkeleton />
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
                      // The whole row opens the problem (U2); the title stays the real link, and the tag buttons still
                      // filter (see lib/row-link.ts for why this is not a stretched link).
                      <tr key={p.id} className="cursor-pointer hover:bg-slate-50" {...rowClick(openRow, `/bank/problems/${p.id}`)}>
                        <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">{p.code}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/bank/problems/${p.id}`}
                            className="font-medium text-slate-900 hover:text-ink-700"
                          >
                            {p.title}
                          </Link>
                          {p.hasSolution && (
                            <Badge className="ml-2 bg-chalk-50 align-middle text-chalk-700 ring-1 ring-chalk-200">
                              <BookOpenCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                              {t('problems.hasSolution')}
                            </Badge>
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
                            {p.tags.map((tag) => (
                              <button key={tag} type="button" onClick={() => addTag(tag)} className="inline-flex min-h-6 items-center">
                                <Badge
                                  className={cn(
                                    'hover:bg-ink-100 hover:text-ink-700',
                                    tags.includes(tag) ? 'bg-ink-100 text-ink-700' : 'bg-slate-100 text-slate-600',
                                  )}
                                >
                                  {tagLabel(tag)}
                                </Badge>
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
