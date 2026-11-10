'use client';

import type { Difficulty } from '@oj/contracts';
import { Check, Clock, Copy, Cpu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { copyToClipboard } from '@/lib/utils';
import { Markdown } from './markdown';
import { Badge, DifficultyBadge } from './ui';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations('session.statement');
  const tc = useTranslations('common');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className="no-print inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-slate-500 hover:bg-slate-200 hover:text-slate-800"
    >
      {done ? <Check className="h-3.5 w-3.5 shrink-0 text-chalk-600" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
      {done ? t('copied') : (label ?? tc('copy'))}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export interface SampleIO {
  input: string;
  expectedOutput: string;
}

export function SampleTests({ samples, copyable = true }: { samples: SampleIO[]; copyable?: boolean }) {
  const ts = useTranslations('session.statement');
  if (samples.length === 0) return null;
  return (
    <div className="space-y-4">
      {samples.map((t, i) => (
        <div key={i} className="sample-block">
          <div className="mb-1 text-sm font-medium text-slate-600">{ts('sample', { n: i + 1 })}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(['input', 'expectedOutput'] as const).map((k) => (
              <div key={k} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1">
                  <span className="text-xs font-semibold text-slate-500">{k === 'input' ? 'Input' : 'Output'}</span>
                  {copyable && <CopyButton text={t[k]} />}
                </div>
                <pre className="io-block max-h-64 overflow-auto bg-white px-3 py-2">{t[k] || ' '}</pre>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Everything a statement needs; fits both bank problems and frozen session problems. */
export interface StatementLike {
  code: string;
  title: string;
  difficulty: Difficulty;
  tags?: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
}

export function ProblemStatement({
  problem,
  samples,
  points,
}: {
  problem: StatementLike;
  samples: SampleIO[];
  points?: number;
}) {
  const t = useTranslations('session');
  const tf = useTranslations('enums.problemTextField');
  return (
    <article>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium tabular-nums">{problem.code}</span>
        <DifficultyBadge difficulty={problem.difficulty} />
        {points !== undefined && <Badge className="bg-ink-100 text-ink-700">{t('points', { points })}</Badge>}
        {(problem.tags ?? []).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{problem.title}</h1>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          {t.rich('statement.timeLimit', { ms: String(problem.timeLimitMs), b: (c) => <b>{c}</b> })}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Cpu className="h-4 w-4 shrink-0 text-slate-400" />
          {t.rich('statement.memoryLimit', { mb: String(problem.memoryLimitMb), b: (c) => <b>{c}</b> })}
        </span>
      </div>

      <div className="mt-4 max-w-[75ch]">
        <Markdown>{problem.statement}</Markdown>
        {problem.inputFormat?.trim() && (
          <Section title={tf('inputFormat')}>
            <Markdown>{problem.inputFormat}</Markdown>
          </Section>
        )}
        {problem.outputFormat?.trim() && (
          <Section title={tf('outputFormat')}>
            <Markdown>{problem.outputFormat}</Markdown>
          </Section>
        )}
        {problem.constraints?.trim() && (
          <Section title={tf('constraints')}>
            <Markdown>{problem.constraints}</Markdown>
          </Section>
        )}
      </div>
      {samples.length > 0 && (
        <Section title={t('statement.samples')}>
          <SampleTests samples={samples} />
        </Section>
      )}
    </article>
  );
}
