'use client';

import { useTranslations } from 'use-intl';
import { SubmissionsTable } from '@/components/submissions-table';
import type { SessionPoints } from '@/lib/score-tone';
import { EmptyState, ErrorState, LinkButton, Modal, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { studentSubmissionsHref } from '@/lib/results-links';
import { useAsync } from '@/lib/use-async';

const PANEL_SIZE = 50;

export interface StudentWorkTarget {
  userId: string;
  displayName: string;
  /** One problem (a score cell), or every problem (the student's name). */
  problem?: { key: string; n: number };
}

/**
 * One student's attempts in a session, opened from the results board (OJ-30). The API refuses a student filter outside
 * a session the teacher manages, so this only ever shows what the board's owner may see.
 */
export function StudentWorkPanel({
  sessionId,
  target,
  onClose,
  maxPoints,
}: {
  sessionId: string;
  target: StudentWorkTarget | null;
  onClose: () => void;
  /** This session's problem points, so the attempts show points as the board does (OJ-33). */
  maxPoints?: SessionPoints;
}) {
  const t = useTranslations('session.results.panel');
  const { data, error, loading, reload } = useAsync(
    () =>
      api.listSubmissions({
        sessionId,
        userId: target!.userId,
        problemKey: target!.problem?.key,
        pageSize: PANEL_SIZE,
      }),
    [sessionId, target?.userId, target?.problem?.key],
    !!target,
  );

  const name = target?.displayName ?? '';
  const title = target?.problem ? t('titleProblem', { name, n: target.problem.n }) : t('titleAll', { name });
  const more = data ? data.total - data.items.length : 0;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={title}
      wide
      footer={
        target && (
          <LinkButton href={studentSubmissionsHref(sessionId, target.userId)} variant="secondary" size="sm">
            {t('all')}
          </LinkButton>
        )
      }
    >
      {loading && !data ? (
        <TableSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={target?.problem ? t('empty') : t('emptyAll')} />
      ) : (
        <div className="-mx-5 flex flex-col gap-2">
          <p className="px-5 text-sm text-slate-500">{t('count', { count: data.total })}</p>
          <SubmissionsTable items={data.items} showProblem={!target?.problem} maxPoints={maxPoints} />
          {more > 0 && <p className="px-5 text-sm text-slate-500">{t('more', { count: more })}</p>}
        </div>
      )}
    </Modal>
  );
}
