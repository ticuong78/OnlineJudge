'use client';

import type { ClassroomDto } from '@oj/contracts';
import {
  ArrowRight,
  Dumbbell,
  FilePlus2,
  FileUp,
  Hourglass,
  Library,
  NotebookPen,
  PlayCircle,
  School,
  Send,
  ShieldAlert,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Container } from '@/components/app-shell';
import { ClassCode, PendingRequestsBadge } from '@/components/classes';
import { OrganizationInvitationsInbox } from '@/components/organization-invitations';
import { ProgressCells, SessionList } from '@/components/sessions';
import { ThreadList } from '@/components/threads';
import { Card, InlineAlert, LoadingState } from '@/components/ui';
import { api } from '@/lib/api';
import { RoleLabels, useAuth } from '@/lib/auth';
import { splitStudentClasses } from '@/lib/classes';
import { isClosingSoon, solveHref, sortSessions, studentOpenSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import type { LastProblem } from '@/lib/utils';
import { readLastProblem } from '@/lib/last-problem';

interface QuickAction {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}

function PrimaryAction({ a }: { a: QuickAction }) {
  return (
    <Link href={a.href} className="flex items-center gap-4 rounded-panel bg-ink-600 px-5 py-5 text-white transition-colors hover:bg-ink-700">
      <a.icon className="h-7 w-7 shrink-0 text-ink-200" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold">{a.title}</div>
        <p className="truncate text-sm text-ink-100">{a.desc}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-ink-200" aria-hidden="true" />
    </Link>
  );
}

function SecondaryActions({ items }: { items: QuickAction[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.href + a.title} className="border-b border-rule">
          <Link href={a.href} className="flex items-center gap-3 py-3 hover:text-ink-700">
            <a.icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="font-medium">{a.title}</span>
            <span className="truncate text-sm text-slate-500">{a.desc}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MyClasses({ classes, isAdmin }: { classes: ClassroomDto[] | undefined; isAdmin: boolean }) {
  const list = [...(classes ?? [])]
    .filter((c) => c.status === 'ACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return (
    <Card className="self-start">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{isAdmin ? 'Các lớp đang học' : 'Lớp của tôi'}</h2>
        <Link href="/classes" className="text-sm text-ink-600 hover:underline">
          {list.length ? 'Xem tất cả' : 'Mở trang lớp'}
        </Link>
      </div>
      {!classes ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <div className="px-5 py-5 text-sm text-slate-600">
          <p>Chưa có lớp nào. Tạo lớp để có mã cho học sinh xin vào lớp và để giao bài.</p>
          <Link
            href="/classes"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-control bg-ink-600 px-4 font-medium text-white hover:bg-ink-700"
          >
            <School className="h-4 w-4" aria-hidden="true" />
            Tạo lớp
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link href={`/classes/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.studentCount} học sinh{isAdmin ? `, GV ${c.teacherName}` : ''}
                  </div>
                  <PendingRequestsBadge count={c.pendingRequestCount} className="mt-1" />
                </div>
                {c.code && <ClassCode code={c.code} size="sm" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StaffHome() {
  const { user } = useAuth();
  const classes = useAsync(() => api.listClasses(), []);
  const sessions = useAsync(() => api.listSessions({ audience: 'CLASS' }), []);
  const isAdmin = user?.role === 'ADMIN';
  const hasNoClass = !!classes.data && classes.data.filter((c) => c.status === 'ACTIVE').length === 0;

  const actions: QuickAction[] = [];
  if (hasNoClass && !isAdmin) {
    actions.push({ href: '/classes', title: 'Tạo lớp đầu tiên', desc: 'Cần có lớp để học sinh xin vào lớp và để giao bài', icon: School });
  } else {
    actions.push({ href: '/bank/sets', title: 'Giao bài', desc: 'Chọn một đề trong ngân hàng rồi bấm “Giao bài”', icon: Send });
  }
  actions.push(
    { href: '/import', title: 'Nhập đề', desc: 'Tải .docx / .pdf, tách thành bài tự động', icon: FileUp },
    { href: '/bank/problems/new', title: 'Tạo bài', desc: 'Soạn đề, test và lời giải', icon: FilePlus2 },
    { href: '/bank', title: 'Ngân hàng', desc: 'Bài và đề của bạn, bài công khai', icon: Library },
    { href: '/practice', title: 'Luyện tập', desc: 'Làm thử các phiên công khai', icon: Dumbbell },
  );
  if (isAdmin) actions.push({ href: '/admin/users', title: 'Người dùng', desc: 'Mời giáo viên', icon: Users });

  const flags = useAsync(() => api.listIntegrityFlags({ status: 'OPEN' }), []);
  const openFlags = flags.data?.length ?? 0;
  const managed = (sessions.data ?? []).filter((s) => s.canManage);
  const open = sortSessions(managed.filter((s) => s.state === 'OPEN'));
  const soon = open.filter((s) => isClosingSoon(s));

  return (
    <>
      <OrganizationInvitationsInbox />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <PrimaryAction a={actions[0]} />
          <SecondaryActions items={actions.slice(1)} />
        </div>
        <div className="space-y-4">
          <MyClasses classes={classes.data ?? (classes.error ? [] : undefined)} isAdmin={isAdmin} />
          {openFlags > 0 && (
            <Link
              href="/integrity"
              className="flex items-center gap-3 rounded-panel border border-amber-200 bg-amber-50 px-5 py-3 text-amber-900 hover:bg-amber-100"
            >
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm">
                <b className="tabular-nums">{openFlags}</b> bài nộp cần xem lại
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <Card className="mt-8">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">{soon.length > 0 ? 'Phiên sắp hết hạn' : 'Phiên đang mở'}</h2>
          {soon.length > 0 && (
            <p className="text-sm text-slate-500">Hạn trong 2 ngày tới. Số đỏ: hơn nửa lớp chưa hoàn thành.</p>
          )}
        </div>
        {sessions.loading && !sessions.data ? (
          <LoadingState />
        ) : (
          <SessionList
            sessions={(soon.length > 0 ? soon : open).slice(0, 8)}
            showAudience
            managerProgress
            emptyTitle="Không có phiên nào đang mở"
            emptyHint="Vào Ngân hàng, chọn một đề rồi bấm “Giao bài”."
          />
        )}
      </Card>
    </>
  );
}

function StudentHome() {
  const { user } = useAuth();
  const classes = useAsync(() => api.listClasses(), []);
  const sessions = useAsync(() => api.listSessions(), []);
  const progress = useAsync(() => api.myProgress(), []);
  const [remembered, setRemembered] = useState<LastProblem | null>(null);
  useEffect(() => {
    if (user) setRemembered(readLastProblem(user.id));
  }, [user]);
  // Offered only while that session is still open for this student (K-2); otherwise the next open session.
  const last = remembered && sessions.data?.some((s) => s.id === remembered.sessionId && s.state === 'OPEN' && s.canSubmit) ? remembered : null;

  const requests = useAsync(() => api.myMembershipRequests(), []);
  const current = splitStudentClasses(classes.data ?? []).current;
  const pending = (requests.data ?? []).filter((r) => r.status === 'PENDING');
  // Timed exams waiting for "Bắt đầu làm bài" are listed first and take the main card (OJ-11).
  const open = studentOpenSessions(sessions.data ?? []);
  const exam = open.find((s) => s.needsStart);
  const nextUp = open[0];

  const primary: QuickAction = exam
    ? { href: `/sessions/${exam.id}`, title: 'Vào thi', desc: `${exam.title}: ${exam.settings.durationMinutes ?? ''} phút từ lúc bấm bắt đầu`, icon: Timer }
    : last
    ? { href: solveHref(last.sessionId, last.key), title: 'Làm tiếp', desc: `${last.title}${last.sessionTitle ? `, ${last.sessionTitle}` : ''}`, icon: PlayCircle }
    : nextUp
      ? { href: `/sessions/${nextUp.id}`, title: 'Làm bài', desc: nextUp.title, icon: PlayCircle }
      : { href: '/practice', title: 'Luyện tập', desc: 'Làm các bài công khai', icon: Dumbbell };

  const t = progress.data?.totals;
  // Latest announcements across all current classes.
  const currentIds = current.map((c) => c.id).join(',');
  const announcements = useAsync(async () => {
    const lists = await Promise.all(current.map((c) => api.listThreads(c.id)));
    return lists
      .flat()
      .filter((x) => x.kind === 'ANNOUNCEMENT')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
  }, [currentIds]);
  const boardHref = current.length === 1 ? `/my-class/${current[0].id}` : '/my-class';

  return (
    <>
      <div className="mb-6">
        {classes.loading && !classes.data ? null : current.length > 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {current.map((c) => (
              <span key={c.id}>
                Lớp{' '}
                <Link href={`/my-class/${c.id}`} className="font-semibold text-slate-900 hover:text-ink-700">
                  {c.name}
                </Link>
                , giáo viên {c.teacherName}
              </span>
            ))}
          </p>
        ) : (
          pending.length === 0 && (
            <InlineAlert kind="info">
              Bạn chưa vào lớp nào. Có mã lớp thì vào{' '}
              <Link href="/my-class" className="font-medium underline">
                Lớp của tôi
              </Link>{' '}
              để xin vào lớp; trong lúc đó vẫn luyện tập được các bài công khai.
            </InlineAlert>
          )
        )}
        {pending.length > 0 && (
          <Link
            href="/my-class"
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-panel border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              Đang chờ giáo viên duyệt:{' '}
              {pending.map((r) => `${r.kind === 'JOIN' ? 'vào' : 'rời'} lớp ${r.className}`).join('; ')}
            </span>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <PrimaryAction a={primary} />
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Bài đang mở</h2>
              <Link href="/my-class" className="text-sm text-ink-600 hover:underline">
                Lớp của tôi
              </Link>
            </div>
            {sessions.loading && !sessions.data ? (
              <LoadingState />
            ) : (
              <SessionList
                sessions={open.slice(0, 6)}
                showAudience
                emptyTitle="Không còn bài nào đang chờ bạn"
                emptyHint={
                  <Link href="/practice" className="text-ink-600 hover:underline">
                    Vào Luyện tập để làm thêm
                  </Link>
                }
              />
            )}
          </Card>
        </div>
        <div className="space-y-4 self-start">
        {current.length > 0 && announcements.data && announcements.data.length > 0 && (
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Thông báo của lớp</h2>
              <Link href={boardHref} className="text-sm text-ink-600 hover:underline">
                Bảng tin
              </Link>
            </div>
            <ThreadList threads={announcements.data} compact />
          </Card>
        )}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Học bạ</h2>
            <Link href="/progress" className="text-sm text-ink-600 hover:underline">
              Mở học bạ
            </Link>
          </div>
          {!t ? (
            <LoadingState />
          ) : (
            <>
              <p className="mt-3 text-slate-700">
                Đã giải <span className="mx-1 font-hand text-4xl leading-none text-chalk-700">{t.solvedProblems}</span> bài
              </p>
              <p className="mt-1 text-slate-700">
                Hoàn thành <span className="mx-1 font-hand text-4xl leading-none text-chalk-700">{t.completedSessions}</span> /{' '}
                {t.startedSessions} phiên
              </p>
              <div className="mt-3">
                <ProgressCells total={Math.min(40, Math.max(t.solvedProblems, 10))} solved={Math.min(40, t.solvedProblems)} />
              </div>
              <Link href="/progress" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-ink-600 hover:underline">
                <NotebookPen className="h-4 w-4" aria-hidden="true" />
                Xem từng bài đã giải
              </Link>
            </>
          )}
        </Card>
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  const { user, isStaff } = useAuth();
  if (!user) return null;
  return (
    <Container>
      <div className="mb-4">
        <h1 className="text-[1.75rem] leading-tight font-bold text-slate-900">Xin chào, {user.displayName}</h1>
        {isStaff && <p className="text-sm text-slate-500">{RoleLabels[user.role]}</p>}
      </div>
      {isStaff ? <StaffHome /> : <StudentHome />}
    </Container>
  );
}
