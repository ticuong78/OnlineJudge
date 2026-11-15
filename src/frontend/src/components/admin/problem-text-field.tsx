'use client';

import {
  fileIoFields,
  hasFileIo,
  ioSideOf,
  toStandardIo,
  type ProblemDraftContent,
  type ProblemTextField,
} from '@oj/contracts';
import { AlertTriangle, ArrowRightLeft, RotateCcw, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAiFeature } from '@/lib/ai-usage';
import { AiUsesLeft, useAiBlockedReason, VipOnly } from '../ai-access';
import { MarkdownField } from '../form-fields';
import { useToast } from '../toast';
import { Spinner } from '../ui';

/** A section the AI can rewrite: the four text sections and the title (OJ-22). */
type Section = ProblemTextField | 'title';

/** What one "Dùng gợi ý" switch needs. */
export interface SectionSuggestion {
  on: boolean;
  loading: boolean;
  notes: string[];
  toggle: (on: boolean) => void;
  /** Ask the AI for a different version (only while on). */
  regenerate?: () => void;
}

/**
 * Per-section AI suggestions for a problem being written (`content.samples` gives the AI the examples).
 * Turning a section on swaps in the AI's version; turning it off puts the teacher's own text back.
 * Suggestions are remembered per content: turning a section on again while the teacher's text is unchanged
 * reuses the last suggestion instead of asking the AI again; "Viết lại" asks for a new one on purpose.
 * `apply` must merge into the latest state, since several sections may answer at once (the "whole problem" switch).
 */
export function useSectionSuggestions(
  content: ProblemDraftContent,
  apply: (patch: Partial<Record<Section, string>>) => void,
  sections: Section[],
) {
  const toast = useToast();
  const t = useTranslations('authoring.suggestion');
  const tf = useTranslations('enums.problemTextField');
  // The teacher's own value of each section while its suggestion is on.
  const [originals, setOriginals] = useState<Partial<Record<Section, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<Section, boolean>>>({});
  const [notes, setNotes] = useState<Partial<Record<Section, string[]>>>({});
  const latest = useRef(content);
  latest.current = content;
  const originalsRef = useRef(originals);
  originalsRef.current = originals;
  // Suggestion per (section, teacher's content): same content, same answer, no new AI call.
  const cache = useRef(new Map<string, { text: string; notes: string[] }>());

  const isOn = (s: Section) => s in originals;
  /** The problem as the teacher wrote it: sections showing a suggestion count with their own text. */
  const teacherContent = (): ProblemDraftContent => ({ ...latest.current, ...originalsRef.current });
  const keyOf = (s: Section, problem: ProblemDraftContent) => JSON.stringify([s, problem]);

  const ask = async (s: Section, fresh: boolean) => {
    const problem = teacherContent();
    const key = keyOf(s, problem);
    const known = fresh ? undefined : cache.current.get(key);
    if (known) return { problem, ...known };
    setLoading((l) => ({ ...l, [s]: true }));
    try {
      const res = await api.suggestProblemSection({ section: s, problem });
      cache.current.set(key, { text: res.text, notes: res.notes });
      return { problem, ...res };
    } catch (e) {
      toast.error(t('failed', { label: tf(s), error: errorMessage(e) }));
      return null;
    } finally {
      setLoading((l) => ({ ...l, [s]: false }));
    }
  };

  const toggle = async (s: Section, on: boolean) => {
    if (on === isOn(s) || loading[s]) return;
    if (!on) {
      apply({ [s]: originals[s] });
      setOriginals(({ [s]: _, ...rest }) => rest);
      setNotes(({ [s]: _, ...rest }) => rest);
      return;
    }
    const res = await ask(s, false);
    if (!res) return;
    apply({ [s]: res.text });
    setOriginals((o) => ({ ...o, [s]: res.problem[s] }));
    setNotes((n) => ({ ...n, [s]: res.notes }));
  };

  const regenerate = async (s: Section) => {
    if (!isOn(s) || loading[s]) return;
    const res = await ask(s, true);
    if (!res) return;
    apply({ [s]: res.text });
    setNotes((n) => ({ ...n, [s]: res.notes }));
  };

  const of = (s: Section): SectionSuggestion => ({
    on: isOn(s),
    loading: !!loading[s],
    notes: notes[s] ?? [],
    toggle: (on) => void toggle(s, on),
    regenerate: () => void regenerate(s),
  });

  return {
    of,
    /** The "whole problem" switch: on when every section uses its suggestion. */
    all: {
      on: sections.every(isOn),
      loading: sections.some((s) => loading[s]),
      notes: [],
      toggle: (on: boolean) => sections.forEach((s) => void toggle(s, on)),
    } satisfies SectionSuggestion,
  };
}

export function SuggestionSwitch({
  label,
  suggestion,
  text,
  className,
  showLocked = false,
  showUses = false,
}: {
  label: string;
  suggestion: SectionSuggestion;
  text?: string;
  className?: string;
  /** For regular (non-VIP) accounts: show a "VIP only" hint instead of nothing. */
  showLocked?: boolean;
  /** Show the "uses left" count (the whole-problem switch). Section switches show it only when the uses are gone. */
  showUses?: boolean;
}) {
  const t = useTranslations('authoring.suggestion');
  // A free teacher has a monthly allowance of rewrites (OJ-21); the switch shows what is left and stops at the limit.
  const canUseAi = useAiFeature('SECTION').enabled;
  const blocked = useAiBlockedReason('SECTION');
  // Blocked only for turning AI on: a switch that is on can always be turned off, also after the last use.
  const notConfigured = !!blocked && !suggestion.on;
  const { on, loading, toggle, regenerate } = suggestion;
  if (!canUseAi) return showLocked ? <VipOnly label={t('aiLabel')} className={className} /> : null;
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {/* The whole label is the tap target (at least 28px high); the switch itself stays small (UAT L2). */}
      <label
        className={cn(
          'flex min-h-8 items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-700',
          notConfigured ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
        title={blocked}
      >
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={on}
          aria-busy={loading}
          aria-description={blocked}
          disabled={loading || notConfigured}
          onClick={() => toggle(!on)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-wait',
            notConfigured && 'disabled:cursor-not-allowed',
            on ? 'bg-chalk-solid' : 'bg-slate-300',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              on ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
        {loading ? <Spinner className="h-3.5 w-3.5 shrink-0" /> : <Wand2 className="h-3.5 w-3.5 shrink-0 text-ink-600" />}
        {/* In an element, not a bare text node next to the icon: survives browser translation (see Button in ui.tsx). */}
        <span>{loading ? t('writing') : (text ?? t('use'))}</span>
      </label>
      {on && !loading && regenerate && !blocked && (
        <button
          type="button"
          onClick={regenerate}
          className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-600 hover:underline"
          title={t('rewriteTitle')}
        >
          <RotateCcw className="h-3 w-3 shrink-0" />
          <span>{t('rewrite')}</span>
        </button>
      )}
      {(showUses || blocked) && <AiUsesLeft feature="SECTION" />}
    </span>
  );
}

/** Notes from the AI, and how to go back, under a section that uses its suggestion. */
export function SuggestionNotes({ suggestion }: { suggestion: SectionSuggestion }) {
  const t = useTranslations('authoring.suggestion');
  if (!suggestion.on) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {suggestion.notes.map((n, i) => (
        <p key={i} className="flex items-start gap-1 text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {n}
        </p>
      ))}
      <p className="text-slate-500">{t('inUse')}</p>
    </div>
  );
}

/** A statement section with its "Dùng gợi ý" switch; refuses file input/output with an explanation. */
export function ProblemTextField({
  field,
  value,
  onChange,
  rows,
  suggestion,
}: {
  field: ProblemTextField;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  suggestion: SectionSuggestion;
}) {
  const t = useTranslations('authoring');
  const tf = useTranslations('enums.problemTextField');
  const label = tf(field);
  const side = ioSideOf(field);
  const fileIo = hasFileIo(value, side);
  // Without an AI use left, the manual "convert to standard I/O" button is offered, as for accounts without AI.
  const section = useAiFeature('SECTION');
  const canUseAi = section.enabled && !section.exhausted;
  return (
    <MarkdownField
      label={label}
      value={value}
      onChange={onChange}
      rows={rows}
      labelExtra={<SuggestionSwitch label={t('suggestion.useFor', { label })} suggestion={suggestion} />}
      below={
        <>
          {fileIo && (
            <p className="mt-2 flex items-start gap-2 rounded-lg border border-mark-200 bg-mark-50 px-3 py-2 text-sm text-mark-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{canUseAi ? t('fileIo.fieldAi') : t('fileIo.fieldManual')}</span>
            </p>
          )}
          {fileIo && !canUseAi && (
            <button
              type="button"
              onClick={() => onChange(toStandardIo(value, side))}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-ink-600 hover:underline"
            >
              <ArrowRightLeft className="h-3 w-3 shrink-0" />
              <span>{t('fileIo.toStandardIo')}</span>
            </button>
          )}
          <SuggestionNotes suggestion={suggestion} />
        </>
      }
    />
  );
}

/** Explains why the form cannot be submitted, or nothing when it can. */
export function FileIoBlocker({ problems }: { problems: { label?: string; content: Parameters<typeof fileIoFields>[0] }[] }) {
  const t = useTranslations('authoring.fileIo');
  const tf = useTranslations('enums.problemTextField');
  const blocked = problems
    .map((p) => ({ label: p.label, fields: fileIoFields(p.content) }))
    .filter((p) => p.fields.length > 0);
  if (!blocked.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-mark-200 bg-mark-50 px-4 py-3 text-sm text-mark-700">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('blockerTitle')}
      </p>
      <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-auto pl-10">
        {blocked.map((b, i) => {
          // Built here rather than with fileIoMessage from @oj/contracts, which is Vietnamese only (the backend uses it).
          const message = t('message', { fields: b.fields.map((f) => tf(f)).join(', ') });
          return <li key={i}>{b.label ? t('labeled', { label: b.label, message }) : message}</li>;
        })}
      </ul>
    </div>
  );
}
