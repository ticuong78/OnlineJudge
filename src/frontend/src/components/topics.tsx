'use client';

import { isTopicId } from '@oj/contracts';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { orderTagCounts, PICKER_COLLAPSED } from '@/lib/topics';
import { cn } from '@/lib/utils';
import { Badge } from './ui';

/** A tag's display name: the standard topic's name in the interface language, or the free tag as written (OJ-20). */
export function useTagLabel() {
  const t = useTranslations('topics.names');
  return (tag: string) => (isTopicId(tag) ? t(tag) : tag);
}

/** One tag as a small badge. */
export function TopicBadge({ tag, className }: { tag: string; className?: string }) {
  const label = useTagLabel();
  return <Badge className={cn('bg-slate-100 text-slate-600', className)}>{label(tag)}</Badge>;
}

export function TopicBadges({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <TopicBadge key={tag} tag={tag} />
      ))}
    </span>
  );
}

/**
 * Choose one or more topics from those in use, each with its count. Chosen ones are filled; the list collapses to the
 * most used. `single` makes it a one-topic choice (practice).
 */
export function TopicPicker({
  counts,
  value,
  onChange,
  single,
  className,
}: {
  counts: { tag: string; count: number }[];
  value: string[];
  onChange: (tags: string[]) => void;
  single?: boolean;
  className?: string;
}) {
  const t = useTranslations('topics.picker');
  const label = useTagLabel();
  const [all, setAll] = useState(false);
  // A chosen tag stays visible (with 0) when the counts no longer have it, e.g. after switching the bank scope.
  const known = new Set(counts.map((c) => c.tag));
  const ordered = orderTagCounts([...counts, ...value.filter((tag) => !known.has(tag)).map((tag) => ({ tag, count: 0 }))], value);
  const shown = all ? ordered : ordered.slice(0, Math.max(PICKER_COLLAPSED, value.length));
  const toggle = (tag: string) =>
    onChange(value.includes(tag) ? value.filter((x) => x !== tag) : single ? [tag] : [...value, tag]);

  if (!ordered.length) return <p className={cn('text-sm text-slate-500', className)}>{t('none')}</p>;
  return (
    // One topic at a time is a radio group; several is a group of toggle buttons.
    <div role={single ? 'radiogroup' : 'group'} aria-label={t('label')} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map(({ tag, count }) => {
        const on = value.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            {...(single ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
            onClick={() => toggle(tag)}
            className={cn(
              'inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
              on
                ? 'border-ink-solid bg-ink-solid text-white hover:bg-ink-solid-hover'
                : isTopicId(tag)
                  ? 'border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100'
                  : 'border-rule bg-surface text-slate-600 hover:bg-slate-100',
            )}
          >
            {on && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
            {t('count', { name: label(tag), count })}
          </button>
        );
      })}
      {ordered.length > shown.length || all ? (
        <button type="button" className="min-h-7 px-1 text-xs text-ink-600 hover:underline" onClick={() => setAll((a) => !a)}>
          {all ? t('showFewer') : t('showAll', { count: ordered.length })}
        </button>
      ) : null}
      {value.length > 0 && (
        <button
          type="button"
          className="inline-flex min-h-7 items-center gap-1 px-1 text-xs text-slate-500 hover:text-slate-800"
          onClick={() => onChange([])}
        >
          <X className="h-3 w-3" aria-hidden="true" />
          {t('clear')}
        </button>
      )}
    </div>
  );
}
