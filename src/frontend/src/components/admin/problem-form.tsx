'use client';

import {
  Difficulties,
  fileIoFields,
  type Difficulty,
  type UpsertProblemRequest,
  type UpsertTestCaseRequest,
} from '@oj/contracts';
import { Save } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api';
import { adoptStored, clearDraft, createDraftAutosave, isDirty, readDraft, writeDraft } from '@/lib/unsaved';
import { useAsync } from '@/lib/use-async';
import { formatDateTime } from '@/lib/utils';
import { TagsInput } from '../form-fields';
import { LeaveGuard } from '../leave-guard';
import { Button, Card, Field, InlineAlert, inputClass } from '../ui';
import { FileIoBlocker, ProblemTextField, SuggestionNotes, SuggestionSwitch, useSectionSuggestions } from './problem-text-field';
import { TestListEditor } from './test-list-editor';

export const emptyProblem: UpsertProblemRequest = {
  title: '',
  difficulty: 'EASY',
  tags: [],
  statement: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  timeLimitMs: 1000,
  memoryLimitMb: 256,
};

/**
 * The statement of a problem. When creating (`withTests`), the test list is written here too and saved with
 * the problem; a saved problem edits its tests separately (each change is saved at once).
 */
export function ProblemForm({
  initial,
  onSubmit,
  submitLabel,
  withTests = false,
  draftKey,
  onDirtyChange,
}: {
  initial: UpsertProblemRequest;
  onSubmit: (v: UpsertProblemRequest, tests: UpsertTestCaseRequest[]) => Promise<void>;
  submitLabel?: string;
  withTests?: boolean;
  /** Keep unsaved work in this browser under this key and offer it back on return (H1: Back loses nothing). */
  draftKey?: string;
  /** Told whenever unsaved changes appear or go, e.g. so the page can ask before switching tabs. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations('authoring.form');
  const ta = useTranslations('authoring');
  // The teacher's own tags, suggested after the standard topics (OJ-20). Without them the input still works.
  const ownTags = useAsync(() => api.problemTags('mine'), []).data?.map((c) => c.tag) ?? [];
  const tc = useTranslations('common');
  const td = useTranslations('enums.difficulty');
  // Read once, on the first render: this form only renders in the browser, behind the sign-in check.
  const [restored] = useState(() => (draftKey ? readDraft<{ v: UpsertProblemRequest; tests: UpsertTestCaseRequest[] }>(draftKey) : null));
  const [showRestored, setShowRestored] = useState(!!restored);
  const [v, setV] = useState<UpsertProblemRequest>(restored?.value.v ?? initial);
  const [tests, setTests] = useState<UpsertTestCaseRequest[]>(restored?.value.tests ?? []);
  // Compared with what was last loaded or saved, not with the `initial` prop alone: the server normalises a save
  // (trims the title, lowercases tags), so the form would otherwise stay "unsaved" after a successful save.
  const [saved, setSaved] = useState<UpsertProblemRequest>(initial);
  const dirty = isDirty(v, saved) || tests.length > 0;

  // When the parent hands back the stored version after a save, show it (lowercased tags and all) unless the user
  // has typed since.
  const initialJson = JSON.stringify(initial);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    setV((cur) => adoptStored(cur, savedRef.current, initial).value);
    setSaved(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson]);

  const report = useRef(onDirtyChange);
  report.current = onDirtyChange;
  useEffect(() => {
    report.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => report.current?.(false), []);
  const [autosave] = useState(() =>
    createDraftAutosave<{ v: UpsertProblemRequest; tests: UpsertTestCaseRequest[] }>((d) => draftKey && writeDraft(draftKey, d)),
  );
  useEffect(() => () => autosave.cancel(), [autosave]);

  useEffect(() => {
    if (!draftKey || autosave.stopped) return;
    if (!dirty) {
      autosave.cancel();
      clearDraft(draftKey);
      return;
    }
    autosave.schedule({ v, tests });
  }, [draftKey, dirty, v, tests, autosave]);

  const discardDraft = () => {
    if (draftKey) clearDraft(draftKey);
    setV(initial);
    setTests([]);
    setShowRestored(false);
  };
  const samples = tests.filter((t) => t.isSample);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof UpsertProblemRequest>(k: K, val: UpsertProblemRequest[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const blocked = fileIoFields(v).length > 0;
  // The title has its own switch (OJ-22), outside the whole-problem switch, so that one keeps its four sections.
  const titleSuggestion = useSectionSuggestions(
    { ...v, samples },
    (patch) => setV((prev) => ({ ...prev, ...(patch as Partial<UpsertProblemRequest>) })),
    ['title'],
  );
  const suggestions = useSectionSuggestions(
    { ...v, samples },
    (patch) => setV((prev) => ({ ...prev, ...(patch as Partial<UpsertProblemRequest>) })),
    ['statement', 'inputFormat', 'outputFormat', 'constraints'],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (blocked) return;
    if (!v.title.trim()) return setError(t('titleRequired'));
    if (!(v.timeLimitMs > 0) || !(v.memoryLimitMb > 0)) return setError(t('limitsPositive'));
    setSaving(true);
    try {
      const submitted = { ...v, title: v.title.trim() };
      await onSubmit(submitted, tests);
      setV(submitted);
      setSaved(submitted);
      if (draftKey) {
        autosave.stop();
        clearDraft(draftKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <LeaveGuard dirty={dirty && !saving} />
      {showRestored && restored && (
        <InlineAlert kind="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{tc('draft.restored', { time: formatDateTime(restored.savedAt) })}</span>
            <Button variant="secondary" size="sm" onClick={discardDraft}>
              {tc('draft.discard')}
            </Button>
          </span>
        </InlineAlert>
      )}
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Not a <Field>: its <label> would take the switch's button as its control (UAT L1). */}
          <div className="md:col-span-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3">
              <label htmlFor="problem-title" className="text-sm font-medium text-slate-700">
                {t('title')}
              </label>
              <SuggestionSwitch label={ta('suggestion.useFor', { label: t('title') })} suggestion={titleSuggestion.of('title')} />
            </div>
            <input id="problem-title" className={inputClass} value={v.title} onChange={(e) => set('title', e.target.value)} required />
            <SuggestionNotes suggestion={titleSuggestion.of('title')} />
          </div>
          <Field label={t('difficulty')}>
            <select
              className={inputClass}
              value={v.difficulty}
              onChange={(e) => set('difficulty', e.target.value as Difficulty)}
            >
              {Difficulties.map((d) => (
                <option key={d} value={d}>
                  {td(d)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Not a <label>: it would take the first "remove tag" button as its control, so clicking the caption
              removed a tag and the text box lost its name (UAT L1). The input is named by id instead. */}
          <div className="md:col-span-2">
            <span id="problem-tags-label" className="mb-1 block text-sm font-medium text-slate-700">
              {t('tags')}
            </span>
            <TagsInput value={v.tags} onChange={(t) => set('tags', t)} labelledBy="problem-tags-label" ownTags={ownTags} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('timeLimit')}>
              <input
                type="number"
                min={100}
                step={100}
                className={inputClass}
                value={v.timeLimitMs}
                onChange={(e) => set('timeLimitMs', Number(e.target.value))}
              />
            </Field>
            <Field label={t('memoryLimit')}>
              <input
                type="number"
                min={16}
                step={16}
                className={inputClass}
                value={v.memoryLimitMb}
                onChange={(e) => set('memoryLimitMb', Number(e.target.value))}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="font-semibold text-slate-800">{t('content')}</h2>
          <SuggestionSwitch
            label={t('suggestAllLabel')}
            text={t('suggestAllText')}
            suggestion={suggestions.all}
            className="text-sm"
            showLocked
            showUses
          />
        </div>
        {(
          [
            ['statement', 12],
            ['inputFormat', 4],
            ['outputFormat', 4],
            ['constraints', 3],
          ] as const
        ).map(([field, rows]) => (
          <ProblemTextField
            key={field}
            field={field}
            value={v[field]}
            onChange={(s) => set(field, s)}
            rows={rows}
            suggestion={suggestions.of(field)}
          />
        ))}
      </Card>

      {withTests && (
        <TestListEditor
          tests={tests}
          onChange={setTests}
          suggest={(request) => api.suggestDraftTests({ ...request, problem: { ...v, samples }, tests })}
        />
      )}

      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur">
        <FileIoBlocker problems={[{ content: v }]} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={blocked}>
            <Save className="h-4 w-4" />
            {submitLabel ?? tc('save')}
          </Button>
        </div>
      </div>
    </form>
  );
}
