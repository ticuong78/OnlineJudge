'use client';

import { Suspense } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { PathsSection } from '@/components/paths';
import { PracticeByTopic } from '@/components/practice-topics';
import { SessionList } from '@/components/sessions';
import { Card, ErrorState, ListSkeleton, PageHeader } from '@/components/ui';
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
      <PathsSection />
      {/* It reads ?topic=, which Next.js only allows inside a Suspense boundary. */}
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <PracticeByTopic />
      </Suspense>
      <Card>
        {loading && !data ? (
          <ListSkeleton />
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
