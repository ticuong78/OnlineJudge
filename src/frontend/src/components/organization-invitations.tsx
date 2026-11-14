'use client';

import type { OrganizationInvitationDto } from '@oj/contracts';
import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { formatDateTime } from '@/lib/utils';
import { useToast } from './toast';
import { Button, Card } from './ui';

/** Invitations into organizations addressed to the signed-in teacher's account (OJ-8): accept or decline. */
export function OrganizationInvitationsInbox() {
  const t = useTranslations('auth.orgInvitations');
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
        toast.success(t('joined', { name: inv.organizationName }));
      } else {
        await api.declineOrganizationInvitation(inv.id);
        toast.success(t('declined'));
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
      <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">{t('title')}</h2>
      <ul className="divide-y divide-slate-100">
        {items.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Building2 className="h-5 w-5 shrink-0 text-ink-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{inv.organizationName}</div>
              <div className="text-sm text-slate-500">
                {t('invitedBy', { name: inv.invitedByName, expires: formatDateTime(inv.expiresAt) })}
              </div>
            </div>
            <Button size="sm" onClick={() => answer(inv, true)} loading={busyId === inv.id} disabled={!!busyId}>
              <span>{t('join')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer(inv, false)} disabled={!!busyId}>
              <span>{t('decline')}</span>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
