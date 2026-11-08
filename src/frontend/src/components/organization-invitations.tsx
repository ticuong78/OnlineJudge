'use client';

import type { OrganizationInvitationDto } from '@oj/contracts';
import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { formatDateTime } from '@/lib/utils';
import { useToast } from './toast';
import { Button, Card } from './ui';

/** Invitations into organizations addressed to the signed-in teacher's account (OJ-8): accept or decline. */
export function OrganizationInvitationsInbox() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const invitations = useAsync(() => (user?.role === 'TEACHER' ? api.myOrganizationInvitations() : Promise.resolve([])), [user?.id]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = invitations.data ?? [];
  if (!items.length) return null;

  const answer = async (inv: OrganizationInvitationDto, accept: boolean) => {
    setBusyId(inv.id);
    try {
      if (accept) {
        await api.acceptOrganizationInvitation(inv.id);
        await refresh();
        toast.success(`Bạn đã tham gia ${inv.organizationName}`);
      } else {
        await api.declineOrganizationInvitation(inv.id);
        toast.success('Đã từ chối lời mời');
      }
      invitations.setData((prev) => (prev ?? []).filter((x) => x.id !== inv.id));
    } catch (e) {
      toast.error(errorMessage(e));
      invitations.reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mb-6 border-ink-200">
      <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Lời mời vào tổ chức</h2>
      <ul className="divide-y divide-slate-100">
        {items.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Building2 className="h-5 w-5 shrink-0 text-ink-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{inv.organizationName}</div>
              <div className="text-sm text-slate-500">
                {inv.invitedByName} mời bạn tham gia · hết hạn {formatDateTime(inv.expiresAt)}
              </div>
            </div>
            <Button size="sm" onClick={() => answer(inv, true)} loading={busyId === inv.id} disabled={!!busyId}>
              <span>Tham gia</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer(inv, false)} disabled={!!busyId}>
              <span>Từ chối</span>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
