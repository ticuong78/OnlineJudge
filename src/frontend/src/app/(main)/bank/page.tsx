'use client';

import { Difficulties, DifficultyLabels, type BankScope, type Difficulty } from '@oj/contracts';
import { BookOpenCheck, Clock, Cpu, FileUp, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setTag(tagInput.trim());
    }, 350);
    return () => clearTimeout(t);
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
          title="Ngân hàng"
          subtitle="Bài và đề của bạn là bản gốc để giao cho lớp. Bài công khai của giáo viên khác có thể lưu về ngân hàng của bạn."
          actions={
            <>
              <LinkButton href="/import" variant="secondary">
                <FileUp className="h-4 w-4" />
                Nhập đề từ file
              </LinkButton>
              <LinkButton href="/bank/problems/new">
                <Plus className="h-4 w-4" />
                Tạo bài
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
                placeholder="Tìm theo tên hoặc mã bài"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <input
              className={cn(inputClass, 'lg:w-40')}
              placeholder="Chủ đề (tag)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <select
              className={cn(inputClass, 'lg:w-36')}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
              aria-label="Độ khó"
            >
              <option value="">Mọi độ khó</option>
              {Difficulties.map((d) => (
                <option key={d} value={d}>
                  {DifficultyLabels[d]}
                </option>
              ))}
            </select>
            {hasFilter && (
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setSearchInput('');
                  setTagInput('');
                  setDifficulty('');
                }}
              >
                <X className="h-4 w-4" />
                Xóa lọc
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
                  ? 'Không tìm thấy bài phù hợp'
                  : scope === 'mine'
                    ? 'Ngân hàng của bạn chưa có bài nào'
                    : scope === 'organization'
                      ? 'Chưa có bài nào được chia sẻ trong tổ chức'
                      : 'Chưa có bài công khai nào'
              }
            >
              {scope === 'mine' && !hasFilter && (
                <span>
                  <Link href="/bank/problems/new" className="text-ink-600 hover:underline">
                    Tạo bài
                  </Link>
                  , <Link href="/import" className="text-ink-600 hover:underline">nhập đề từ file</Link>, hoặc xem
                  tab Công khai để lưu bài của giáo viên khác.
                </span>
              )}
            </EmptyState>
          ) : (
            <>
              <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
                <table className="w-full text-sm">
                  <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="w-20 px-4 py-2.5">Mã</th>
                      <th className="px-4 py-2.5">Tên bài</th>
                      <th className="w-28 px-4 py-2.5">Độ khó</th>
                      <th className="hidden px-4 py-2.5 lg:table-cell">Chủ đề</th>
                      <th className="hidden px-4 py-2.5 md:table-cell">Chia sẻ</th>
                      <th className="hidden w-40 px-4 py-2.5 xl:table-cell">Giới hạn</th>
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
                            <span title="Có lời giải" className="ml-2 inline-flex align-middle text-chalk-500">
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
                        <td className="hidden px-4 py-2.5 text-xs text-slate-500 xl:table-cell">
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
