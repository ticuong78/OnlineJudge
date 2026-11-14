'use client';

import { normalizeTag } from '@oj/contracts';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api';
import { solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { TopicBadges, TopicPicker } from './topics';
import { Card, DifficultyBadge, ErrorState, ListSkeleton } from './ui';

/**
 * Practice by topic (OJ-20): the topics of the open practice problems (counted by the server, uncapped), then the
 * problems of the chosen one (asked of the server by topic). The choice lives in the address (`?topic=dp`), so học bạ
 * can link straight to a topic; any spelling works (`?topic=Quy hoạch động`).
 */
export function PracticeByTopic() {
  const t = useTranslations('topics.practice');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('topic') ?? '';
  const topic = raw ? normalizeTag(raw) : '';
  const topics = useAsync(() => api.practiceTopics(), []);
  const list = useAsync(() => (topic ? api.practiceProblems(topic) : Promise.resolve(null)), [topic]);
  const choose = (tags: string[]) => {
    const next = tags[0] ?? '';
    router.replace(next ? `${pathname}?topic=${encodeURIComponent(next)}` : pathname, { scroll: false });
  };

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold text-slate-900">{t('title')}</h2>
      <p className="mt-1 mb-3 text-sm text-slate-600">{t('hint')}</p>
      {topics.loading && !topics.data ? (
        <ListSkeleton rows={2} />
      ) : topics.error ? (
        <ErrorState message={topics.error} onRetry={topics.reload} />
      ) : (
        <>
          <TopicPicker counts={topics.data ?? []} value={topic ? [topic] : []} onChange={choose} single />
          {topic &&
            (list.loading && !list.data ? (
              <ListSkeleton rows={2} className="mt-4" />
            ) : list.error ? (
              <ErrorState message={list.error} onRetry={list.reload} />
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-panel border border-rule">
                {(list.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-slate-500">{t('empty')}</li>}
                {(list.data ?? []).map((p) => (
                  <li key={`${p.sessionId}/${p.key}`}>
                    <Link href={solveHref(p.sessionId, p.key)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      {/* Three short lines, also on phones: title (and a solved mark), difficulty and the other topics,
                          then the session cut to one line. */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-slate-900">{p.title}</span>
                          {p.solved && (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-chalk-700" title={t('solved')}>
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only sm:not-sr-only">{t('solved')}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <DifficultyBadge difficulty={p.difficulty} />
                          <TopicBadges tags={p.tags.filter((x) => x !== topic)} />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{t('inSession', { session: p.sessionTitle })}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          {!topic && (topics.data?.length ?? 0) > 0 && <p className="mt-3 text-sm text-slate-500">{t('pick')}</p>}
        </>
      )}
    </Card>
  );
}
