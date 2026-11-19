'use client';

import { useTranslations } from 'use-intl';
import type { ScoreTone } from '@/lib/score-tone';
import { cn } from '@/lib/utils';

/**
 * How scores look on the results board and the class gradebook (OJ-33), so the two read the same way.
 * Colour is never the only signal: full scores are bold, partial ones carry a dot, and on both boards each score cell's
 * accessible name states the student, what it is for and score/max. Zero is slate-500, not lighter: it still has to pass
 * 4.5:1 as text.
 */
export const TONE_TEXT: Record<ScoreTone, string> = {
  full: 'font-semibold text-chalk-700',
  partial: 'text-amber-700',
  none: 'text-slate-500',
};

/** Dotted until hovered or focused: says "this opens something" without making a board look like a page of links. */
export const CLICKABLE =
  'underline decoration-dotted decoration-slate-400 underline-offset-4 hover:decoration-solid focus-visible:decoration-solid';

/** The partial-score mark; amber-600 keeps it above 3:1 against the table. */
export function PartialDot() {
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" aria-hidden="true" />;
}

/** Drawn exactly as the cells are: bold green, amber with a dot, plain grey. */
export function ScoreLegend() {
  const t = useTranslations('session.results.legend');
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-4 py-2 text-xs text-slate-500">
      {(['full', 'partial', 'none'] as const).map((tone) => (
        <span key={tone} className={cn('inline-flex items-center gap-1', TONE_TEXT[tone])}>
          {tone === 'partial' && <PartialDot />}
          {t(tone)}
        </span>
      ))}
      <span>{t('hint')}</span>
    </p>
  );
}
