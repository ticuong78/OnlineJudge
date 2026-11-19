'use client';

import type { ClassroomDto } from '@oj/contracts';
import { Archive, ArchiveRestore, ChevronDown, Pencil, Send, Trash2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { ClassCode, ClassCodeInput, MoveStudentControl, TeacherSelect } from '@/components/classes';
import { AddStudentForm, ClassRequestsPanel, RemoveStudentButton } from '@/components/membership';
import { ClassGradebook } from '@/components/gradebook';
import { RequireRole, STAFF } from '@/components/guards';
import { AssignFromBankDialog, SessionList } from '@/components/sessions';
import { ClassBoard } from '@/components/threads';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, ConfirmDialog, CountBadge, EmptyState, ErrorState, Field, InlineAlert, inputClass, ListSkeleton, Modal, PageHeader, PageSkeleton, Tabs, type TabChangeSource } from '@/components/ui';
import { useNow } from '@/components/verification';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { classTab, classTabHref, type ClassTab } from '@/lib/class-tabs';
import { CLASS_CODE_RE } from '@/lib/classes';
import { formatRemaining, sortSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

function ClassHeader({
  cls,
  onSaved,
  details,
  onToggleDetails,
}: {
  cls: ClassroomDto;
  onSaved: (c: ClassroomDto) => void;
  /** Phones only: whether the class details and settings are shown. From sm up they always are. */
  details: boolean;
  onToggleDetails: () => void;
}) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const myOrganizations = user?.organizations ?? [];
  // OJ-8: org admins hand an organization class to another member of the organization.
  const orgAdminOfClass = !isAdmin && !!cls.organization && myOrganizations.some((o) => o.organizationId === cls.organization!.id && o.role === 'ADMIN');
  const orgMembers = useAsync(
    () => (editing && orgAdminOfClass ? api.getOrganization(cls.organization!.id).then((o) => o.members) : Promise.resolve([])),
    [editing, orgAdminOfClass, cls.organization?.id],
  );
  const [name, setName] = useState(cls.name);
  const [code, setCode] = useState(cls.code ?? '');
  const [teacherId, setTeacherId] = useState(cls.teacherId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setName(cls.name);
    setCode(cls.code ?? '');
    setTeacherId(cls.teacherId);
    setError(null);
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('detail.header.nameRequired'));
    if (!CLASS_CODE_RE.test(code)) return setError(t('code.invalid'));
    setSaving(true);
    try {
      const c = await api.updateClass(cls.id, { name: name.trim(), code, ...(isAdmin || orgAdminOfClass ? { teacherId } : {}) });
      onSaved(c);
      setEditing(false);
      toast.success(t('form.saved'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Card className="mb-6 p-5">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('form.nameLabel')}>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('code.label')} hint={t('detail.header.codeChangeHint')}>
              <ClassCodeInput value={code} onChange={setCode} name={name} />
            </Field>
            {isAdmin && (
              <Field label={t('form.teacherLabel')}>
                <TeacherSelect value={teacherId} onChange={setTeacherId} />
              </Field>
            )}
            {orgAdminOfClass && (
              <Field label={t('form.teacherLabel')} hint={t('detail.header.orgTeacherHint', { org: cls.organization!.name })}>
                <select className={inputClass} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {(orgMembers.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                  {!orgMembers.data?.some((m) => m.userId === teacherId) && <option value={teacherId}>{cls.teacherName}</option>}
                </select>
              </Field>
            )}
          </div>
          {error && <InlineAlert>{error}</InlineAlert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>
              {t('form.save')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  // On a phone the card shows only the code (the size is on the Học sinh tab), so the tabs and their content start on
  // the first screen (OJ-32 UX review); the rest opens with "Chi tiết lớp".
  const hideOnPhone = details ? '' : 'hidden sm:flex';
  const toggle = (
    <button
      type="button"
      onClick={onToggleDetails}
      aria-expanded={details}
      aria-controls="class-details"
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50 sm:hidden"
    >
      {t('detail.header.details')}
      <ChevronDown className={cn('h-4 w-4 transition-transform', details && 'rotate-180')} />
    </button>
  );
  return (
    <>
    {/* Phones with the details closed (OJ-34): one line with a small code chip instead of the card, which took about a
        third of the first screen. The big code is in the card under "Chi tiết lớp", and always from sm up. */}
    {!details && (
      <div className="mb-4 flex items-center gap-2 sm:hidden">
        <span className="text-sm text-slate-500">{t('code.label')}</span>
        {cls.code ? <ClassCode code={cls.code} size="sm" /> : <span className="text-slate-400">—</span>}
        <span className="ml-auto">{toggle}</span>
      </div>
    )}
    <Card className={cn('mb-6 flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5', details ? 'flex' : 'hidden sm:flex')}>
      <div className="flex w-full items-end justify-between gap-3 sm:w-auto">
        <div>
          <div className="mb-1 text-sm text-slate-500">{t('detail.header.codeCaption')}</div>
          {cls.code ? <ClassCode code={cls.code} size="lg" /> : <span className="text-slate-400">—</span>}
        </div>
        {toggle}
      </div>
      <dl
        id="class-details"
        className={cn('grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&_dt]:whitespace-nowrap', !details && 'hidden sm:grid')}
      >
        <dt className="text-slate-500">{t('detail.header.teacher')}</dt>
        <dd className="font-medium">{cls.teacherName}</dd>
        <dt className="text-slate-500">{t('detail.header.owner')}</dt>
        <dd className="font-medium">{cls.organization ? cls.organization.name : t('detail.header.personal')}</dd>
        <dt className="text-slate-500">{t('detail.header.size')}</dt>
        <dd className="font-medium">{t('studentCount', { count: cls.studentCount })}</dd>
        <dt className="text-slate-500">{t('createdOnLabel')}</dt>
        <dd>{formatDate(cls.createdAt)}</dd>
      </dl>
      {cls.status === 'ACTIVE' && (
        <div className={cn('ml-auto flex-wrap items-center gap-2', details ? 'flex' : hideOnPhone)}>
          {!cls.organization && cls.teacherId === user?.id && myOrganizations.length > 0 && (
            <MoveToOrganization cls={cls} onMoved={onSaved} />
          )}
          <ArchiveClassButton cls={cls} onChange={onSaved} />
          <Button variant="secondary" onClick={start}>
            <Pencil className="h-4 w-4 shrink-0" />
            <span>{t('detail.header.edit')}</span>
          </Button>
        </div>
      )}
    </Card>
    </>
  );
}

/** A personal class joins one of the teacher's organizations (one way: it cannot be taken out again). */
function MoveToOrganization({ cls, onMoved }: { cls: ClassroomDto; onMoved: (c: ClassroomDto) => void }) {
  const t = useTranslations('classes.detail.moveOrg');
  const { user } = useAuth();
  const toast = useToast();
  const orgs = user?.organizations ?? [];
  const [target, setTarget] = useState(orgs[0]?.organizationId ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = orgs.find((o) => o.organizationId === target)?.organizationName ?? '';
  const move = async () => {
    setBusy(true);
    try {
      onMoved(await api.moveClassToOrganization(cls.id, target));
      toast.success(t('moved', { org: name }));
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <select className={cn(inputClass, 'w-auto max-w-full min-w-0 py-1.5')} value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('label')}>
        {orgs.map((o) => (
          <option key={o.organizationId} value={o.organizationId}>
            {o.organizationName}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        <span>{t('button')}</span>
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t('title')}
        confirmLabel={t('button')}
        danger={false}
        loading={busy}
        onClose={() => setConfirming(false)}
        onConfirm={move}
        message={
          <div className="space-y-2 text-sm">
            <p>{t('body', { name: cls.name, org: name })}</p>
            <p>{t('oneWay')}</p>
          </div>
        }
      />
    </>
  );
}

function Roster({
  cls,
  refreshKey,
  onCountChange,
}: {
  cls: ClassroomDto;
  /** Bumped when a request is approved elsewhere on the page, so the list reloads. */
  refreshKey: number;
  onCountChange: (delta: number) => void;
}) {
  const t = useTranslations('classes');
  const { data, error, loading, reload, setData } = useAsync(() => api.listClassStudents(cls.id), [cls.id, refreshKey]);
  const archived = cls.status === 'ARCHIVED';
  const classes = useAsync(() => api.listClasses(), []);
  const students = [...(data ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

  return (
    <Card className="mb-6">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{t('detail.roster.title')}</h2>
        {data && <span className="text-sm whitespace-nowrap text-slate-500">{t('studentCount', { count: data.length })}</span>}
      </div>
      {archived ? (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
          {t('detail.roster.archivedNote')}
        </p>
      ) : (
        <AddStudentForm
          classId={cls.id}
          onAdded={(st) => {
            setData((prev) => [...(prev ?? []).filter((x) => x.userId !== st.userId), st]);
            onCountChange(1);
          }}
        />
      )}
      {loading && !data ? (
        <ListSkeleton />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : students.length === 0 ? (
        <EmptyState title={t('detail.roster.emptyTitle')}>
          {cls.status === 'ACTIVE' ? (
            t.rich('detail.roster.emptyActive', { code: cls.code ?? '', b: (c) => <b>{c}</b> })
          ) : (
            t('detail.roster.emptyArchived')
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{t('columns.name')}</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">{t('columns.email')}</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">{t('columns.phone')}</th>
                <th className="hidden px-4 py-2.5 md:table-cell">{t('columns.enrolledAt')}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{s.displayName}</div>
                    {/* Phones: email and phone sit under the name instead of in their own columns. */}
                    <div className="text-xs break-all text-slate-500 sm:hidden">{s.email}</div>
                    {s.phone && (
                      <a href={`tel:${s.phone}`} className="text-xs text-slate-500 tabular-nums sm:hidden">
                        {s.phone}
                      </a>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-slate-600 sm:table-cell">{s.email}</td>
                  <td className="hidden px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums sm:table-cell">
                    {s.phone ? (
                      <a href={`tel:${s.phone}`} className="hover:text-ink-700">
                        {s.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 whitespace-nowrap text-slate-500 md:table-cell">{formatDate(s.enrolledAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!archived && (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <MoveStudentControl
                          studentId={s.userId}
                          excludeClassId={cls.id}
                          classes={(classes.data ?? []).filter((c) => c.status === 'ACTIVE')}
                          onMoved={() => undefined}
                        />
                        <RemoveStudentButton
                          cls={cls}
                          student={s}
                          onRemoved={() => {
                            setData((prev) => (prev ?? []).filter((x) => x.userId !== s.userId));
                            onCountChange(-1);
                          }}
                        />
                      </span>
                    )}
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

function ClassSessions({ cls }: { cls: ClassroomDto }) {
  const t = useTranslations('classes.detail.sessions');
  const { data, error, loading, reload } = useAsync(() => api.listSessions({ classId: cls.id }), [cls.id]);
  const [assigning, setAssigning] = useState(false);
  const archived = cls.status === 'ARCHIVED';
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{t('title')}</h2>
        {!archived && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            <Send className="h-4 w-4 shrink-0" />
            {t('assign')}
          </Button>
        )}
      </div>
      {loading && !data ? (
        <ListSkeleton />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <SessionList
          sessions={sortSessions(data ?? [])}
          managerProgress
          emptyTitle={t('emptyTitle')}
          emptyHint={archived ? undefined : t('emptyHint')}
        />
      )}
      <AssignFromBankDialog open={assigning} onClose={() => setAssigning(false)} classId={cls.id} />
    </Card>
  );
}

/** "Lưu trữ lớp" with its confirm dialog, in the class card's actions (OJ-35). */
function ArchiveClassButton({ cls, onChange }: { cls: ClassroomDto; onChange: (c: ClassroomDto) => void }) {
  const t = useTranslations('classes.detail.lifecycle');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const archive = async () => {
    setBusy(true);
    try {
      onChange(await api.archiveClass(cls.id));
      toast.success(t('archived'));
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4 shrink-0" />
        {t('archive')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('archiveTitle')}
        danger={false}
        confirmLabel={t('archive')}
        loading={busy}
        message={
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('archiveReadOnly')}</li>
            <li>{t('archiveRequests')}</li>
            <li>{t('archiveHistory')}</li>
            <li>{t('archiveRestore')}</li>
          </ul>
        }
        onConfirm={archive}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function LifecycleBar({ cls, onChange }: { cls: ClassroomDto; onChange: (c: ClassroomDto) => void }) {
  const t = useTranslations('classes.detail.lifecycle');
  const tc = useTranslations('common');
  const tk = useTranslations('classes');
  const { user, isAdmin } = useAuth();
  // Org admins archive and restore organization classes but do not delete them (OJ-8).
  const canDelete = isAdmin || cls.teacherId === user?.id;
  const toast = useToast();
  const router = useRouter();
  const now = useNow(60_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState('30');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<ClassroomDto>, msg: string) => {
    setBusy(key);
    try {
      onChange(await fn());
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const deleteNow = async () => {
    setBusy('delete');
    setDeleteError(null);
    try {
      await api.deleteClassNow(cls.id, { confirmName });
      toast.success(t('deleted', { name: cls.name }));
      router.replace('/classes');
    } catch (e) {
      setDeleteError(errorMessage(e));
      setBusy(null);
    }
  };

  // An active class shows its status under the title and "Lưu trữ lớp" in the class card (OJ-35): one box before the
  // tabs instead of two. The archived panel stays: it holds the deletion schedule and is a warning.
  if (cls.status === 'ACTIVE') return null;

  const purgeIn = cls.purgeAt ? new Date(cls.purgeAt).getTime() - now : null;
  return (
    <div className="mb-6 space-y-3 rounded-panel border border-amber-200 bg-amber-50/60 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">{tk('archivedBadge')}</Badge>
        <span className="min-w-0 flex-1 basis-56 text-sm text-amber-900">
          {cls.archivedAt ? t('archivedNoteSince', { date: formatDate(cls.archivedAt) }) : t('archivedNote')}
        </span>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'restore'}
          onClick={() => run('restore', () => api.restoreClass(cls.id), t('restored'))}
        >
          <ArchiveRestore className="h-4 w-4 shrink-0" />
          {t('restore')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 pt-3 text-sm">
        {cls.purgeAt ? (
          <>
            <span className="font-medium text-mark-700">
              {t('purgeAt', { date: formatDateTime(cls.purgeAt) })}
              {purgeIn !== null && purgeIn > 0 ? `, ${formatRemaining(purgeIn)}` : ''}
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'cancel'}
              onClick={() => run('cancel', () => api.cancelClassDeletion(cls.id), t('purgeCancelled'))}
            >
              {t('cancelPurge')}
            </Button>
          </>
        ) : !canDelete ? (
          <span className="text-slate-600">{t('cannotDelete')}</span>
        ) : (
          <>
            <label className="flex items-center gap-2 whitespace-nowrap">
              {t('scheduleBefore')}
              <input
                type="number"
                min={1}
                max={365}
                className={cn(inputClass, 'w-20 py-1')}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              {t('scheduleAfter')}
            </label>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'schedule'}
              onClick={() => {
                const n = Math.round(Number(days));
                if (!(n >= 1 && n <= 365)) return toast.error(t('daysInvalid'));
                run('schedule', () => api.scheduleClassDeletion(cls.id, n), t('scheduled', { days: n }));
              }}
            >
              {t('schedule')}
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-mark-600 hover:bg-mark-50"
            onClick={() => {
              setConfirmName('');
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>{t('deleteNow')}</span>
          </Button>
        )}
      </div>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={busy === 'delete'}>
              {tc('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={deleteNow}
              loading={busy === 'delete'}
              disabled={confirmName.trim() !== cls.name}
            >
              {t('deleteConfirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>{t.rich('deleteBody', { name: cls.name, b: (c) => <b>{c}</b> })}</p>
          <Field label={t('deleteTypeName', { name: cls.name })}>
            <input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoFocus />
          </Field>
          {deleteError && <InlineAlert>{deleteError}</InlineAlert>}
        </div>
      </Modal>
    </div>
  );
}

/** Height of the sticky app header (h-14), where the class tabs stick. */
const APP_HEADER_PX = 56;

export default function ClassDetailPage() {
  // Suspense: the page reads the search params, which Next.js wants inside a boundary.
  return (
    <Suspense
      fallback={
        <Container>
          <PageSkeleton inset />
        </Container>
      }
    >
      <ClassDetailRoute />
    </Suspense>
  );
}

/** Keyed by the class id, so the badges and the gradebook never carry over from the class opened before. */
function ClassDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ClassDetail key={id} id={id} />;
}

function ClassDetail({ id }: { id: string }) {
  const router = useRouter();
  // The selected tab follows the URL (shared links, Back and Forward) but changes at once on a click or key press:
  // the router updates the URL a moment later, and fast arrow presses must not read the old tab in between.
  const urlTab = classTab(useSearchParams().get('tab'));
  const [tab, setTab] = useState<ClassTab>(urlTab);
  const [lastUrlTab, setLastUrlTab] = useState<ClassTab>(urlTab);
  if (urlTab !== lastUrlTab) {
    setLastUrlTab(urlTab);
    setTab(urlTab);
  }
  const { data: cls, error, loading, reload, setData } = useAsync(() => api.getClass(id), [id]);
  const [rosterKey, setRosterKey] = useState(0);
  const [requests, setRequests] = useState(0);
  const [questions, setQuestions] = useState(0);
  // The gradebook loads on first visit and then stays mounted, so its filter survives switching tabs.
  const [gradebookSeen, setGradebookSeen] = useState(tab === 'gradebook');
  const t = useTranslations('classes.detail');
  const tt = useTranslations('classes.detail.tabs');
  const [details, setDetails] = useState(false);
  const tabsAnchor = useRef<HTMLDivElement>(null);

  // The URL holds the tab so it can be shared (OJ-32). A click adds a history entry, so Back returns to the previous tab;
  // arrow keys replace it, so Back does not walk through every tab passed over.
  const select = useCallback(
    (next: ClassTab, source: TabChangeSource) => {
      if (next === tab) return;
      setTab(next);
      if (next === 'gradebook') setGradebookSeen(true);
      const href = classTabHref(id, next);
      if (source === 'keyboard') router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
      // With the tab bar stuck, the new tab would open part-way down; start it right under the tabs instead.
      const anchor = tabsAnchor.current;
      if (anchor) {
        const top = anchor.getBoundingClientRect().top + window.scrollY - APP_HEADER_PX;
        if (window.scrollY > top) window.scrollTo({ top });
      }
    },
    [id, router, tab],
  );
  if (tab === 'gradebook' && !gradebookSeen) setGradebookSeen(true);

  const tabs: { value: ClassTab; label: ReactNode }[] = cls
    ? [
        { value: 'sessions', label: tt('sessions') },
        { value: 'gradebook', label: tt('gradebook') },
        {
          value: 'board',
          label: (
            <>
              {tt('board')}
              <CountBadge count={questions} label={tt('waitingQuestions', { count: questions })} />
            </>
          ),
        },
        {
          value: 'students',
          label: (
            <>
              {tt('students', { count: cls.studentCount })}
              <CountBadge count={requests} label={tt('waitingRequests', { count: requests })} />
            </>
          ),
        },
      ]
    : [];
  const panel = (value: ClassTab, children: ReactNode) => (
    <div role="tabpanel" id={`class-panel-${value}`} aria-labelledby={`class-tab-${value}`} hidden={tab !== value}>
      {children}
    </div>
  );

  return (
    <RequireRole roles={STAFF}>
      {/* Wide on the gradebook, as its own page was (OJ-31): a term of sessions needs the columns. */}
      {/* One width on every tab, so the header does not jump when the wide gradebook opens (OJ-32 UX review). */}
      <Container wide>
        {loading && !cls ? (
          <PageSkeleton inset />
        ) : error || !cls ? (
          <ErrorState message={error ?? t('notFound')} onRetry={reload} />
        ) : (
          <>
            <PageHeader
              back={{ href: '/classes', label: t('back') }}
              title={cls.name}
              subtitle={
                cls.status === 'ACTIVE' ? (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge className="bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200">{t('lifecycle.active')}</Badge>
                    {/* The explanation waits behind "Chi tiết lớp" on a phone, as the banner it replaces did. */}
                    <span className={cn(!details && 'hidden sm:inline')}>{t('lifecycle.activeNote')}</span>
                  </span>
                ) : undefined
              }
            />
            <LifecycleBar cls={cls} onChange={(c) => setData(c)} />
            <ClassHeader
              key={cls.id + cls.code + cls.teacherId + cls.status}
              cls={cls}
              onSaved={(c) => setData(c)}
              details={details}
              onToggleDetails={() => setDetails((d) => !d)}
            />
            <div ref={tabsAnchor} />
            {/* Sticky under the app header, so a teacher can switch tabs from anywhere in a long list. */}
            <Tabs tabs={tabs} value={tab} onChange={select} idPrefix="class" className="sticky top-14 z-20 mb-6 bg-paper" />
            {panel('sessions', <ClassSessions cls={cls} />)}
            {panel('gradebook', gradebookSeen && <ClassGradebook classId={cls.id} className={cls.name} />)}
            {/* Board and requests stay mounted while hidden: their counts drive the badges on the tabs. */}
            {panel('board', <ClassBoard classId={cls.id} archived={cls.status === 'ARCHIVED'} isManager onAwaiting={setQuestions} />)}
            {panel(
              'students',
              <>
                <ClassRequestsPanel
                  key={cls.id + cls.status}
                  cls={cls}
                  onCount={setRequests}
                  onDecided={() => {
                    reload();
                    setRosterKey((k) => k + 1);
                  }}
                />
                <Roster
                  cls={cls}
                  refreshKey={rosterKey}
                  onCountChange={(d) => setData((prev) => (prev ? { ...prev, studentCount: prev.studentCount + d } : prev!))}
                />
              </>,
            )}
          </>
        )}
      </Container>
    </RequireRole>
  );
}
