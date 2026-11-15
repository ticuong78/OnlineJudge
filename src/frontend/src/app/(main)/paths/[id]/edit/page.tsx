'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { PathEditor } from '@/components/path-editor';
import { ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export default function EditPathPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('paths.editor');
  const tp = useTranslations('paths.page');
  const { data: path, error, loading, reload } = useAsync(() => api.getPath(id), [id]);
  return (
    <RequireRole roles={STAFF}>
      {loading && !path ? (
        <PageSkeleton />
      ) : error || !path || !path.canEdit ? (
        <Container>
          <ErrorState message={error ?? tp('notFound')} onRetry={reload} />
        </Container>
      ) : (
        <Container>
          <PageHeader back={{ href: `/paths/${path.id}`, label: path.title }} title={t('editTitle')} subtitle={t('subtitle')} />
          <PathEditor path={path} />
        </Container>
      )}
    </RequireRole>
  );
}
