'use client';

import type { InvitationDto, Role, UserDto } from '@oj/contracts';
import { Crown, MailPlus, RotateCw, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Container } from '@/components/app-shell';
import { ADMIN_ONLY, RequireRole } from '@/components/guards';
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
import { RoleLabels } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

const roleClass: Record<Role, string> = {
  ADMIN: 'bg-mark-50 text-mark-700 ring-1 ring-mark-200',
  TEACHER: 'bg-ink-50 text-ink-700 ring-1 ring-ink-200',
  STUDENT: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
};

function InviteTeacherModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (inv: InvitationDto) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!displayName.trim() || !email.trim()) return setError('Nhập họ tên và email của giáo viên.');
    setSaving(true);
    try {
      const inv = await api.inviteTeacher({
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });
      onInvited(inv);
      setDisplayName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mời giáo viên"
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
          Giáo viên sẽ nhận email có đường link và mã kích hoạt, rồi tự đặt mật khẩu. Lời mời có hiệu lực 7 ngày.
        </p>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label="Họ và tên">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Số điện thoại (không bắt buộc)">
          <input type="tel" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function PendingInvitations({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const now = useNow(30_000);
  const { data, error, loading, reload, setData } = useAsync(() => api.listInvitations(), [refreshKey]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<InvitationDto | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const resend = async (inv: InvitationDto) => {
    setBusyId(inv.id);
    try {
      const updated = await api.resendInvitation(inv.id);
      setData((prev) => (prev ?? []).map((x) => (x.id === inv.id ? updated : x)));
      toast.success(`Đã gửi lại lời mời tới ${inv.email}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async () => {
    if (!cancelling) return;
    setCancelBusy(true);
    try {
      await api.cancelInvitation(cancelling.id);
      setData((prev) => (prev ?? []).filter((x) => x.id !== cancelling.id));
      toast.success('Đã hủy lời mời');
      setCancelling(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">Lời mời đang chờ</h2>
        {data && data.length > 0 && <span className="text-sm text-slate-500">{data.length} lời mời</span>}
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Không có lời mời nào đang chờ. Bấm “Mời giáo viên” để mời.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Họ tên</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Số điện thoại</th>
                <th className="px-4 py-2.5">Hết hạn</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((inv) => {
                const expired = new Date(inv.expiresAt).getTime() <= now;
                return (
                  <tr key={inv.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{inv.displayName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{inv.email}</td>
                    <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{inv.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {expired ? (
                        <Badge className="bg-mark-50 text-mark-700 ring-1 ring-mark-200">Hết hạn</Badge>
                      ) : (
                        <span className="text-slate-600">{formatDateTime(inv.expiresAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => resend(inv)} loading={busyId === inv.id}>
                          <RotateCw className="h-4 w-4" />
                          Gửi lại lời mời
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-mark-600 hover:bg-mark-50"
                          onClick={() => setCancelling(inv)}
                        >
                          <X className="h-4 w-4" />
                          Hủy lời mời
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!cancelling}
        title="Hủy lời mời?"
        message={
          <>
            Đường link đã gửi tới <b>{cancelling?.email}</b> sẽ không dùng được nữa.
          </>
        }
        confirmLabel="Hủy lời mời"
        loading={cancelBusy}
        onConfirm={cancel}
        onClose={() => setCancelling(null)}
      />
    </Card>
  );
}

export default function UsersPage() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.listUsers(), []);
  const [filter, setFilter] = useState<Role | ''>('');
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);
  const [deleting, setDeleting] = useState<UserDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [vipBusyId, setVipBusyId] = useState<string | null>(null);

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (u) =>
        (!filter || u.role === filter) &&
        (!q ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? '').includes(q)),
    );
  }, [data, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of data ?? []) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [data]);

  const toggleVip = async (u: UserDto) => {
    setVipBusyId(u.id);
    try {
      const updated = await api.setUserVip(u.id, !u.vip);
      setData((prev) => (prev ?? []).map((x) => (x.id === u.id ? updated : x)));
      toast.success(updated.vip ? `${u.displayName} đã là giáo viên VIP (dùng được AI)` : `${u.displayName} đã về tài khoản thường`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setVipBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteUser(deleting.id);
      setData((prev) => (prev ?? []).filter((u) => u.id !== deleting.id));
      toast.success('Đã xóa người dùng');
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <RequireRole roles={ADMIN_ONLY}>
      <Container>
        <PageHeader
          title="Người dùng"
          subtitle="Học sinh tự đăng ký tài khoản rồi xin vào lớp bằng mã lớp. Giáo viên được mời qua email. Chỉ giáo viên VIP mới dùng được các tính năng AI."
          actions={
            <Button onClick={() => setInviting(true)}>
              <MailPlus className="h-4 w-4" />
              Mời giáo viên
            </Button>
          }
        />

        <div className="mb-6">
          <PendingInvitations refreshKey={invitesKey} />
        </div>

        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <input
            className={cn(inputClass, 'max-w-xs')}
            placeholder="Tìm theo tên, email hoặc số điện thoại"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {(['', 'ADMIN', 'TEACHER', 'STUDENT'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilter(r)}
                className={cn(
                  'rounded-full px-3 py-1 text-sm',
                  filter === r ? 'bg-ink-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {r ? `${RoleLabels[r]} (${counts[r] ?? 0})` : `Tất cả (${data?.length ?? 0})`}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="Không có người dùng phù hợp" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Họ tên</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Số điện thoại</th>
                    <th className="px-4 py-2.5">Vai trò</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Ngày tạo</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{u.displayName}</div>
                        {u.organizations.length > 0 && (
                          <div className="text-xs text-slate-500">
                            {u.organizations.map((o) => `${o.organizationName}${o.role === 'ADMIN' ? ' (quản lý)' : ''}`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                        {u.phone ? <a href={`tel:${u.phone}`} className="hover:text-ink-700">{u.phone}</a> : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge className={roleClass[u.role]}>{RoleLabels[u.role]}</Badge>
                          {u.role === 'TEACHER' && u.vip && (
                            <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                              <Crown className="mr-1 h-3 w-3" />
                              VIP
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {u.role === 'TEACHER' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleVip(u)}
                            loading={vipBusyId === u.id}
                            title={u.vip ? 'Chuyển về tài khoản thường (không dùng được AI)' : 'Nâng cấp VIP để dùng các tính năng AI'}
                          >
                            <Crown className="h-4 w-4" />
                            {/* Keyed: a new element per state. Browser translation swaps text nodes for its own, so an
                                updated text node would stay hidden behind the old translated label. */}
                            <span key={u.vip ? 'vip' : 'regular'}>{u.vip ? 'Bỏ VIP' : 'Nâng cấp VIP'}</span>
                          </Button>
                        )}
                        {u.role !== 'ADMIN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-mark-600 hover:bg-mark-50"
                            onClick={() => setDeleting(u)}
                            aria-label={`Xóa ${u.displayName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <InviteTeacherModal
          open={inviting}
          onClose={() => setInviting(false)}
          onInvited={(inv) => {
            setInviting(false);
            setInvitesKey((k) => k + 1);
            toast.success(`Đã gửi lời mời tới ${inv.email}`);
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Xóa người dùng?"
          message={
            <>
              Tài khoản <b>{deleting?.displayName}</b> ({deleting?.email}) sẽ bị xóa.
              {deleting?.role === 'TEACHER' && (
                <span className="mt-2 block">
                  Các lớp giáo viên này phụ trách sẽ chuyển sang quản trị viên. Học sinh và đề của lớp vẫn được giữ.
                </span>
              )}
              {deleting?.role === 'STUDENT' && (
                <span className="mt-2 block">Học sinh cũng sẽ bị xóa khỏi mọi lớp đang học.</span>
              )}
            </>
          }
          loading={deleteBusy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      </Container>
    </RequireRole>
  );
}
