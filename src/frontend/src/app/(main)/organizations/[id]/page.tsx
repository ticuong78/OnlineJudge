'use client';

import type { OrganizationDetailDto, OrganizationInvitationDto, OrganizationMemberDto } from '@oj/contracts';
import { ChevronRight, LogOut, MailPlus, Pencil, UserMinus, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import {
  AiIncludedBadge,
  OrganizationRoleLabels,
  OrganizationStatus,
  OrganizationTermsModal,
  SeatsMeter,
} from '@/components/organizations';
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
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function OrganizationPage() {
  return (
    <RequireRole roles={STAFF}>
      <Organization />
    </RequireRole>
  );
}

function Organization() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const org = useAsync(() => api.getOrganization(id), [id]);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<OrganizationMemberDto | null>(null);
  const [busy, setBusy] = useState(false);

  if (org.loading) return <Container><LoadingState /></Container>;
  if (org.error || !org.data) return <Container><ErrorState message={org.error ?? 'Không tìm thấy tổ chức.'} onRetry={org.reload} /></Container>;
  const o = org.data;
  const manager = isAdmin || o.myRole === 'ADMIN';
  const adminCount = o.members.filter((m) => m.role === 'ADMIN').length;
  const update = (next: OrganizationDetailDto) => org.setData(next);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.removeOrganizationMember(o.id, removing.userId);
      if (removing.userId === user?.id) {
        await refresh();
        toast.success(`Bạn đã rời tổ chức ${o.name}`);
        router.push('/organizations');
        return;
      }
      toast.success(`Đã mời ${removing.displayName} ra khỏi tổ chức. Lớp của tổ chức do giáo viên này dạy được chuyển cho bạn.`);
      setRemoving(null);
      org.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (m: OrganizationMemberDto) => {
    try {
      update(await api.setOrganizationRole(o.id, m.userId, m.role === 'ADMIN' ? 'TEACHER' : 'ADMIN'));
      if (m.userId === user?.id) await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Container>
      <PageHeader
        back={{ href: '/organizations', label: 'Tổ chức' }}
        title={o.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrganizationStatus org={o} />
            <AiIncludedBadge included={o.aiIncluded} />
            {o.myRole && <Badge className="bg-slate-100 text-slate-700">Bạn là {OrganizationRoleLabels[o.myRole].toLowerCase()}</Badge>}
          </span>
        }
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                <span>Sửa gói</span>
              </Button>
            )}
            {manager && (
              <Button onClick={() => setInviting(true)} disabled={!o.active}>
                <MailPlus className="h-4 w-4" />
                <span>Mời giáo viên</span>
              </Button>
            )}
          </>
        }
      />

      {!o.active && (
        <div className="mb-4">
          <InlineAlert kind="warning">
            Gói của tổ chức đã hết hạn: tính năng AI của tổ chức đã tắt và không mời thêm giáo viên được. Lớp, bài và dữ liệu vẫn giữ nguyên.
          </InlineAlert>
        </div>
      )}

      <Card className="mb-5 grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <Stat label="Chỗ giáo viên"><SeatsMeter used={o.seatsUsed} seats={o.seats} /></Stat>
        <Stat label="Giáo viên">{o.memberCount}</Stat>
        <Stat label="Lời mời đang chờ">{manager ? o.invitations.length : '—'}</Stat>
      </Card>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Giáo viên</h2>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={!o.active}>
              <UserPlus className="h-4 w-4" />
              <span>Thêm giáo viên có sẵn</span>
            </Button>
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {o.members.map((m) => {
            const self = m.userId === user?.id;
            const lastAdmin = m.role === 'ADMIN' && adminCount <= 1;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">
                    {m.displayName}
                    {self && <span className="ml-1 text-sm font-normal text-slate-500">(bạn)</span>}
                  </div>
                  <div className="text-sm text-slate-500">{m.email} · vào {formatDate(m.joinedAt)}</div>
                </div>
                <Badge className={m.role === 'ADMIN' ? 'bg-mark-50 text-mark-700 ring-1 ring-mark-200' : 'bg-ink-50 text-ink-700 ring-1 ring-ink-200'}>
                  <span>{OrganizationRoleLabels[m.role]}</span>
                </Badge>
                {manager && (
                  <Button variant="ghost" size="sm" onClick={() => setRole(m)} disabled={lastAdmin} title={lastAdmin ? 'Tổ chức cần ít nhất một quản lý' : undefined}>
                    <span key={m.role}>{m.role === 'ADMIN' ? 'Bỏ quyền quản lý' : 'Cho làm quản lý'}</span>
                  </Button>
                )}
                {(manager || self) && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(m)} disabled={lastAdmin} title={lastAdmin ? 'Tổ chức cần ít nhất một quản lý' : undefined}>
                    {self ? <LogOut className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
                    <span>{self ? 'Rời tổ chức' : 'Mời ra'}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {manager && <Invitations org={o} onChange={org.reload} />}
      {manager && <OrganizationClasses id={o.id} />}

      {isAdmin && editing && (
        <OrganizationTermsModal
          open
          title="Sửa gói tổ chức"
          initial={{ name: o.name, seats: o.seats, activeUntil: o.activeUntil, aiIncluded: o.aiIncluded }}
          onClose={() => setEditing(false)}
          onSubmit={async (terms) => {
            try {
              update(await api.updateOrganization(o.id, terms));
              setEditing(false);
              toast.success('Đã lưu gói tổ chức');
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
      {manager && inviting && (
        <InviteModal
          org={o}
          onClose={() => setInviting(false)}
          onInvited={(inv) => {
            setInviting(false);
            org.reload();
            toast.success(inv.forExistingAccount
              ? `Đã mời ${inv.displayName}. Lời mời hiện ở trang chủ của giáo viên này.`
              : `Đã gửi email mời ${inv.email} tạo tài khoản giáo viên.`);
          }}
        />
      )}
      {isAdmin && adding && <AddExistingModal org={o} onClose={() => setAdding(false)} onAdded={(next) => { update(next); setAdding(false); }} />}
      <ConfirmDialog
        open={!!removing}
        title={removing?.userId === user?.id ? 'Rời tổ chức?' : 'Mời giáo viên ra khỏi tổ chức?'}
        confirmLabel={removing?.userId === user?.id ? 'Rời tổ chức' : 'Mời ra'}
        loading={busy}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        message={
          <div className="space-y-2 text-sm">
            <p>
              {removing?.userId === user?.id ? 'Bạn' : removing?.displayName} sẽ không còn ở tổ chức {o.name}. Chỗ giáo viên được trả lại.
            </p>
            <p>Các lớp của tổ chức do giáo viên này dạy vẫn thuộc tổ chức và được chuyển cho quản lý tổ chức.</p>
            <p>Giáo viên giữ bài tập của mình; tổ chức giữ một bản sao của các bài đã chia sẻ trong tổ chức.</p>
          </div>
        }
      />
    </Container>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{children}</div>
    </div>
  );
}

function Invitations({ org, onChange }: { org: OrganizationDetailDto; onChange: () => void }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!org.invitations.length) return null;
  const cancel = async (inv: OrganizationInvitationDto) => {
    setBusyId(inv.id);
    try {
      await api.cancelOrganizationInvitation(org.id, inv.id);
      toast.success(`Đã hủy lời mời ${inv.email}`);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Card className="mb-5">
      <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Lời mời đang chờ</h2>
      <ul className="divide-y divide-slate-100">
        {org.invitations.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{inv.displayName}</div>
              <div className="text-sm text-slate-500">
                {inv.email} · {inv.forExistingAccount ? 'đã có tài khoản, chờ chấp nhận' : 'chờ tạo tài khoản'} · hết hạn {formatDateTime(inv.expiresAt)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => cancel(inv)} loading={busyId === inv.id}>
              <X className="h-4 w-4" />
              <span>Hủy lời mời</span>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OrganizationClasses({ id }: { id: string }) {
  const classes = useAsync(() => api.organizationClasses(id), [id]);
  return (
    <Card>
      <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Lớp của tổ chức</h2>
      {classes.loading ? (
        <LoadingState />
      ) : classes.error ? (
        <ErrorState message={classes.error} onRetry={classes.reload} />
      ) : !classes.data?.length ? (
        <div className="p-5">
          <EmptyState title="Chưa có lớp nào">Giáo viên chọn tổ chức khi tạo lớp, hoặc chuyển lớp riêng vào tổ chức ở trang lớp.</EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {classes.data.map((c) => (
            <li key={c.id}>
              <Link href={`/classes/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-sm text-slate-500">
                    {c.code} · {c.teacherName} · {c.studentCount} học sinh{c.status === 'ARCHIVED' ? ' · đã lưu trữ' : ''}
                  </div>
                </div>
                {!!c.pendingRequestCount && <Badge className="bg-amber-50 text-amber-800">{c.pendingRequestCount} yêu cầu chờ</Badge>}
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InviteModal({
  org,
  onClose,
  onInvited,
}: {
  org: OrganizationDetailDto;
  onClose: () => void;
  onInvited: (inv: OrganizationInvitationDto) => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!email.trim() || displayName.trim().length < 2) return setError('Nhập email và họ tên của giáo viên.');
    setSaving(true);
    try {
      onInvited(await api.inviteToOrganization(org.id, { email: email.trim(), displayName: displayName.trim() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mời giáo viên vào ${org.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            Gửi lời mời
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          Còn {Math.max(0, org.seats - org.seatsUsed)} chỗ. Giáo viên đã có tài khoản chấp nhận lời mời ở trang chủ; email mới nhận
          đường link và mã để tạo tài khoản. Lời mời giữ một chỗ trong 7 ngày.
        </p>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label="Email">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Họ và tên (dùng khi email chưa có tài khoản)">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function AddExistingModal({
  org,
  onClose,
  onAdded,
}: {
  org: OrganizationDetailDto;
  onClose: () => void;
  onAdded: (next: OrganizationDetailDto) => void;
}) {
  const users = useAsync(() => api.listUsers(), []);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'ADMIN'>('TEACHER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const memberIds = new Set(org.members.map((m) => m.userId));
  const candidates = (users.data ?? []).filter((u) => u.role === 'TEACHER' && !memberIds.has(u.id));
  const submit = async () => {
    if (!userId) return setError('Chọn giáo viên.');
    setSaving(true);
    try {
      onAdded(await api.addOrganizationMember(org.id, { userId, role }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Thêm giáo viên có sẵn"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit} loading={saving}>
            Thêm vào tổ chức
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label="Giáo viên">
          <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{users.loading ? 'Đang tải…' : 'Chọn giáo viên…'}</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vai trò trong tổ chức">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'ADMIN')}>
            <option value="TEACHER">Giáo viên</option>
            <option value="ADMIN">Quản lý</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
