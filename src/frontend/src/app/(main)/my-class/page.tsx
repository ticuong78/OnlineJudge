'use client';

import type { ClassroomDto, MembershipRequestDto, SessionDto } from '@oj/contracts';
import { Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { JoinClassForm, LeaveClassButton, MyRequestList } from '@/components/membership';
import { Badge, Card, EmptyState, ErrorState, LinkButton, PageHeader, PageSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { splitStudentClasses } from '@/lib/classes';
import { useAsync } from '@/lib/use-async';

function CurrentClassRow({
  cls,
  sessions,
  pendingLeave,
  onRequestChange,
}: {
  cls: ClassroomDto;
  sessions: SessionDto[];
  pendingLeave?: MembershipRequestDto;
  onRequestChange: () => void;
}) {
  const open = sessions.filter((s) => s.classId === cls.id && s.state === 'OPEN' && s.canSubmit && !s.myProgress?.completed);
  const t = useTranslations('student');
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-[12rem] flex-1">
        <Link href={`/my-class/${cls.id}`} className="text-lg font-semibold text-slate-900 hover:text-ink-700">
          {cls.name}
        </Link>
        <div className="flex flex-wrap gap-x-4 text-sm text-slate-500">
          <span>{t('teacher', { name: cls.teacherName })}</span>
          <span className={open.length ? 'font-medium text-ink-700' : undefined}>
            {open.length ? t('myClass.openCount', { count: open.length }) : t('myClass.noOpen')}
          </span>
        </div>
      </div>
      <LeaveClassButton cls={cls} pending={pendingLeave} onSent={onRequestChange} onCancel={onRequestChange} />
      <LinkButton href={`/my-class/${cls.id}`} size="sm" variant="secondary">
        {t('myClass.openClass')}
      </LinkButton>
    </li>
  );
}

export default function MyClassPage() {
  const classes = useAsync(() => api.listClasses(), []);
  const sessions = useAsync(() => api.listSessions({ audience: 'CLASS' }), []);
  const requests = useAsync(() => api.myMembershipRequests(), []);
  const t = useTranslations('student');

  if ((classes.loading && !classes.data) || (requests.loading && !requests.data)) return <PageSkeleton />;
  if (classes.error || requests.error)
    return (
      <Container>
        <ErrorState
          message={classes.error ?? requests.error ?? ''}
          onRetry={() => {
            classes.reload();
            requests.reload();
          }}
        />
      </Container>
    );

  const { current, history } = splitStudentClasses(classes.data ?? []);
  const reqs = requests.data ?? [];
  const pendingJoins = reqs.filter((r) => r.kind === 'JOIN' && r.status === 'PENDING');
  const refresh = () => {
    requests.reload();
    classes.reload();
  };

  return (
    <Container>
      <PageHeader title={t('myClass.title')} subtitle={t('myClass.subtitle')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">{t('myClass.current')}</h2>
            </div>
            {current.length === 0 ? (
              <EmptyState title={pendingJoins.length ? t('myClass.pendingTitle') : t('myClass.noClassTitle')}>
                <p className="max-w-[56ch]">
                  {pendingJoins.length
                    ? t('myClass.pendingBody', { names: pendingJoins.map((r) => r.className).join(', ') })
                    : t('myClass.noClassBody')}
                </p>
                <div className="mt-3">
                  <LinkButton href="/practice" variant="secondary">
                    <Dumbbell className="h-4 w-4 shrink-0" />
                    {t('myClass.goPractice')}
                  </LinkButton>
                </div>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {current.map((c) => (
                  <CurrentClassRow
                    key={c.id}
                    cls={c}
                    sessions={sessions.data ?? []}
                    pendingLeave={reqs.find((r) => r.classId === c.id && r.kind === 'LEAVE' && r.status === 'PENDING')}
                    onRequestChange={refresh}
                  />
                ))}
              </ul>
            )}
          </Card>

          {history.length > 0 && (
            <Card>
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">{t('myClass.history')}</h2>
                <p className="text-sm text-slate-500">{t('myClass.historyHint')}</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {history.map((c) => (
                  <li key={c.id}>
                    <Link href={`/my-class/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">{t('teacher', { name: c.teacherName })}</div>
                      </div>
                      {c.status === 'ARCHIVED' ? (
                        <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">{t('archived')}</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">{t('myClass.left')}</Badge>
                      )}
                      <span className="text-sm whitespace-nowrap text-ink-600">{t('myClass.review')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6 self-start">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t('myClass.join')}</h2>
            <JoinClassForm onSent={() => requests.reload()} />
          </Card>
          {reqs.length > 0 && (
            <Card>
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">{t('myClass.requests')}</h2>
              </div>
              <MyRequestList requests={reqs} onChange={refresh} />
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}
