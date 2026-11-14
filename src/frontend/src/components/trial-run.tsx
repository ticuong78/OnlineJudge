'use client';

import type { TrialRunDto, TrialRunTestDto } from '@oj/contracts';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { nextTrialPoll, TRIAL_FAST_FOR_MS, trialSummary } from '@/lib/trial';
import { cn, formatTime } from '@/lib/utils';
import { Spinner, VerdictBadge } from './ui';

/** Polls a trial run until it is done: every second for a minute, then every few seconds (OJ-18). */
export function useTrialPolling(id: string | null) {
  const [data, setData] = useState<TrialRunDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setSlow(false);
    if (!id) return;
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      try {
        const d = await api.getTrialRun(id);
        if (cancelled) return;
        failures = 0;
        setData(d);
        setError(null);
        const elapsed = Date.now() - startedAt;
        setSlow(d.status !== 'DONE' && elapsed >= TRIAL_FAST_FOR_MS);
        const wait = nextTrialPoll(d, elapsed);
        if (wait !== null) timer = setTimeout(tick, wait);
      } catch (e) {
        if (cancelled) return;
        failures++;
        setError(errorMessage(e));
        if (failures < 10) timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return { data, error, slow };
}

function Block({ label, children, tone, className }: { label: string; children: string; tone?: 'bad' | 'good'; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 text-xs font-semibold text-slate-500">{label}</div>
      <pre
        className={cn(
          'max-h-40 overflow-auto rounded-control border bg-surface px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words',
          tone === 'bad' ? 'border-mark-200 text-mark-800' : tone === 'good' ? 'border-chalk-200 text-slate-800' : 'border-rule text-slate-800',
        )}
      >
        {children}
      </pre>
    </div>
  );
}

function SampleRow({ test, n }: { test: TrialRunTestDto; n: number }) {
  const t = useTranslations('session.trial');
  const ran = test.verdict !== null;
  const output = test.output === null ? '' : test.output || t('noOutput');
  return (
    <li className="@container rounded-panel border border-rule bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-700">{t('sample', { n })}</span>
        {ran ? <VerdictBadge verdict={test.verdict} /> : <span className="text-xs text-slate-500">{t('notRun')}</span>}
        {test.timeMs !== null && <span className="text-xs text-slate-500 tabular-nums">{formatTime(test.timeMs)}</span>}
      </div>
      {/* Sized by the panel, not the screen (the editor column is narrow on laptops): expected and actual output side
          by side under the input, all three in a row when there is room, stacked when very narrow. */}
      <div className="grid gap-2 @xs:grid-cols-2 @2xl:grid-cols-3">
        <Block label={t('input')} className="@xs:col-span-2 @2xl:col-span-1">{test.input}</Block>
        <Block label={t('expected')}>{test.expectedOutput}</Block>
        {ran && <Block label={t('output')} tone={test.verdict === 'AC' ? 'good' : 'bad'}>{output}</Block>}
      </div>
      {test.message && <p className="mt-2 font-mono text-xs whitespace-pre-wrap text-mark-700">{test.message}</p>}
    </li>
  );
}

/** The result of a trial run: a headline, then each sample with input, expected and actual output. */
export function TrialResult({ trial, slow }: { trial: TrialRunDto; slow: boolean }) {
  const t = useTranslations('session.trial');
  const summary = trialSummary(trial);
  const waiting = summary.kind === 'pending' || summary.kind === 'judging';
  const good = summary.kind === 'passed';
  const headline =
    summary.kind === 'passed' || summary.kind === 'failed'
      ? summary.kind === 'passed'
        ? t('allPassed', { count: summary.total })
        : t('somePassed', { passed: summary.passed, total: summary.total })
      : t(summary.kind);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3" aria-live="polite">
        {waiting ? (
          <Spinner className="mt-0.5 h-5 w-5" />
        ) : good ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-chalk-600" aria-hidden="true" />
        ) : (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-mark-600" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className={cn('font-semibold', waiting ? 'text-slate-800' : good ? 'text-chalk-700' : 'text-mark-700')}>{headline}</p>
          <p className="text-xs text-slate-500">{waiting && slow ? t('slow') : good ? t('reminder') : t('notCounted')}</p>
        </div>
      </div>
      {trial.compileOutput && (
        <pre className="max-h-60 overflow-auto rounded-control border border-rule bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-mark-800">
          {trial.compileOutput}
        </pre>
      )}
      {summary.kind !== 'compileError' && (
        <ol className="space-y-2">
          {trial.tests.map((test, i) => (
            <SampleRow key={i} test={test} n={i + 1} />
          ))}
        </ol>
      )}
    </div>
  );
}
