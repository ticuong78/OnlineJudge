'use client';

import type { SubmissionDetailDto } from '@oj/contracts';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { cn, formatMemory, formatTime, scoreLabel } from '@/lib/utils';
import { Spinner, VerdictBadge } from './ui';

/** Polls GET /submissions/:id every ~1s until status === 'DONE'. */
export function useSubmissionPolling(id: string | null) {
  const [data, setData] = useState<SubmissionDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      try {
        const d = await api.getSubmission(id);
        if (cancelled) return;
        failures = 0;
        setData(d);
        setError(null);
        if (d.status !== 'DONE') timer = setTimeout(tick, 1000);
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

  return { data, error };
}

export function TestResultsTable({ sub }: { sub: SubmissionDetailDto }) {
  const t = useTranslations('session.result');
  const tv = useTranslations('enums.verdict');
  if (!sub.testResults || sub.testResults.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold whitespace-nowrap text-slate-500">
          <tr>
            <th className="px-3 py-2 w-16">{t('colTest')}</th>
            <th className="px-3 py-2">{t('colResult')}</th>
            <th className="px-3 py-2 w-24 text-right">{t('colTime')}</th>
            <th className="px-3 py-2 w-24 text-right">{t('colMemory')}</th>
            <th className="px-3 py-2 w-16 text-right">{t('colPoints')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sub.testResults.map((r, i) => (
            <tr key={r.testCaseId || i}>
              <td className="px-3 py-1.5 text-xs tabular-nums text-slate-500">#{i + 1}</td>
              <td className="px-3 py-1.5">
                <span
                  className={cn('font-medium', r.verdict === 'AC' ? 'text-chalk-600' : 'text-mark-600')}
                  title={tv(r.verdict)}
                >
                  {r.verdict}
                </span>
                <span className="ml-2 text-xs text-slate-500">{tv(r.verdict)}</span>
                {r.message && <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{r.message}</div>}
              </td>
              <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap text-slate-600">{formatTime(r.timeMs)}</td>
              <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap text-slate-600">{formatMemory(r.memoryKb)}</td>
              <td className="px-3 py-1.5 text-right text-xs text-slate-600">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The teacher's mark: score written by hand and circled, in red pen (or chalk green for full marks).
 * `points`: the problem's worth in the session; the mark then shows points earned, else a percentage (K-1).
 */
export function ScoreMark({ score, animateKey, points }: { score: number; animateKey: string; points?: number | null }) {
  const full = score >= 100;
  const label = scoreLabel(score, points);
  const color = full ? 'var(--color-chalk)' : 'var(--color-mark)';
  return (
    <div
      key={animateKey}
      className="relative flex h-[76px] w-[104px] shrink-0 items-center justify-center"
      role="img"
      aria-label={label.spoken}
    >
      <svg viewBox="0 0 104 76" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          className="score-ring"
          d="M60 7 C 28 4, 6 18, 8 40 C 10 62, 40 72, 66 68 C 92 64, 102 44, 96 26 C 91 12, 72 4, 46 8"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="score-digits flex items-baseline font-hand leading-none" style={{ color }}>
        <span className={label.value.length > 3 ? 'text-[30px]' : 'text-[44px]'}>{label.value}</span>
        <span className="text-[16px]">{label.unit}</span>
      </span>
    </div>
  );
}

/** One square of the exercise-book grid per test: filled chalk for AC, crossed in red otherwise. */
export function TestStrip({ sub }: { sub: SubmissionDetailDto }) {
  const t = useTranslations('session.result');
  const tv = useTranslations('enums.verdict');
  const results = sub.testResults ?? [];
  if (results.length === 0) return null;
  return (
    <ol className="flex flex-wrap gap-[3px]" aria-label={t('stripLabel')}>
      {results.map((r, i) => {
        const ok = r.verdict === 'AC';
        return (
          <li
            key={r.testCaseId || i}
            title={t('testTitle', { n: i + 1, verdict: tv(r.verdict), time: formatTime(r.timeMs) })}
            className={cn(
              'flex h-6 w-6 items-center justify-center border text-[10px] font-semibold tabular-nums',
              ok ? 'border-chalk-solid bg-chalk-solid text-white' : 'border-mark-300 bg-surface text-mark-600',
            )}
          >
            {ok ? (
              <span className="sr-only">{t('testPassed', { n: i + 1 })}</span>
            ) : (
              <>
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                  <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="sr-only">{t('testFailed', { n: i + 1, verdict: tv(r.verdict) })}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type ResultT = ReturnType<typeof useTranslations<'session.result'>>;
type VerdictT = ReturnType<typeof useTranslations<'enums.verdict'>>;
const HINTED = ['WA', 'TLE', 'MLE', 'RE'] as const;

function headline(sub: SubmissionDetailDto, t: ResultT, tv: VerdictT): { text: string; hint?: string } {
  const results = sub.testResults ?? [];
  const firstFail = results.findIndex((r) => r.verdict !== 'AC');
  const total = results.length;
  switch (sub.verdict) {
    case 'AC':
      return { text: total ? t('allPassed', { total }) : tv('AC') };
    case 'CE':
      return { text: tv('CE'), hint: t('ceHint') };
    case 'IE':
      return { text: t('ieTitle'), hint: t('ieHint') };
    default: {
      const label = sub.verdict ? tv(sub.verdict) : t('notPassed');
      const passed = results.filter((r) => r.verdict === 'AC').length;
      const v = HINTED.find((x) => x === sub.verdict);
      return {
        text: firstFail >= 0 ? t('atTest', { label, n: firstFail + 1 }) : label,
        hint: [total ? t('passedCount', { passed, total }) : '', v ? t(`hints.${v}`) : ''].filter(Boolean).join(' '),
      };
    }
  }
}

export function SubmissionSummary({ sub, compact, points }: { sub: SubmissionDetailDto; compact?: boolean; points?: number | null }) {
  const t = useTranslations('session.result');
  const tv = useTranslations('enums.verdict');
  const tc = useTranslations('common');
  const ts = useTranslations('session');
  const done = sub.status === 'DONE';
  if (!done) {
    return (
      <div className="flex items-center gap-4" aria-live="polite">
        <div className="grid-paper flex h-[76px] w-[104px] shrink-0 items-center justify-center rounded-control border border-rule">
          <Spinner />
        </div>
        <div>
          <p className="font-semibold text-slate-800">{sub.status === 'PENDING' ? t('pending') : tc('status.judging')}</p>
          <p className="text-sm text-slate-500">{t('pendingHint')}</p>
        </div>
      </div>
    );
  }
  if (sub.resultsHidden) {
    return (
      <div className="flex items-center gap-4" aria-live="polite">
        <div className="grid-paper flex h-[76px] w-[104px] shrink-0 items-center justify-center rounded-control border border-rule">
          <CheckCircle2 className="h-7 w-7 text-ink-500" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-slate-800">{ts('submitted')}</p>
          <p className="text-sm text-slate-500">{t('hiddenHint')}</p>
        </div>
      </div>
    );
  }
  const h = headline(sub, t, tv);
  const good = sub.verdict === 'AC';
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex items-center gap-4">
        <ScoreMark score={sub.score} animateKey={sub.id} points={points} />
        <div className="min-w-0 space-y-2">
          <p className={cn('text-lg leading-snug font-semibold', good ? 'text-chalk-700' : 'text-mark-700')}>{h.text}</p>
          {h.hint && <p className="text-sm text-slate-600">{h.hint}</p>}
          {!sub.testsHidden && <TestStrip sub={sub} />}
          <p className="flex flex-wrap gap-x-4 text-xs text-slate-500">
            <span>{t('maxTime', { time: formatTime(sub.maxTimeMs) })}</span>
            <span>{t('maxMemory', { memory: formatMemory(sub.maxMemoryKb) })}</span>
          </p>
        </div>
      </div>
      {sub.compileOutput && (sub.verdict === 'CE' || !compact) && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500">{t('compileOutput')}</div>
          <pre className="max-h-60 overflow-auto rounded-control border border-rule bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-mark-800">
            {sub.compileOutput}
          </pre>
        </div>
      )}
      {!sub.testsHidden && (sub.testResults?.length ?? 0) > 0 && (
        <details open={!compact} className="group">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-ink-700">{t('testDetails')}</summary>
          <div className="mt-2">
            <TestResultsTable sub={sub} />
          </div>
        </details>
      )}
    </div>
  );
}
