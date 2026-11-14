'use client';

import type {
  SuggestTestCasesRequest,
  TestCaseSuggestionDto,
  TestCaseSuggestionsDto,
  UpsertTestCaseRequest,
} from '@oj/contracts';
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { IoTextarea } from '../form-fields';
import { useToast } from '../toast';
import { Badge, Button, inputClass, Modal, Spinner } from '../ui';

/** Below this many tests the manager nudges the editor towards AI suggestions. */
export const FEW_TESTS = 5;

interface Draft extends TestCaseSuggestionDto {
  picked: boolean;
  open: boolean;
  /** Shown to students in the statement. */
  isSample: boolean;
}

/**
 * Asks the AI for extra tests, lets the editor review and edit them, then adds the picked ones one by one
 * (`addTest` saves one test of a saved problem, or appends to the list of a problem being written).
 * Nothing reaches the problem until "Thêm".
 */
export function SuggestTestsDialog({
  open,
  onClose,
  suggest,
  addTest,
}: {
  open: boolean;
  onClose: () => void;
  suggest: (request: SuggestTestCasesRequest) => Promise<TestCaseSuggestionsDto>;
  addTest: (test: UpsertTestCaseRequest) => Promise<unknown> | void;
}) {
  const toast = useToast();
  const t = useTranslations('authoring.suggest');
  const tt = useTranslations('authoring.tests');
  const tCommon = useTranslations('common');
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const [points, setPoints] = useState(10);
  const [adding, setAdding] = useState(false);

  const busy = loading || adding;
  const picked = drafts?.filter((d) => d.picked) ?? [];

  const close = () => {
    if (busy) return;
    setDrafts(null);
    setNotes([]);
    setRejections([]);
    onClose();
  };

  const generate = async () => {
    setLoading(true);
    try {
      const res = await suggest({ count, focus: focus.trim() || null });
      // Tests whose output the AI computed by hand start unticked: the editor should check them first.
      setDrafts(res.suggestions.map((s) => ({ ...s, picked: s.outputVerified, open: false, isSample: false })));
      setNotes(res.notes);
      setRejections(res.focusRejections ?? []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const add = async () => {
    setAdding(true);
    const added: Draft[] = [];
    try {
      for (const d of picked) {
        await addTest({ input: d.input, expectedOutput: d.expectedOutput, isSample: d.isSample, points: Number(points) || 0 });
        added.push(d);
      }
      toast.success(t('added', { count: added.length }));
      setDrafts(null);
      setNotes([]);
      setRejections([]);
      onClose();
    } catch (e) {
      toast.error(
        added.length ? t('addedThenFailed', { count: added.length, error: errorMessage(e) }) : errorMessage(e),
      );
      // Keep only what was not added yet, so a retry does not duplicate.
      setDrafts((ds) => ds && ds.filter((d) => !added.includes(d)));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-ink-600" />
          {t('title')}
        </span>
      }
      wide
      footer={
        drafts ? (
          <>
            <Button variant="secondary" onClick={() => setDrafts(null)} disabled={busy}>
              <RotateCcw className="h-4 w-4" />
              {t('again')}
            </Button>
            <Button onClick={add} loading={adding} disabled={!picked.length || loading}>
              {t('addPicked', { count: picked.length })}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={generate} loading={loading}>
              <Sparkles className="h-4 w-4" />
              {t('generate')}
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-600">
          <Spinner className="h-6 w-6" />
          <p>{t('working')}</p>
          <p className="text-xs text-slate-500">{t('workingHint')}</p>
        </div>
      ) : !drafts ? (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">{t('intro')}</p>
          <label className="flex items-center gap-2">
            {t('count')}
            <select className={cn(inputClass, 'w-24')} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>{t('focus')}</span>
            <input
              className={inputClass}
              maxLength={300}
              placeholder={t('focusPlaceholder')}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">{t('smallOnly')}</p>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {rejections.length > 0 && (
            <div role="alert" className="rounded-lg border border-mark-200 bg-mark-50 px-3 py-2 text-mark-700">
              <p className="flex items-center gap-2 font-medium">
                <CircleAlert className="h-4 w-4 shrink-0" />
                {t('rejectedTitle')}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-10">
                {rejections.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="mt-1 pl-6 text-xs text-mark-600">{t('rejectedHint')}</p>
            </div>
          )}
          {notes.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              <p className="font-medium">{t('notes')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {drafts.length === 0 ? (
            <p className="py-6 text-center text-slate-500">{t('none')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 whitespace-nowrap">
                  {t('pointsEach')}
                  <input
                    type="number"
                    min={0}
                    className={cn(inputClass, 'w-24')}
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                  />
                </label>
                <span className="text-xs text-slate-500">{t('clickHint')}</span>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {drafts.map((d, i) => (
                  <li key={i} className="px-3 py-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={t('pick', { n: i + 1 })}
                        checked={d.picked}
                        onChange={(e) => update(i, { picked: e.target.checked })}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => update(i, { open: !d.open })}>
                        <span className="flex flex-wrap items-center gap-2">
                          {d.open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="font-medium">{t('testN', { n: i + 1 })}</span>
                          {d.outputVerified ? (
                            <Badge className="bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200">
                              <CircleCheck className="mr-1 inline h-3 w-3" />
                              {t('verified')}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                              <CircleAlert className="mr-1 inline h-3 w-3" />
                              {t('unverified')}
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-slate-600">{d.purpose}</span>
                      </button>
                      <label className="mt-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-slate-600">
                        <input type="checkbox" checked={d.isSample} onChange={(e) => update(i, { isSample: e.target.checked })} />
                        {tt('isSample')}
                      </label>
                    </div>
                    {d.open && (
                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <IoTextarea label={tt('input')} rows={8} value={d.input} onChange={(input) => update(i, { input })} />
                        <IoTextarea
                          label={tt('expectedOutput')}
                          rows={8}
                          value={d.expectedOutput}
                          onChange={(expectedOutput) => update(i, { expectedOutput })}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
