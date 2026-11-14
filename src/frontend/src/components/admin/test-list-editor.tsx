'use client';

import type { SuggestTestCasesRequest, TestCaseSuggestionsDto, UpsertTestCaseRequest } from '@oj/contracts';
import { ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useAiFeature } from '@/lib/ai-usage';
import { cn } from '@/lib/utils';
import { AiUsesLeft, useAiBlockedReason, VipOnly } from '../ai-access';
import { IoTextarea } from '../form-fields';
import { Button, Card, EmptyState, inputClass } from '../ui';
import { FEW_TESTS, SuggestTestsDialog } from './test-suggestions';

const preview = (s: string, empty: string, n = 60) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one || empty;
};

/**
 * The test list of a problem that is not saved yet (creating, importing). Everything stays local until the
 * problem is saved with it. Examples are tests marked "Là ví dụ": they are shown in the statement.
 */
export function TestListEditor({
  tests,
  onChange,
  suggest,
  className,
}: {
  tests: UpsertTestCaseRequest[];
  onChange: (tests: UpsertTestCaseRequest[]) => void;
  suggest: (request: SuggestTestCasesRequest) => Promise<TestCaseSuggestionsDto>;
  className?: string;
}) {
  const t = useTranslations('authoring.tests');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState<Set<number>>(new Set());
  // A free teacher has a monthly allowance (OJ-21): the button shows what is left and stops at the limit.
  const canUseAi = useAiFeature('TESTS').enabled;
  const blocked = useAiBlockedReason('TESTS');
  const aiOff = !!blocked;
  const [suggesting, setSuggesting] = useState(false);
  // The list as it grows while the AI dialog adds tests one by one.
  const latest = useRef(tests);
  latest.current = tests;

  const update = (i: number, patch: Partial<UpsertTestCaseRequest>) =>
    onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const toggle = (i: number) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  const add = () => {
    onChange([...tests, { input: '', expectedOutput: '', isSample: tests.length === 0, points: 10 }]);
    setOpen((o) => new Set(o).add(tests.length));
  };
  const remove = (i: number) => {
    onChange(tests.filter((_, j) => j !== i));
    setOpen((o) => new Set([...o].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))));
  };

  const samples = tests.filter((t) => t.isSample).length;
  const totalPoints = tests.reduce((s, t) => s + (Number(t.points) || 0), 0);

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {samples > 0
              ? t('headingWithSamples', { count: tests.length, samples })
              : t('heading', { count: tests.length })}
          </h2>
          <p className="text-xs text-slate-500">{t('listHint', { total: totalPoints })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseAi ? (
            <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSuggesting(true)}
              disabled={aiOff}
              title={blocked}
            >
              <Sparkles className="h-4 w-4" />
              {t('suggestAi')}
            </Button>
            <AiUsesLeft feature="TESTS" className="self-center" />
            </>
          ) : (
            <VipOnly label={t('suggestAiVip')} className="self-center" />
          )}
          <Button size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
            {t('add')}
          </Button>
        </div>
      </div>

      {tests.length > 0 && tests.length < FEW_TESTS && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-ink-50/60 px-5 py-2 text-sm text-slate-700">
          <span className="min-w-0">{t('few', { count: tests.length })}</span>
          {canUseAi && !aiOff && (
            <Button size="sm" variant="ghost" onClick={() => setSuggesting(true)}>
              <Sparkles className="h-4 w-4" />
              {t('suggestMore')}
            </Button>
          )}
        </div>
      )}

      {tests.length === 0 ? (
        <EmptyState title={t('emptyTitle')}>
          {t.rich(canUseAi ? 'listEmptyAi' : 'listEmpty', { b: (c) => <b>{c}</b> })}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tests.map((test, i) => {
            const expanded = open.has(i);
            return (
              <li key={i} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="-my-1 flex min-h-8 items-center gap-1 rounded pr-1 text-sm font-medium tabular-nums text-slate-700 hover:bg-slate-50"
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}#{i + 1}
                  </button>
                  <span className="hidden min-w-0 flex-1 truncate font-mono text-xs text-slate-500 md:block">
                    {preview(test.input, tCommon('empty'))} ⟹ {preview(test.expectedOutput, tCommon('empty'), 30)}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    <label className="flex min-h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                      <input type="checkbox" checked={test.isSample} onChange={(e) => update(i, { isSample: e.target.checked })} />
                      {t('isSample')}
                    </label>
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
                      <input
                        type="number"
                        min={0}
                        aria-label={t('pointsOf', { n: i + 1 })}
                        className={cn(inputClass, 'h-8 w-16 px-2 text-xs')}
                        value={test.points}
                        onChange={(e) => update(i, { points: Number(e.target.value) })}
                      />
                      {t('pointsUnit')}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(i)}
                      className="text-mark-600 hover:bg-mark-50"
                      aria-label={t('deleteTest', { n: i + 1 })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <IoTextarea label={t('input')} rows={5} value={test.input} onChange={(input) => update(i, { input })} />
                    <IoTextarea
                      label={t('expectedOutput')}
                      rows={5}
                      value={test.expectedOutput}
                      onChange={(expectedOutput) => update(i, { expectedOutput })}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SuggestTestsDialog
        open={suggesting}
        onClose={() => setSuggesting(false)}
        suggest={(request) => suggest(request)}
        addTest={(test) => {
          latest.current = [...latest.current, test];
          onChange(latest.current);
        }}
      />
    </Card>
  );
}
