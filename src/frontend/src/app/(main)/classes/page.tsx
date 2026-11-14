'use client';

import type { ClassroomDto } from '@oj/contracts';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { ClassCode, ClassFormModal, MoveStudentControl, PendingRequestsBadge } from '@/components/classes';
import { RequireRole, STAFF } from '@/components/guards';
import { Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { formatDate } from '@/lib/utils';

function UnassignedStudents({ classes, onAssigned }: { classes: ClassroomDto[]; onAssigned: () => void }) {
  const t = useTranslations('classes');
  const { data, error, loading, reload, setData } = useAsync(() => api.listUnassignedStudents(), []);
  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{t('unassigned.title')}</h2>
        {data && data.length > 0 && (
          <span className="text-sm whitespace-nowrap text-slate-500">{t('studentCount', { count: data.length })}</span>
        )}
      </div>
      {loading && !data ? (
        <ListSkeleton />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t('unassigned.allAssigned')}</p>
      ) : classes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-600">{t('unassigned.noClasses', { count: data.length })}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{t('columns.name')}</th>
                <th className="px-4 py-2.5">{t('columns.email')}</th>
                <th className="hidden px-4 py-2.5 md:table-cell">{t('columns.phone')}</th>
                <th className="px-4 py-2.5">{t('columns.addToClass')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.userId}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.displayName}</td>
                  <td className="px-4 py-2.5 break-all text-slate-600">{s.email}</td>
                  <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{s.phone ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <MoveStudentControl
                      studentId={s.userId}
                      excludeClassId={null}
                      classes={classes}
                      label={t('unassigned.pickClass')}
                      onMoved={() => {
                        setData((prev) => (prev ?? []).filter((x) => x.userId !== s.userId));
                        onAssigned();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ClassesPage() {
  const t = useTranslations('classes');
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload, setData } = useAsync(() => api.listClasses(), []);
  const [creating, setCreating] = useState(false);
  // "Create your first class" on the home page links here with ?create=1 so one click opens the form (UAT L10).
  // The flag is dropped from the address so Back or a reload does not open it again.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('create') !== '1') return;
    setCreating(true);
    router.replace('/classes');
  }, [router]);
  const classes = [...(data ?? [])].sort(
    (a, b) => (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1) || a.name.localeCompare(b.name, 'vi'),
  );

  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          title={t('list.title')}
          subtitle={
            isAdmin ? t('list.subtitleAdmin') : t('list.subtitleTeacher')
          }
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 shrink-0" />
              {t('list.create')}
            </Button>
          }
        />

        <Card>
          {loading && !data ? (
            <ListSkeleton />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : classes.length === 0 ? (
            <EmptyState title={t('list.emptyTitle')}>
              {t('list.emptyBody')}
              <div className="mt-3">
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 shrink-0" />
                  {t('list.create')}
                </Button>
              </div>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {classes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-slate-50">
                  <div className="min-w-0 flex-1 basis-56">
                    <Link href={`/classes/${c.id}`} className="text-lg font-semibold text-slate-900 hover:text-ink-700">
                      {c.name}
                    </Link>
                    {c.status === 'ARCHIVED' && (
                      <Badge className="ml-2 bg-amber-100 text-amber-800 ring-1 ring-amber-200">{t('archivedBadge')}</Badge>
                    )}
                    <PendingRequestsBadge count={c.pendingRequestCount} className="ml-2" />
                    <div className="flex flex-wrap gap-x-4 text-sm text-slate-500">
                      <span>{t('list.teacher', { name: c.teacherName })}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {t('studentCount', { count: c.studentCount })}
                      </span>
                      <span>{t('createdOn', { date: formatDate(c.createdAt) })}</span>
                    </div>
                  </div>
                  {c.code && <ClassCode code={c.code} />}
                  <Link href={`/classes/${c.id}`} className="inline-flex min-h-8 items-center px-1 text-sm font-medium whitespace-nowrap text-ink-600 hover:underline">
                    {t('list.open')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin && data && (
          <UnassignedStudents classes={classes.filter((c) => c.status === 'ACTIVE')} onAssigned={reload} />
        )}

        <ClassFormModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            setData((prev) => [...(prev ?? []), c]);
            router.push(`/classes/${c.id}`);
          }}
        />
      </Container>
    </RequireRole>
  );
}
