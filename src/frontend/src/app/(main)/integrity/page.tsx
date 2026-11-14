'use client';

import type { IntegrityFlagStatus } from '@oj/contracts';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { FlagList } from '@/components/integrity';
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { AiChecksPaused } from '@/components/ai-access';

export default function IntegrityPage() {
  const t = useTranslations('admin.integrity');
  const [status, setStatus] = useState<IntegrityFlagStatus>('OPEN');
  const { data, error, loading, reload } = useAsync(() => api.listIntegrityFlags({ status }), [status]);
  const flags = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
        />
        <AiChecksPaused />
        <div className="mb-4 inline-flex rounded-control bg-slate-100 p-1 text-sm">
          {(['OPEN', 'ACKNOWLEDGED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn('rounded-[4px] px-3 py-1 whitespace-nowrap', status === s ? 'bg-surface font-medium ring-1 ring-slate-300' : 'text-slate-600')}
            >
              {t(`status.${s}`)}
            </button>
          ))}
        </div>
        <Card>
          {loading && !data ? (
            <ListSkeleton />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : flags.length === 0 ? (
            <EmptyState title={status === 'OPEN' ? t('emptyOpen') : t('emptyAcknowledged')}>
              {t('emptyBody')}
            </EmptyState>
          ) : (
            <FlagList flags={flags} showSession />
          )}
        </Card>
      </Container>
    </RequireRole>
  );
}
