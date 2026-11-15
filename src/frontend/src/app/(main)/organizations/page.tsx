'use client';

import type { OrganizationDto } from '@oj/contracts';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import {
  AiIncludedBadge,
  OrganizationIcon,
  OrganizationStatus,
  OrganizationTermsModal,
  SeatsMeter,
} from '@/components/organizations';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';

export default function OrganizationsPage() {
  return (
    <RequireRole roles={STAFF}>
      <Organizations />
    </RequireRole>
  );
}

function Organizations() {
  const t = useTranslations('admin.organizations.list');
  const { isAdmin } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const orgs = useAsync(() => api.listOrganizations(), []);
  const teachers = useAsync(() => (isAdmin ? api.listUsers() : Promise.resolve([])), [isAdmin]);
  const [creating, setCreating] = useState(false);

  return (
    <Container>
      <PageHeader
        title={t('title')}
        subtitle={
          isAdmin ? t('subtitleAdmin') : t('subtitleTeacher')
        }
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 shrink-0" />
              <span>{t('create')}</span>
            </Button>
          )
        }
      />
      {orgs.loading ? (
        <ListSkeleton />
      ) : orgs.error ? (
        <ErrorState message={orgs.error} onRetry={orgs.reload} />
      ) : !orgs.data?.length ? (
        <EmptyState title={isAdmin ? t('emptyAdmin') : t('emptyTeacher')}>
          {isAdmin ? t('emptyAdminBody') : t('emptyTeacherBody')}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {orgs.data.map((o) => (
            <OrganizationRow key={o.id} org={o} />
          ))}
        </div>
      )}
      {isAdmin && creating && (
        <OrganizationTermsModal
          open
          title={t('create')}
          teachers={(teachers.data ?? []).filter((u) => u.role === 'TEACHER')}
          onClose={() => setCreating(false)}
          onSubmit={async (terms, adminUserId) => {
            try {
              const org = await api.createOrganization({ ...terms, adminUserId: adminUserId! });
              toast.success(t('created', { name: org.name }));
              router.push(`/organizations/${org.id}`);
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
    </Container>
  );
}

function OrganizationRow({ org }: { org: OrganizationDto }) {
  const t = useTranslations('admin.organizations.list');
  const tRole = useTranslations('admin.orgRole');
  return (
    <Link href={`/organizations/${org.id}`} className="block focus-visible:outline-2">
      <Card className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
          <OrganizationIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 font-semibold break-words text-slate-900">{org.name}</span>
            {org.myRole && <Badge className="bg-slate-100 text-slate-700">{tRole(org.myRole)}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <OrganizationStatus org={org} />
            <AiIncludedBadge included={org.aiIncluded} />
            <span>{t('memberCount', { count: org.memberCount })}</span>
          </div>
        </div>
        <SeatsMeter used={org.seatsUsed} seats={org.seats} />
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </Card>
    </Link>
  );
}
