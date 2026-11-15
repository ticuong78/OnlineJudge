'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { ProblemSetBuilder } from '@/components/problem-set-builder';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default function NewSetPage() {
  const t = useTranslations('bank');
  const router = useRouter();
  const toast = useToast();
  return (
    <RequireRole roles={STAFF}>
      <Container wide>
        <PageHeader
          back={{ href: '/bank/sets', label: t('title') }}
          title={t('sets.create')}
          subtitle={t('setNew.subtitle')}
        />
        <ProblemSetBuilder
          submitLabel={t('set.save')}
          onSubmit={async (body) => {
            const s = await api.createProblemSet(body);
            toast.success(t('set.saved'));
            router.push(`/bank/sets/${s.id}`);
          }}
        />
      </Container>
    </RequireRole>
  );
}
