'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { ProblemSetBuilder } from '@/components/problem-set-builder';
import { useToast } from '@/components/toast';
import { ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export default function EditSetPage() {
  const t = useTranslations('bank');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.getProblemSet(id), [id]);

  return (
    <RequireRole roles={STAFF}>
      <Container wide>
        <PageHeader
          back={{ href: `/bank/sets/${id}`, label: t('set.backToSet') }}
          title={t('setEdit.title')}
          subtitle={t('setEdit.subtitle')}
        />
        {loading && !data ? (
          <PageSkeleton inset />
        ) : error || !data ? (
          <ErrorState message={error ?? t('set.notFound')} onRetry={reload} />
        ) : !data.canEdit ? (
          <ErrorState message={t('setEdit.notMine')} />
        ) : (
          <ProblemSetBuilder
            key={data.id}
            initial={data}
            submitLabel={t('set.save')}
            onSubmit={async (body) => {
              await api.updateProblemSet(id, body);
              toast.success(t('set.saved'));
              router.push(`/bank/sets/${id}`);
            }}
          />
        )}
      </Container>
    </RequireRole>
  );
}
