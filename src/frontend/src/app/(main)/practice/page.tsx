'use client';

import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { SessionList } from '@/components/sessions';
import { Card, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sortSessions } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';

export default function PracticePage() {
  const { isStaff } = useAuth();
  const t = useTranslations('student.practice');
  const { data, error, loading, reload } = useAsync(() => api.listSessions({ audience: 'PUBLIC' }), []);
  return (
    <Container>
      <PageHeader
        title={t('title')}
        subtitle={isStaff ? t('subtitleStaff') : t('subtitle')}
      />
      <Card>
        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : (
          <SessionList
            sessions={sortSessions(data ?? [])}
            emptyTitle={t('emptyTitle')}
            emptyHint={isStaff ? t('emptyHintStaff') : t('emptyHint')}
          />
        )}
      </Card>
    </Container>
  );
}
