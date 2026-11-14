'use client';

import type { AiFeature } from '@oj/contracts';
import { Crown } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { showUsesLeft, useAiFeature, useAiUsage } from '@/lib/ai-usage';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { cn, formatDate } from '@/lib/utils';

/** Full AI access (administrators, VIP teachers, organization AI): only the AI-usage check of a session needs it now. */
export function useCanUseAi(): boolean {
  return useAuth().user?.canUseAi ?? false;
}

/**
 * True when the server says it has no Claude key (OJ-13, UAT L9): AI controls are then shown disabled with
 * `common.ai.notConfigured` as the reason, instead of failing with a toast when used.
 */
export function useAiNotConfigured(): boolean {
  return useFeatures()?.ai === false;
}

/** Shown in place of an AI control for regular (non-VIP) teacher accounts. */
export function VipOnly({ label = 'AI', className }: { label?: string; className?: string }) {
  const t = useTranslations('common.ai');
  return (
    <span
      title={t('vipHint')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200',
        className,
      )}
    >
      <Crown className="h-3 w-3" />
      {t('vipOnly', { label })}
    </span>
  );
}

/**
 * "Còn 2/3 lượt tháng này" next to an AI control (OJ-21); when used up, the reset date and the VIP hint instead.
 * Nothing for unlimited accounts, and for VIP only when it is running low.
 */
export function AiUsesLeft({ feature, className }: { feature: AiFeature; className?: string }) {
  const t = useTranslations('common.ai');
  const { user } = useAuth();
  const state = useAiFeature(feature);
  if (!showUsesLeft(user?.aiPlan, state)) return null;
  if (state.exhausted) {
    const date = state.resetsAt ? formatDate(state.resetsAt) : '';
    // Import still works without AI (the basic reader), so it is a note, not a stop.
    const soft = feature === 'IMPORT';
    return (
      <span className={cn('text-xs', soft ? 'text-slate-500' : 'text-mark-700', className)} title={t('exhaustedHint')}>
        {soft ? t('exhaustedImport', { date }) : t('exhausted', { date })}
      </span>
    );
  }
  return (
    <span className={cn('text-xs whitespace-nowrap text-slate-500 tabular-nums', className)}>
      {t('usesLeft', { left: state.left ?? 0, limit: state.limit ?? 0 })}
    </span>
  );
}

/** The reason an AI control is disabled, or undefined: no key on the server, or this month's uses are gone. */
export function useAiBlockedReason(feature: AiFeature): string | undefined {
  const t = useTranslations('common.ai');
  const notConfigured = useAiNotConfigured();
  const state = useAiFeature(feature);
  if (notConfigured) return t('notConfigured');
  if (state.exhausted) return `${t('exhausted', { date: state.resetsAt ? formatDate(state.resetsAt) : '' })}. ${t('exhaustedHint')}`;
  return undefined;
}

const CARD_FEATURES: AiFeature[] = ['IMPORT', 'IMAGE_IMPORT', 'SECTION', 'TESTS', 'AI_USAGE_CHECK'];

/** This month's AI uses for the signed-in teacher (OJ-21): on the teacher home page. Nothing for administrators. */
export function AiUsageCard() {
  const t = useTranslations('common.ai.usage');
  const usage = useAiUsage();
  if (!usage || !usage.aiAvailable || usage.plan === 'UNLIMITED' || usage.plan === 'NONE') return null;
  const rows = usage.features.filter((f) => CARD_FEATURES.includes(f.feature) && f.limit !== 0);
  return (
    <section className="rounded-panel border border-rule bg-surface px-5 py-4" aria-labelledby="ai-usage-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ai-usage-title" className="font-semibold text-slate-900">{t('title')}</h2>
        <span className="text-xs text-slate-500">{t(`plan.${usage.plan}`)}</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((f) => {
          const left = f.limit === null ? null : Math.max(0, f.limit - f.used);
          return (
            <li key={f.feature}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-700">{t(`feature.${f.feature}`)}</span>
                <span className={cn('text-xs tabular-nums', left === 0 ? 'font-medium text-mark-700' : 'text-slate-500')}>
                  {f.limit === null ? t('unlimited') : t('used', { used: f.used, limit: f.limit })}
                </span>
              </div>
              {f.limit !== null && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className={cn('h-full rounded-full', left === 0 ? 'bg-mark-solid' : 'bg-ink-solid')}
                    style={{ width: `${Math.min(100, Math.round((f.used / Math.max(1, f.limit)) * 100))}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        {t('resets', { date: formatDate(usage.resetsAt) })}
        {usage.plan === 'FREE' && <> {t('vipMore')}</>}
      </p>
    </section>
  );
}

/** On the integrity page: AI-usage checks are paused because this month's allowance is used up (OJ-21). */
export function AiChecksPaused() {
  const t = useTranslations('common.ai.usage');
  const usage = useAiUsage();
  const row = usage?.features.find((f) => f.feature === 'AI_USAGE_CHECK');
  if (!usage || !row || row.limit === null || row.limit === 0 || row.used < row.limit) return null;
  return (
    <p role="status" className="mb-4 rounded-panel border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      {t('checksPaused', { limit: row.limit, date: formatDate(usage.resetsAt) })}
    </p>
  );
}
