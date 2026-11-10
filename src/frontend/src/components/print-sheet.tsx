'use client';

import { LanguageLabels, type AnswerKeyDto, type ProblemDetailDto } from '@oj/contracts';
import { ChevronLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { CodeBlock } from './code-block';
import { RequireAuth, RequireRole, STAFF } from './guards';
import { Markdown } from './markdown';
import { Button, ErrorState, LoadingState } from './ui';

function Toolbar({ setId, title, hint }: { setId: string; title: string; hint: string }) {
  const t = useTranslations('bank.print');
  return (
    <div className="no-print sticky top-0 z-10 border-b border-rule bg-white">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-3">
        <Link href={`/bank/sets/${setId}`} className="inline-flex shrink-0 items-center gap-1 text-sm whitespace-nowrap text-slate-600 hover:text-ink-700">
          <ChevronLeft className="h-4 w-4 shrink-0" />
          {t('backToSet')}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{title}</div>
          <div className="hidden text-xs text-slate-500 sm:block">{hint}</div>
        </div>
        <Button className="shrink-0 whitespace-nowrap" onClick={() => window.print()}>
          <Printer className="h-4 w-4 shrink-0" />
          {t('print')}
        </Button>
      </div>
    </div>
  );
}

function SheetHeader({ data, answerKey }: { data: AnswerKeyDto; answerKey: boolean }) {
  const t = useTranslations('bank.print');
  const tType = useTranslations('enums.problemSetType');
  const s = data.problemSet;
  return (
    <header className="mb-6 border-b-2 border-black pb-4 text-center">
      <div className="text-sm">{tType(s.type)}</div>
      <h1 className="mt-1 text-[20pt] leading-tight font-bold">{s.title}</h1>
      {answerKey && <div className="mt-1 text-[13pt] font-bold">{t('answerKeyHeading')}</div>}
      <div className="mt-2 flex flex-wrap justify-center gap-x-6 text-sm">
        <span>{t('summary', { count: data.problems.length, points: s.totalPoints })}</span>
        <span>{t('duration')}</span>
      </div>
      {!answerKey && (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-6 text-left text-[12pt]">
          <span className="min-w-0 overflow-hidden whitespace-nowrap">{t('studentName')}</span>
          <span className="whitespace-nowrap">{t('className')}</span>
        </div>
      )}
    </header>
  );
}

function SampleTable({ p }: { p: ProblemDetailDto }) {
  const t = useTranslations('bank.print');
  const samples = p.testCases.filter((t) => t.isSample).sort((a, b) => a.order - b.order);
  if (samples.length === 0) return null;
  return (
    <div className="avoid-break mt-3">
      <div className="mb-1 font-bold">{t('samples')}</div>
      <table className="w-full border-collapse text-[11pt]">
        <thead>
          <tr>
            <th className="w-1/2 border border-black px-2 py-1 text-left">{t('input')}</th>
            <th className="w-1/2 border border-black px-2 py-1 text-left">{t('output')}</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((t) => (
            <tr key={t.id} className="sample-block align-top">
              <td className="border border-black px-2 py-1">
                <pre className="io-block">{t.input}</pre>
              </td>
              <td className="border border-black px-2 py-1">
                <pre className="io-block">{t.expectedOutput}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="font-bold">{label}</div>
      {children}
    </div>
  );
}

function ProblemBlock({ p, index, answerKey }: { p: AnswerKeyDto['problems'][number]; index: number; answerKey: boolean }) {
  const t = useTranslations('bank.print');
  const tField = useTranslations('enums.problemTextField');
  return (
    <section className="print-problem mb-10">
      <h2 className="text-[14pt] leading-snug font-bold">
        {t('problemHeading', { n: index + 1, title: p.title })}{' '}
        <span className="font-normal">{t('problemPoints', { points: p.points })}</span>
      </h2>
      <div className="mb-2 text-[10.5pt]">
        {t('limits', { time: p.timeLimitMs, memory: p.memoryLimitMb })}
      </div>
      {answerKey ? (
        <details open className="text-[11pt]">
          <summary className="no-print cursor-pointer text-sm text-slate-500">{tField('statement')}</summary>
          <Markdown className="prose-sm!">{p.statement}</Markdown>
        </details>
      ) : (
        <Markdown>{p.statement}</Markdown>
      )}
      {p.inputFormat?.trim() && (
        <Labeled label={tField('inputFormat')}>
          <Markdown>{p.inputFormat}</Markdown>
        </Labeled>
      )}
      {p.outputFormat?.trim() && (
        <Labeled label={tField('outputFormat')}>
          <Markdown>{p.outputFormat}</Markdown>
        </Labeled>
      )}
      {p.constraints?.trim() && (
        <Labeled label={tField('constraints')}>
          <Markdown>{p.constraints}</Markdown>
        </Labeled>
      )}
      <SampleTable p={p} />

      {answerKey && (
        <div className="mt-5 border-t border-black pt-3">
          <div className="text-[13pt] font-bold">{t('guide')}</div>
          {p.solution?.explanation?.trim() ? (
            <Markdown>{p.solution.explanation}</Markdown>
          ) : (
            <p className="italic">{t('noGuide')}</p>
          )}
          {p.solution?.code?.trim() && (
            <div className="mt-3">
              <div className="mb-1 font-bold">
                {p.solution.language
                  ? t('sampleProgramIn', { language: LanguageLabels[p.solution.language] })
                  : t('sampleProgram')}
              </div>
              <CodeBlock code={p.solution.code} language={p.solution.language} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SheetContent({ answerKey }: { answerKey: boolean }) {
  const t = useTranslations('bank.print');
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(() => api.getAnswerKey(id), [id]);

  useEffect(() => {
    if (!data) return;
    const title = data.problemSet.title;
    document.title = answerKey ? t('docTitleAnswerKey', { title }) : t('docTitleExam', { title });
  }, [data, answerKey, t]);

  if (loading && !data) return <LoadingState />;
  if (error || !data)
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState message={error ?? t('loadFailed')} onRetry={reload} />
      </div>
    );

  const problems = [...data.problems];
  const order = new Map(data.problemSet.items.map((i) => [i.problemId, i.order]));
  problems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <Toolbar
        setId={id}
        title={answerKey ? t('toolbarAnswerKey') : t('toolbarExam')}
        hint={
          answerKey ? t('hintAnswerKey') : t('hintExam')
        }
      />
      <main className="print-page print-sheet mx-auto my-6 max-w-[210mm] bg-white px-5 py-8 sm:px-[16mm] sm:py-[18mm] ring-1 ring-rule print:my-0 print:ring-0">
        <SheetHeader data={data} answerKey={answerKey} />
        {problems.map((p, i) => (
          <ProblemBlock key={p.id} p={p} index={i} answerKey={answerKey} />
        ))}
      </main>
    </div>
  );
}

export function PrintSheet({ answerKey }: { answerKey: boolean }) {
  return (
    <RequireAuth>
      <RequireRole roles={STAFF}>
        <SheetContent answerKey={answerKey} />
      </RequireRole>
    </RequireAuth>
  );
}
