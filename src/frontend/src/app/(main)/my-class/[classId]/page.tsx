'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { LeaveClassButton } from '@/components/membership';
import { SessionList } from '@/components/sessions';
import { ClassBoard } from '@/components/threads';
import { Badge, Card, ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { sortSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';

/** One of the student's classes: its sessions and board. Read-only for classes the student left or that were archived. */
export default function MyClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const classes = useAsync(() => api.listClasses(), []);
  const sessions = useAsync(() => api.listSessions({ audience: 'CLASS' }), []);
  const requests = useAsync(() => api.myMembershipRequests(), []);
  const t = useTranslations('student');

  if ((classes.loading && !classes.data) || (sessions.loading && !sessions.data)) return <PageSkeleton />;
  const back = { href: '/my-class', label: t('myClass.title') };
  if (classes.error || sessions.error)
    return (
      <Container>
        <ErrorState
          message={classes.error ?? sessions.error ?? ''}
          onRetry={() => {
            classes.reload();
            sessions.reload();
          }}
        />
      </Container>
    );

  const cls = (classes.data ?? []).find((c) => c.id === classId);
  if (!cls)
    return (
      <Container>
        <PageHeader back={back} title={t('classDetail.notFound')} />
        <ErrorState message={t('classDetail.notMember')} />
      </Container>
    );

  const current = cls.isCurrent !== false;
  const archived = cls.status === 'ARCHIVED';
  const list = sortSessions((sessions.data ?? []).filter((s) => s.classId === cls.id));
  const pendingLeave = (requests.data ?? []).find(
    (r) => r.classId === cls.id && r.kind === 'LEAVE' && r.status === 'PENDING',
  );

  return (
    <Container>
      <PageHeader
        back={back}
        title={t('classTitle', { name: cls.name })}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{t('teacher', { name: cls.teacherName })}</span>
            {archived && <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">{t('classDetail.archivedReadOnly')}</Badge>}
            {!current && !archived && <Badge className="bg-slate-100 text-slate-600">{t('classDetail.leftReadOnly')}</Badge>}
          </span>
        }
        actions={
          current &&
          requests.data && (
            <LeaveClassButton
              cls={cls}
              pending={pendingLeave}
              onSent={() => requests.reload()}
              onCancel={() => requests.reload()}
            />
          )
        }
      />
      <Card className="mb-6">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">{t('classDetail.sessions')}</h2>
          <p className="text-sm text-slate-500">{t('classDetail.sessionsHint')}</p>
        </div>
        <SessionList
          sessions={list}
          emptyTitle={current && !archived ? t('classDetail.emptyTitle') : t('classDetail.emptyTitleClosed')}
          emptyHint={current && !archived ? t('classDetail.emptyHint') : undefined}
        />
      </Card>
      <ClassBoard classId={cls.id} archived={archived} isManager={false} canPost={current} />
    </Container>
  );
}
