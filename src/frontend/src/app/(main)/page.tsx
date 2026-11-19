'use client';

import { AWAITING_QUESTIONS_LIMIT, type ClassroomDto } from '@oj/contracts';
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
import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslations } from 'use-intl';
import { usePageTitle } from '@/lib/page-title';
import { Container } from '@/components/app-shell';
import type { Messages } from '@/i18n/messages';
import { ClassCode, PendingRequestsBadge } from '@/components/classes';
import { OrganizationInvitationsInbox } from '@/components/organization-invitations';
import { AssignFromBankDialog, ProgressCells, SessionList } from '@/components/sessions';
import { ThreadList } from '@/components/threads';
import { Card, InlineAlert, ListSkeleton, Modal, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { splitStudentClasses } from '@/lib/classes';
import { assignEntry } from '@/lib/home-actions';
import { isClosingSoon, solveHref, sortSessions, studentOpenSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import type { LastProblem } from '@/lib/utils';
import { readLastProblem } from '@/lib/last-problem';
import { AiUsageCard } from '@/components/ai-access';

interface QuickAction {
  href: string;
  /** When set, the card is a button that runs this instead of a link (OJ-33: assign opens a dialog). */
  onClick?: () => void;
  title: string;
  desc: string;
  icon: LucideIcon;
}

function PrimaryAction({ a, buttonRef }: { a: QuickAction; buttonRef?: Ref<HTMLButtonElement> }) {
  const className =
    'flex w-full items-center gap-4 rounded-panel bg-ink-solid px-5 py-5 text-left text-white transition-colors hover:bg-ink-solid-hover';
  const body = (
    <>
      <a.icon className="h-7 w-7 shrink-0 text-ink-200" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold">{a.title}</div>
        <p className="truncate text-sm text-white/90">{a.desc}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-ink-200" aria-hidden="true" />
    </>
  );
  return a.onClick ? (
    <button ref={buttonRef} type="button" onClick={a.onClick} className={className} aria-haspopup="dialog">
      {body}
    </button>
  ) : (
    <Link href={a.href} className={className}>
      {body}
    </Link>
  );
}

/** "Giao cho lớp nào?": the first step of assigning from the home page when the teacher has several classes (OJ-33). */
function ClassPickerDialog({
  open,
  classes,
  onPick,
  onClose,
}: {
  open: boolean;
  classes: ClassroomDto[];
  onPick: (classId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('student.staffHome');
  return (
    <Modal open={open} onClose={onClose} title={t('pickClass')}>
      <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-control border border-rule">
        {classes.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
            >
              <School className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <span className="shrink-0 text-sm whitespace-nowrap text-slate-500">{t('classMeta', { count: c.studentCount })}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Holds the main card's place until the data that decides it has loaded (OJ-16). Drawing a fallback first ("Luyện
 * tập") and then switching to "Vào thi" moved the button under the student's finger.
 */
function PrimaryActionSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-panel bg-ink-solid px-5 py-5" role="status" aria-busy="true">
      <span className="h-7 w-7 shrink-0 rounded-full bg-white/20" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
        <span className="block h-5 w-32 animate-pulse rounded-control bg-white/20" />
        <span className="block h-3.5 w-56 max-w-full animate-pulse rounded-control bg-white/15" />
      </div>
    </div>
  );
}

function SecondaryActions({ items }: { items: QuickAction[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.href + a.title} className="border-b border-rule">
          {/* The hint goes under the title and may wrap: cut to one line at laptop widths it lost its meaning (U1). */}
          <Link href={a.href} className="flex items-start gap-3 py-3 hover:text-ink-700">
            <a.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">{a.title}</span>
              <span className="block text-sm text-slate-500">{a.desc}</span>
            </span>
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
  const t = useTranslations('student.staffHome');
  return (
    <Card className="self-start">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="min-w-0 font-semibold">{isAdmin ? t('classesAdmin') : t('classes')}</h2>
        <Link href="/classes" className="-my-1 inline-flex min-h-7 shrink-0 items-center text-sm whitespace-nowrap text-ink-600 hover:underline">
          {list.length ? t('viewAll') : t('openClasses')}
        </Link>
      </div>
      {!classes ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <div className="px-5 py-5 text-sm text-slate-600">
          <p>{t('noClass')}</p>
          <Link
            href="/classes?create=1"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-control bg-ink-solid px-4 font-medium text-white hover:bg-ink-solid-hover"
          >
            <School className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('createClass')}
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
                    {isAdmin
                      ? t('classMetaAdmin', { count: c.studentCount, teacher: c.teacherName })
                      : t('classMeta', { count: c.studentCount })}
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

/**
 * Students' questions no teacher has answered yet, across the classes this teacher runs (UAT M8): without this a
 * question was only found by opening each class. One request; the backend scopes it to the caller's classes.
 */
function QuestionsToAnswer() {
  const t = useTranslations('student.staffHome');
  const questions = useAsync(() => api.awaitingThreads(), []);
  const list = questions.data ?? [];
  if (list.length === 0) return null;
  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">
          {list.length >= AWAITING_QUESTIONS_LIMIT
            ? t('questionsTitleMany', { count: AWAITING_QUESTIONS_LIMIT })
            : t('questionsTitle', { count: list.length })}
        </h2>
        <p className="text-sm text-slate-500">{t('questionsHint')}</p>
      </div>
      <ThreadList threads={list.slice(0, 5)} compact />
    </Card>
  );
}

function StaffHome() {
  const { user } = useAuth();
  const classes = useAsync(() => api.listClasses(), []);
  const sessions = useAsync(() => api.listSessions({ audience: 'CLASS' }), []);
  const isAdmin = user?.role === 'ADMIN';
  const activeClasses = (classes.data ?? []).filter((c) => c.status === 'ACTIVE');
  const entry = assignEntry(classes.data, isAdmin);
  // Assigning from home: pick the class (when there are several), then the bank dialog the class page uses (OJ-33).
  const [picking, setPicking] = useState(false);
  const [assignClassId, setAssignClassId] = useState<string | null>(null);
  // The dialog that opened the assign dialog (the class picker) is gone by the time it closes, so focus would be lost:
  // hand it back to "Giao bài" ourselves.
  const assignButton = useRef<HTMLButtonElement>(null);
  const t = useTranslations('student.staffHome');
  const action = (key: keyof Messages['student']['staffHome']['actions'], href: string, icon: LucideIcon): QuickAction => ({
    href,
    title: t(`actions.${key}.title`),
    desc: t(`actions.${key}.desc`),
    icon,
  });

  const actions: QuickAction[] = [];
  if (entry.kind === 'firstClass') {
    actions.push(action('firstClass', '/classes?create=1', School));
  } else if (entry.kind === 'bank') {
    actions.push(action('assignBank', '/bank/sets', Send));
  } else {
    actions.push({
      ...action('assign', '/bank/sets', Send),
      onClick: () => (entry.kind === 'class' ? setAssignClassId(entry.classId) : setPicking(true)),
    });
  }
  actions.push(
    action('import', '/import', FileUp),
    action('createProblem', '/bank/problems/new', FilePlus2),
    action('bank', '/bank', Library),
    action('practice', '/practice', Dumbbell),
  );
  if (isAdmin) actions.push(action('users', '/admin/users', Users));

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
          {classes.data || classes.error ? <PrimaryAction a={actions[0]} buttonRef={assignButton} /> : <PrimaryActionSkeleton />}
          <SecondaryActions items={actions.slice(1)} />
          {/* In the left column (U1): below the full-width grid it left an empty band under the short action list. */}
          <Card className="mt-2">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">{soon.length > 0 ? t('closingSoon') : t('openSessions')}</h2>
              {soon.length > 0 && (
                <p className="text-sm text-slate-500">{t('closingSoonHint')}</p>
              )}
            </div>
            {sessions.loading && !sessions.data ? (
              <ListSkeleton />
            ) : (
              <SessionList
                sessions={(soon.length > 0 ? soon : open).slice(0, 8)}
                showAudience
                managerProgress
                emptyTitle={t('emptyTitle')}
                emptyHint={t(entry.kind === 'firstClass' ? 'emptyHintNoClass' : entry.kind === 'bank' ? 'emptyHintBank' : 'emptyHint')}
              />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <MyClasses classes={classes.data ?? (classes.error ? [] : undefined)} isAdmin={isAdmin} />
          <QuestionsToAnswer />
          <AiUsageCard />
          {openFlags > 0 && (
            <Link
              href="/integrity"
              className="flex items-center gap-3 rounded-panel border border-amber-200 bg-amber-50 px-5 py-3 text-amber-900 hover:bg-amber-100"
            >
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm">
                {t.rich('flagsToReview', { count: openFlags, b: (c) => <b className="tabular-nums">{c}</b> })}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <ClassPickerDialog
        open={picking}
        classes={activeClasses}
        onClose={() => setPicking(false)}
        onPick={(classId) => {
          setPicking(false);
          setAssignClassId(classId);
        }}
      />
      {assignClassId && (
        <AssignFromBankDialog
          open
          onClose={() => {
            setAssignClassId(null);
            requestAnimationFrame(() => assignButton.current?.focus());
          }}
          classId={assignClassId}
        />
      )}
    </>
  );
}

function StudentHome() {
  const { user } = useAuth();
  const t = useTranslations('student.studentHome');
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
    ? {
        href: `/sessions/${exam.id}`,
        title: t('exam'),
        desc:
          exam.settings.durationMinutes != null
            ? t('examDesc', { title: exam.title, minutes: exam.settings.durationMinutes })
            : exam.title,
        icon: Timer,
      }
    : last
    ? { href: solveHref(last.sessionId, last.key), title: t('continue'), desc: `${last.title}${last.sessionTitle ? `, ${last.sessionTitle}` : ''}`, icon: PlayCircle }
    : nextUp
      ? { href: `/sessions/${nextUp.id}`, title: t('solve'), desc: nextUp.title, icon: PlayCircle }
      : { href: '/practice', title: t('practice'), desc: t('practiceDesc'), icon: Dumbbell };

  const totals = progress.data?.totals;
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
        {classes.loading && !classes.data ? (
          // Holds the class line's place so the main card below does not jump down when it arrives (OJ-16).
          <Skeleton className="h-4 w-72 max-w-full" />
        ) : current.length > 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {current.map((c) => (
              <span key={c.id}>
                {t.rich('classLine', {
                  name: c.name,
                  teacher: c.teacherName,
                  link: (chunks) => (
                    <Link href={`/my-class/${c.id}`} className="font-semibold text-slate-900 hover:text-ink-700">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            ))}
          </p>
        ) : (
          pending.length === 0 && (
            <InlineAlert kind="info">
              {t.rich('noClass', {
                link: (chunks) => (
                  <Link href="/my-class" className="font-medium underline">
                    {chunks}
                  </Link>
                ),
              })}
            </InlineAlert>
          )
        )}
        {pending.length > 0 && (
          <Link
            href="/my-class"
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-panel border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {t('pending', {
                list: pending
                  .map((r) => t(r.kind === 'JOIN' ? 'pendingJoin' : 'pendingLeave', { name: r.className }))
                  .join('; '),
              })}
            </span>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {sessions.data || sessions.error ? <PrimaryAction a={primary} /> : <PrimaryActionSkeleton />}
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <h2 className="min-w-0 font-semibold">{t('openWork')}</h2>
              <Link href="/my-class" className="-my-1 inline-flex min-h-7 shrink-0 items-center text-sm whitespace-nowrap text-ink-600 hover:underline">
                {t('myClass')}
              </Link>
            </div>
            {sessions.loading && !sessions.data ? (
              <ListSkeleton />
            ) : (
              <SessionList
                sessions={open.slice(0, 6)}
                showAudience
                emptyTitle={t('emptyTitle')}
                emptyHint={
                  <Link href="/practice" className="text-ink-600 hover:underline">
                    {t('emptyHint')}
                  </Link>
                }
              />
            )}
          </Card>
        </div>
        <div className="space-y-4 self-start">
        {current.length > 0 && announcements.data && announcements.data.length > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <h2 className="min-w-0 font-semibold">{t('announcements')}</h2>
              <Link href={boardHref} className="-my-1 inline-flex min-h-7 shrink-0 items-center text-sm whitespace-nowrap text-ink-600 hover:underline">
                {t('board')}
              </Link>
            </div>
            <ThreadList threads={announcements.data} compact />
          </Card>
        )}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 font-semibold">{t('progress')}</h2>
            <Link href="/progress" className="-my-1 inline-flex min-h-7 shrink-0 items-center text-sm whitespace-nowrap text-ink-600 hover:underline">
              {t('openProgress')}
            </Link>
          </div>
          {!totals ? (
            <ListSkeleton rows={2} className="-mx-5 mt-2" />
          ) : (
            <>
              <p className="mt-3 text-slate-700">
                {t.rich('solved', {
                  count: totals.solvedProblems,
                  n: (c) => <span className="mx-1 font-hand text-4xl leading-none text-chalk-700">{c}</span>,
                })}
              </p>
              <p className="mt-1 text-slate-700">
                {t.rich('completed', {
                  done: totals.completedSessions,
                  started: totals.startedSessions,
                  n: (c) => <span className="mx-1 font-hand text-4xl leading-none text-chalk-700">{c}</span>,
                })}
              </p>
              <div className="mt-3">
                <ProgressCells
                  total={Math.min(40, Math.max(totals.solvedProblems, 10))}
                  solved={Math.min(40, totals.solvedProblems)}
                />
              </div>
              <Link href="/progress" className="mt-4 inline-flex min-h-7 items-center gap-1 text-sm font-medium text-ink-600 hover:underline">
                <NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('viewSolved')}
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
  usePageTitle(useTranslations('shell.nav')('home'));
  const t = useTranslations('student.home');
  const tr = useTranslations('enums.role');
  if (!user) return null;
  return (
    <Container>
      <div className="mb-6">
        <h1 className="text-[1.75rem] leading-tight font-bold text-slate-900">{t('greeting', { name: user.displayName })}</h1>
        {isStaff && <p className="text-sm text-slate-500">{tr(user.role)}</p>}
      </div>
      {isStaff ? <StaffHome /> : <StudentHome />}
    </Container>
  );
}
