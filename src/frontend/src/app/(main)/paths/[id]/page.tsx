'use client';

import { ArrowRight, CheckCircle2, Circle, Pencil, Shuffle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { Markdown } from '@/components/markdown';
import { ProgressBar } from '@/components/paths';
import { TopicBadge, TopicBadges } from '@/components/topics';
import { Badge, Card, DifficultyBadge, ErrorState, LinkButton, PageHeader, PageSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title';
import { solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';

/** A learning path (OJ-24): steps from easy to hard, the student's progress, and the next problem to try. */
export default function PathPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('paths.page');
  const ts = useTranslations('paths.section');
  const { data: path, error, loading, reload, errorStatus } = useAsync(() => api.getPath(id), [id]);
  usePageTitle(path?.title);

  if (loading && !path) return <PageSkeleton />;
  if (error || !path) {
    return (
      <Container>
        <ErrorState message={errorStatus === 404 ? t('notFound') : (error ?? t('notFound'))} onRetry={errorStatus === 404 ? undefined : reload} />
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        back={{ href: '/practice', label: t('back') }}
        title={path.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {path.topic && <TopicBadge tag={path.topic} />}
            <span>{ts('steps', { count: path.stepCount })}</span>
            <span>{ts('by', { name: path.ownerName })}</span>
          </span>
        }
        actions={
          path.canEdit && (
            <LinkButton href={`/paths/${path.id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" />
              {t('edit')}
            </LinkButton>
          )
        }
      />

      <Card className="mb-6 p-5">
        {path.description && <Markdown className="mb-4 max-w-[72ch]">{path.description}</Markdown>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-48 flex-1">
            <p className="text-sm text-slate-600 tabular-nums">{ts('progress', { solved: path.solved, total: path.total })}</p>
            <ProgressBar solved={path.solved} total={path.total} className="mt-1.5 max-w-md" />
          </div>
          {path.next ? (
            <LinkButton href={solveHref(path.next.sessionId, path.next.key)}>
              {t('continue', { title: path.next.title })}
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          ) : (
            <p className="text-sm font-medium text-chalk-700">{t('allDone')}</p>
          )}
        </div>
      </Card>

      <ol className="space-y-4">
        {path.steps.map((step, i) => (
          <li key={step.sessionId}>
            <Card className={cn('p-5', path.next?.stepIndex === i && 'ring-2 ring-ink-200')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-500 tabular-nums">{t('step', { n: i + 1 })}</span>
                <h2 className="font-semibold text-slate-900">{step.title}</h2>
                {step.review && (
                  <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" >
                    <Shuffle className="mr-1 h-3 w-3" aria-hidden="true" />
                    {t('review')}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-slate-500 tabular-nums">{t('stepProgress', { solved: step.solved, total: step.total })}</span>
              </div>
              <ProgressBar solved={step.solved} total={step.total} className="mt-2" />
              {step.note && <Markdown className="mt-3 max-w-[72ch] text-sm">{step.note}</Markdown>}
              {step.review && <p className="mt-2 text-xs text-slate-500">{t('reviewHint')}</p>}
              {!step.available ? (
                <p className="mt-3 text-sm text-slate-500">{t('unavailable')}</p>
              ) : (
                <>
                  {step.state !== 'OPEN' && <p className="mt-3 text-xs text-slate-500">{t('notOpen')}</p>}
                  <ul className="mt-3 divide-y divide-slate-100 rounded-panel border border-rule">
                    {step.problems.map((p) => (
                      <li key={p.key}>
                        <Link href={solveHref(step.sessionId, p.key)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                          {p.solved ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-chalk-600" aria-label={t('solved')} />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.title}</span>
                          <span className="hidden flex-wrap items-center gap-1.5 sm:flex">
                            <TopicBadges tags={p.tags} />
                          </span>
                          <DifficultyBadge difficulty={p.difficulty} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </Container>
  );
}
