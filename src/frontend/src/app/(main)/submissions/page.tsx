'use client';

import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { SubmissionsTable } from '@/components/submissions-table';
import { Card, EmptyState, ErrorState, inputClass, LinkButton, LoadingState, PageHeader, Pagination, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function SubmissionsList() {
  const { isStaff, isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('session.submissions');
  const sessionId = params.get('sessionId') || '';
  // From a results-board cell (OJ-17, U4): that problem's submissions in the session.
  const problemKey = params.get('problemKey') || '';
  // From a student's row on the results board (OJ-30): that student's submissions in the session.
  const userId = params.get('userId') || '';
  const [mine, setMine] = useState(!isStaff || !sessionId);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [sessionId, mine]);
  // Teachers can list everyone's submissions only inside a session they manage.
  useEffect(() => {
    if (isStaff && !isAdmin && !sessionId) setMine(true);
  }, [isStaff, isAdmin, sessionId]);

  const sessions = useAsync(() => api.listSessions(), [], isStaff);
  const managed = useMemo(
    () => (sessions.data ?? []).filter((s) => s.canManage).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessions.data],
  );

  const { data, error, loading, reload } = useAsync(
    () =>
      api.listSubmissions({
        sessionId: sessionId || undefined,
        problemKey: problemKey || undefined,
        userId: userId || undefined,
        mine: userId ? undefined : isStaff ? mine : true,
        page,
        pageSize: PAGE_SIZE,
      }),
    [sessionId, problemKey, userId, mine, page, isStaff],
  );
  const studentName = data?.items[0]?.userDisplayName;

  const pending = data?.items.some((s) => s.status !== 'DONE');
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(reload, 2000);
    return () => clearTimeout(t);
  }, [pending, data, reload]);

  const clearStudent = () => {
    const sp = new URLSearchParams(params.toString());
    sp.delete('userId');
    setMine(false);
    const qs = sp.toString();
    router.replace(qs ? `/submissions?${qs}` : '/submissions');
  };

  const setSession = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set('sessionId', value);
    else sp.delete('sessionId');
    sp.delete('userId'); // a student filter belongs to the session it came from
    if (value) setMine(false);
    const qs = sp.toString();
    router.replace(qs ? `/submissions?${qs}` : '/submissions');
  };

  const canSeeAll = isAdmin || !!sessionId;

  return (
    <Container>
      <PageHeader
        title={isStaff ? t('titleStaff') : t('titleStudent')}
        subtitle={isStaff ? t('subtitleStaff') : t('subtitleStudent')}
      />

      {isStaff && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <select
            className={cn(inputClass, 'w-full min-w-0 sm:w-auto sm:min-w-64')}
            value={sessionId}
            onChange={(e) => setSession(e.target.value)}
            aria-label={t('sessionLabel')}
          >
            <option value="">{isAdmin ? t('allSessions') : t('chooseSession')}</option>
            {managed.map((s) => (
              <option key={s.id} value={s.id}>
                {s.className ? t('optionClass', { title: s.title, name: s.className }) : t('optionPublic', { title: s.title })}
              </option>
            ))}
          </select>
          {/* One student's work already answers "everyone or mine": the chip below replaces the switch. */}
          <div className={cn('inline-flex shrink-0 rounded-control bg-slate-100 p-1 text-sm whitespace-nowrap', userId && 'hidden')}>
            <button
              type="button"
              disabled={!canSeeAll}
              onClick={() => setMine(false)}
              className={cn(
                'rounded-[4px] px-3 py-1 disabled:opacity-50',
                !mine ? 'bg-surface font-medium ring-1 ring-slate-300' : 'text-slate-600',
              )}
              title={canSeeAll ? undefined : t('chooseFirst')}
            >
              {t('everyone')}
            </button>
            <button
              type="button"
              onClick={() => setMine(true)}
              className={cn('rounded-[4px] px-3 py-1', mine ? 'bg-surface font-medium ring-1 ring-slate-300' : 'text-slate-600')}
            >
              {t('mine')}
            </button>
          </div>
          {userId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 py-1 pr-1 pl-3 text-sm text-ink-700">
              {t('studentFilter', { name: studentName ?? t('studentUnknown') })}
              <button
                type="button"
                onClick={clearStudent}
                className="rounded-full p-1 hover:bg-ink-100"
                aria-label={t('clearStudent')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </Card>
      )}

      <Card>
        {loading && !data ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data || data.items.length === 0 ? (
          // The next step, not just "nothing here" (U8): a student with no submissions goes to practice.
          <EmptyState title={t('empty')}>
            {!isStaff && (
              <LinkButton href="/practice" size="sm" className="mt-2">
                {t('emptyAction')}
              </LinkButton>
            )}
          </EmptyState>
        ) : (
          <>
            <SubmissionsTable items={data.items} showUser={isStaff && !mine && !userId} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </Container>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SubmissionsList />
    </Suspense>
  );
}
