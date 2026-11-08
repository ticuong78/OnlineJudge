'use client';

import type { ClassroomDto } from '@oj/contracts';
import { Archive, ArchiveRestore, Pencil, Send, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Container } from '@/components/app-shell';
import { ClassCode, ClassCodeInput, MoveStudentControl, TeacherSelect } from '@/components/classes';
import { AddStudentForm, ClassRequestsPanel, RemoveStudentButton } from '@/components/membership';
import { RequireRole, STAFF } from '@/components/guards';
import { AssignFromBankDialog, SessionList } from '@/components/sessions';
import { ClassBoard } from '@/components/threads';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  inputClass,
  LoadingState,
  Modal,
  PageHeader,
} from '@/components/ui';
import { useNow } from '@/components/verification';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CLASS_CODE_RE } from '@/lib/classes';
import { formatRemaining, sortSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

function ClassHeader({ cls, onSaved }: { cls: ClassroomDto; onSaved: (c: ClassroomDto) => void }) {
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
    if (!name.trim()) return setError('Nhập tên lớp.');
    if (!CLASS_CODE_RE.test(code)) return setError('Mã lớp cần 4 đến 20 ký tự gồm chữ, số hoặc dấu gạch ngang.');
    setSaving(true);
    try {
      const c = await api.updateClass(cls.id, { name: name.trim(), code, ...(isAdmin || orgAdminOfClass ? { teacherId } : {}) });
      onSaved(c);
      setEditing(false);
      toast.success('Đã lưu lớp');
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
            <Field label="Tên lớp">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Mã lớp" hint="Đổi mã thì mã cũ không dùng được để xin vào lớp nữa.">
              <ClassCodeInput value={code} onChange={setCode} name={name} />
            </Field>
            {isAdmin && (
              <Field label="Giáo viên phụ trách">
                <TeacherSelect value={teacherId} onChange={setTeacherId} />
              </Field>
            )}
            {orgAdminOfClass && (
              <Field label="Giáo viên phụ trách" hint={`Giáo viên của ${cls.organization!.name}.`}>
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
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              Lưu lớp
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Hủy
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
      <div>
        <div className="mb-1 text-sm text-slate-500">Mã lớp để học sinh xin vào lớp</div>
        {cls.code ? <ClassCode code={cls.code} size="lg" /> : <span className="text-slate-400">—</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Giáo viên</dt>
        <dd className="font-medium">{cls.teacherName}</dd>
        <dt className="text-slate-500">Thuộc</dt>
        <dd className="font-medium">{cls.organization ? cls.organization.name : 'Lớp cá nhân'}</dd>
        <dt className="text-slate-500">Sĩ số</dt>
        <dd className="font-medium">{cls.studentCount} học sinh</dd>
        <dt className="text-slate-500">Tạo ngày</dt>
        <dd>{formatDate(cls.createdAt)}</dd>
      </dl>
      {cls.status === 'ACTIVE' && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!cls.organization && cls.teacherId === user?.id && myOrganizations.length > 0 && (
            <MoveToOrganization cls={cls} onMoved={onSaved} />
          )}
          <Button variant="secondary" onClick={start}>
            <Pencil className="h-4 w-4" />
            <span>Sửa lớp</span>
          </Button>
        </div>
      )}
    </Card>
  );
}

/** A personal class joins one of the teacher's organizations (one way: it cannot be taken out again). */
function MoveToOrganization({ cls, onMoved }: { cls: ClassroomDto; onMoved: (c: ClassroomDto) => void }) {
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
      toast.success(`Lớp đã thuộc ${name}`);
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <select className={cn(inputClass, 'w-auto py-1.5')} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Tổ chức">
        {orgs.map((o) => (
          <option key={o.organizationId} value={o.organizationId}>
            {o.organizationName}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        <span>Chuyển vào tổ chức</span>
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Chuyển lớp vào tổ chức?"
        confirmLabel="Chuyển vào tổ chức"
        danger={false}
        loading={busy}
        onClose={() => setConfirming(false)}
        onConfirm={move}
        message={
          <div className="space-y-2 text-sm">
            <p>Lớp {cls.name} sẽ thuộc {name}. Quản lý tổ chức cũng quản lý được lớp: học sinh, phiên, kết quả.</p>
            <p>Không chuyển lớp ra khỏi tổ chức được. Khi bạn rời tổ chức, lớp ở lại tổ chức.</p>
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
  const { data, error, loading, reload, setData } = useAsync(() => api.listClassStudents(cls.id), [cls.id, refreshKey]);
  const archived = cls.status === 'ARCHIVED';
  const classes = useAsync(() => api.listClasses(), []);
  const students = [...(data ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

  return (
    <Card className="mb-6">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">Học sinh trong lớp</h2>
        {data && <span className="text-sm text-slate-500">{data.length} học sinh</span>}
      </div>
      {archived ? (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
          Lớp đã lưu trữ nên không thêm hay mời học sinh ra khỏi lớp được. Khôi phục lớp để thay đổi danh sách.
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
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : students.length === 0 ? (
        <EmptyState title="Lớp chưa có học sinh">
          {cls.status === 'ACTIVE' ? (
            <>
              Đưa mã lớp <b>{cls.code}</b> cho học sinh để các em xin vào lớp, hoặc thêm học sinh bằng email ở trên.
            </>
          ) : (
            'Lớp đã lưu trữ nên không nhận học sinh mới.'
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Họ tên</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Email</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Số điện thoại</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Vào lớp</th>
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
                  <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">{formatDate(s.enrolledAt)}</td>
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
  const { data, error, loading, reload } = useAsync(() => api.listSessions({ classId: cls.id }), [cls.id]);
  const [assigning, setAssigning] = useState(false);
  const archived = cls.status === 'ARCHIVED';
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">Phiên đã giao</h2>
        {!archived && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            <Send className="h-4 w-4" />
            Giao bài cho lớp
          </Button>
        )}
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <SessionList
          sessions={sortSessions(data ?? [])}
          managerProgress
          emptyTitle="Lớp chưa có phiên nào"
          emptyHint={archived ? undefined : 'Bấm “Giao bài cho lớp” và chọn một đề hoặc một bài trong ngân hàng của bạn.'}
        />
      )}
      <AssignFromBankDialog open={assigning} onClose={() => setAssigning(false)} classId={cls.id} />
    </Card>
  );
}

function LifecycleBar({ cls, onChange }: { cls: ClassroomDto; onChange: (c: ClassroomDto) => void }) {
  const { user, isAdmin } = useAuth();
  // Org admins archive and restore organization classes but do not delete them (OJ-8).
  const canDelete = isAdmin || cls.teacherId === user?.id;
  const toast = useToast();
  const router = useRouter();
  const now = useNow(60_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
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
      toast.success(`Đã xóa lớp ${cls.name}`);
      router.replace('/classes');
    } catch (e) {
      setDeleteError(errorMessage(e));
      setBusy(null);
    }
  };

  if (cls.status === 'ACTIVE') {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-rule bg-white px-5 py-3">
        <Badge className="bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200">Đang học</Badge>
        <span className="flex-1 text-sm text-slate-600">
          Học sinh xin vào lớp bằng mã lớp và nộp bài trong các phiên đang mở.
        </span>
        <Button variant="secondary" size="sm" onClick={() => setConfirmArchive(true)}>
          <Archive className="h-4 w-4" />
          Lưu trữ lớp
        </Button>
        <ConfirmDialog
          open={confirmArchive}
          title="Lưu trữ lớp này?"
          danger={false}
          confirmLabel="Lưu trữ lớp"
          loading={busy === 'archive'}
          message={
            <ul className="list-disc space-y-1 pl-5">
              <li>Lớp chỉ còn để xem: không nhận học sinh mới, không nộp bài, không giao bài mới.</li>
              <li>Yêu cầu vào lớp và rời lớp đang chờ sẽ được giữ, duyệt được sau khi khôi phục.</li>
              <li>Học sinh vẫn mở được các phiên cũ và học bạ vẫn giữ nguyên.</li>
              <li>Bạn có thể khôi phục lớp bất cứ lúc nào, hoặc hẹn xóa hẳn.</li>
            </ul>
          }
          onConfirm={async () => {
            if (await run('archive', () => api.archiveClass(cls.id), 'Đã lưu trữ lớp')) setConfirmArchive(false);
          }}
          onClose={() => setConfirmArchive(false)}
        />
      </div>
    );
  }

  const purgeIn = cls.purgeAt ? new Date(cls.purgeAt).getTime() - now : null;
  return (
    <div className="mb-6 space-y-3 rounded-panel border border-amber-200 bg-amber-50/60 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">Đã lưu trữ</Badge>
        <span className="flex-1 text-sm text-amber-900">
          Lớp chỉ còn để xem{cls.archivedAt ? ` từ ${formatDate(cls.archivedAt)}` : ''}. Học sinh vẫn mở được các phiên cũ.
        </span>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'restore'}
          onClick={() => run('restore', () => api.restoreClass(cls.id), 'Đã khôi phục lớp')}
        >
          <ArchiveRestore className="h-4 w-4" />
          Khôi phục
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 pt-3 text-sm">
        {cls.purgeAt ? (
          <>
            <span className="font-medium text-mark-700">
              Sẽ xóa hẳn lúc {formatDateTime(cls.purgeAt)}
              {purgeIn !== null && purgeIn > 0 ? `, ${formatRemaining(purgeIn)}` : ''}
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'cancel'}
              onClick={() => run('cancel', () => api.cancelClassDeletion(cls.id), 'Đã hủy hẹn xóa')}
            >
              Hủy hẹn xóa
            </Button>
          </>
        ) : !canDelete ? (
          <span className="text-slate-600">Chỉ giáo viên phụ trách lớp hoặc quản trị viên được xóa hẳn lớp.</span>
        ) : (
          <>
            <label className="flex items-center gap-2">
              Hẹn xóa sau
              <input
                type="number"
                min={1}
                max={365}
                className={cn(inputClass, 'w-20 py-1')}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              ngày
            </label>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'schedule'}
              onClick={() => {
                const n = Math.round(Number(days));
                if (!(n >= 1 && n <= 365)) return toast.error('Nhập số ngày từ 1 đến 365.');
                run('schedule', () => api.scheduleClassDeletion(cls.id, n), `Đã hẹn xóa lớp sau ${n} ngày`);
              }}
            >
              Hẹn xóa
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
            <Trash2 className="h-4 w-4" />
            <span>Xóa ngay</span>
          </Button>
        )}
      </div>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Xóa hẳn lớp này?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={busy === 'delete'}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={deleteNow}
              loading={busy === 'delete'}
              disabled={confirmName.trim() !== cls.name}
            >
              Xóa lớp
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Lớp <b>{cls.name}</b> và mọi phiên của lớp sẽ bị xóa, không khôi phục được. Học sinh chỉ còn tên bài và kết quả
            trong học bạ.
          </p>
          <Field label={`Gõ tên lớp “${cls.name}” để xác nhận`}>
            <input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoFocus />
          </Field>
          {deleteError && <InlineAlert>{deleteError}</InlineAlert>}
        </div>
      </Modal>
    </div>
  );
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: cls, error, loading, reload, setData } = useAsync(() => api.getClass(id), [id]);
  const [rosterKey, setRosterKey] = useState(0);

  return (
    <RequireRole roles={STAFF}>
      <Container>
        {loading && !cls ? (
          <LoadingState />
        ) : error || !cls ? (
          <ErrorState message={error ?? 'Không tìm thấy lớp'} onRetry={reload} />
        ) : (
          <>
            <PageHeader back={{ href: '/classes', label: 'Lớp' }} title={cls.name} />
            <LifecycleBar cls={cls} onChange={(c) => setData(c)} />
            <ClassHeader key={cls.id + cls.code + cls.teacherId + cls.status} cls={cls} onSaved={(c) => setData(c)} />
            <ClassRequestsPanel
              key={cls.id + cls.status}
              cls={cls}
              onDecided={() => {
                reload();
                setRosterKey((k) => k + 1);
              }}
            />
            <ClassSessions cls={cls} />
            <ClassBoard classId={cls.id} archived={cls.status === 'ARCHIVED'} isManager />
            <Roster
              cls={cls}
              refreshKey={rosterKey}
              onCountChange={(d) => setData((prev) => (prev ? { ...prev, studentCount: prev.studentCount + d } : prev!))}
            />
          </>
        )}
      </Container>
    </RequireRole>
  );
}
