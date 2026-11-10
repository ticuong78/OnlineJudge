'use client';

import type { InvitationDto, Role, UserDto } from '@oj/contracts';
import { Crown, MailPlus, RotateCw, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
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
  const t = useTranslations('admin.users.inviteModal');
  const tc = useTranslations('common');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!displayName.trim() || !email.trim()) return setError(t('missing'));
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
      title={t('title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {t('send')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">{t('intro')}</p>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label={t('displayName')}>
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('email')}>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('phone')}>
          <input type="tel" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function PendingInvitations({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations('admin.users');
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
      toast.success(t('pending.resent', { email: inv.email }));
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
      toast.success(t('pending.cancelled'));
      setCancelling(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{t('pending.title')}</h2>
        {data && data.length > 0 && <span className="text-sm text-slate-500">{t('pending.count', { count: data.length })}</span>}
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t('pending.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{t('columns.name')}</th>
                <th className="px-4 py-2.5">{t('columns.email')}</th>
                <th className="hidden px-4 py-2.5 md:table-cell">{t('columns.phone')}</th>
                <th className="px-4 py-2.5">{t('columns.expires')}</th>
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
                        <Badge className="bg-mark-50 text-mark-700 ring-1 ring-mark-200">{t('pending.expired')}</Badge>
                      ) : (
                        <span className="text-slate-600">{formatDateTime(inv.expiresAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => resend(inv)} loading={busyId === inv.id}>
                          <RotateCw className="h-4 w-4 shrink-0" />
                          {t('pending.resend')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-mark-600 hover:bg-mark-50"
                          onClick={() => setCancelling(inv)}
                        >
                          <X className="h-4 w-4 shrink-0" />
                          {t('pending.cancel')}
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
        title={t('pending.cancelTitle')}
        message={t.rich('pending.cancelBody', { email: cancelling?.email ?? '', b: (c) => <b>{c}</b> })}
        confirmLabel={t('pending.cancel')}
        loading={cancelBusy}
        onConfirm={cancel}
        onClose={() => setCancelling(null)}
      />
    </Card>
  );
}

export default function UsersPage() {
  const t = useTranslations('admin.users');
  const tRole = useTranslations('enums.role');
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
      toast.success(t(updated.vip ? 'vipOn' : 'vipOff', { name: u.displayName }));
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
      toast.success(t('deleted'));
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
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <Button onClick={() => setInviting(true)}>
              <MailPlus className="h-4 w-4 shrink-0" />
              {t('invite')}
            </Button>
          }
        />

        <div className="mb-6">
          <PendingInvitations refreshKey={invitesKey} />
        </div>

        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <input
            className={cn(inputClass, 'w-full sm:max-w-xs')}
            placeholder={t('searchPlaceholder')}
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
                  'rounded-full px-3 py-1 text-sm whitespace-nowrap',
                  filter === r ? 'bg-ink-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {r ? t('filterRole', { role: tRole(r), count: counts[r] ?? 0 }) : t('filterAll', { count: data?.length ?? 0 })}
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
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-rule bg-slate-50 text-left text-xs font-medium whitespace-nowrap text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">{t('columns.name')}</th>
                    <th className="px-4 py-2.5">{t('columns.email')}</th>
                    <th className="px-4 py-2.5">{t('columns.phone')}</th>
                    <th className="px-4 py-2.5">{t('columns.role')}</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">{t('columns.created')}</th>
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
                            {u.organizations
                              .map((o) => (o.role === 'ADMIN' ? t('orgManaged', { name: o.organizationName }) : o.organizationName))
                              .join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                        {u.phone ? <a href={`tel:${u.phone}`} className="hover:text-ink-700">{u.phone}</a> : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge className={roleClass[u.role]}>{tRole(u.role)}</Badge>
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
                            title={u.vip ? t('removeVipTitle') : t('upgradeVipTitle')}
                          >
                            <Crown className="h-4 w-4 shrink-0" />
                            {/* Keyed: a new element per state. Browser translation swaps text nodes for its own, so an
                                updated text node would stay hidden behind the old translated label. */}
                            <span key={u.vip ? 'vip' : 'regular'}>{u.vip ? t('removeVip') : t('upgradeVip')}</span>
                          </Button>
                        )}
                        {u.role !== 'ADMIN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-mark-600 hover:bg-mark-50"
                            onClick={() => setDeleting(u)}
                            aria-label={t('deleteLabel', { name: u.displayName })}
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
            toast.success(t('invited', { email: inv.email }));
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title={t('deleteTitle')}
          message={
            <>
              {t.rich('deleteBody', { name: deleting?.displayName ?? '', email: deleting?.email ?? '', b: (c) => <b>{c}</b> })}
              {deleting?.role === 'TEACHER' && (
                <span className="mt-2 block">{t('deleteTeacher')}</span>
              )}
              {deleting?.role === 'STUDENT' && (
                <span className="mt-2 block">{t('deleteStudent')}</span>
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
