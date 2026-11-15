'use client';

import { LanguageLabels } from '@oj/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { CodeBlock } from '@/components/code-block';
import { CopyButton } from '@/components/problem-statement';
import { SubmissionSummary, useSubmissionPolling } from '@/components/submission-result';
import { Card, ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { sessionHref, solveHref } from '@/lib/sessions';
import { formatDateTime } from '@/lib/utils';

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isStaff } = useAuth();
  const t = useTranslations('session.detail');
  const { data: sub, error } = useSubmissionPolling(id);

  if (!sub && error) {
    return (
      <Container>
        <ErrorState message={error} />
      </Container>
    );
  }
  if (!sub) return <PageSkeleton />;

  const problemHref = solveHref(sub.sessionId, sub.problemKey);

  return (
    <Container>
      <PageHeader
        back={{ href: '/submissions', label: t('back') }}
        title={
          <span>
            {t.rich('title', {
              title: sub.problemTitle,
              link: (c) => (
                <Link href={problemHref} className="text-ink-600 hover:underline">
                  {c}
                </Link>
              ),
            })}
          </span>
        }
        subtitle={
          <>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {isStaff && <b className="text-slate-700">{sub.userDisplayName}</b>}
              <Link href={sessionHref(sub.sessionId)} className="hover:text-ink-700">
                {t('session', { title: sub.sessionTitle })}
              </Link>
              <span>{LanguageLabels[sub.language] ?? sub.language}</span>
              <span>{t('submittedAt', { time: formatDateTime(sub.createdAt) })}</span>
              {sub.judgedAt && <span>{t('judgedAt', { time: formatDateTime(sub.judgedAt) })}</span>}
            </span>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t('result')}</h2>
          <SubmissionSummary sub={sub} />
        </Card>
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <h2 className="font-semibold">{t('source')}</h2>
            <CopyButton text={sub.sourceCode} />
          </div>
          <div className="p-3">
            <CodeBlock code={sub.sourceCode} language={sub.language} maxHeight="70vh" />
          </div>
        </Card>
      </div>
    </Container>
  );
}
