'use client';

import { Eye, EyeOff, Pencil, Upload, X } from 'lucide-react';
import { useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { MAX_TAG_LENGTH, normalizeTag } from '@oj/contracts';
import { exactTag, suggestTags } from '@/lib/topics';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { useTagLabel } from './topics';
import { inputClass, monoTextareaClass } from './ui';

/** Markdown textarea with live preview (side-by-side on wide screens, toggle on small). */
export function MarkdownField({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
  labelExtra,
  below,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  /** Shown next to the label (e.g. a toggle). */
  labelExtra?: ReactNode;
  /** Shown under the field (e.g. why it cannot be saved). */
  below?: ReactNode;
}) {
  const t = useTranslations('auth.formFields');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-3">
          <label htmlFor={id} className="text-sm font-medium text-slate-700">
            {label}
          </label>
          {labelExtra}
        </span>
        <div className="flex gap-1 text-xs xl:hidden">
          <button
            type="button"
            onClick={() => setMode('edit')}
            aria-pressed={mode === 'edit'}
            className={cn('flex min-h-7 items-center gap-1 rounded px-2 py-1', mode === 'edit' ? 'bg-slate-200' : 'text-slate-500')}
          >
            <Pencil className="h-3 w-3 shrink-0" /> {t('write')}
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            aria-pressed={mode === 'preview'}
            className={cn('flex min-h-7 items-center gap-1 rounded px-2 py-1', mode === 'preview' ? 'bg-slate-200' : 'text-slate-500')}
          >
            <Eye className="h-3 w-3 shrink-0" /> {t('preview')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <textarea
          id={id}
          className={cn(monoTextareaClass, mode === 'preview' && 'hidden xl:block')}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('markdownPlaceholder')}
        />
        <div
          className={cn(
            'min-h-[6rem] overflow-auto rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2',
            mode === 'edit' && 'hidden xl:block',
          )}
          style={{ maxHeight: `${Math.max(rows, 6) * 1.6}rem` }}
        >
          {value.trim() ? (
            <Markdown className="prose-sm!">{value}</Markdown>
          ) : (
            <span className="text-xs text-slate-500">{t('previewEmpty')}</span>
          )}
        </div>
      </div>
      {below}
    </div>
  );
}

/**
 * Chip-style tags input. Enter or comma adds a tag; typing suggests standard topics and the teacher's own tags (OJ-20).
 * Tags are stored in the server's form (`normalizeTag`): "Quy hoạch động" becomes the topic `dp`, shown by its name.
 */
export function TagsInput({
  value,
  onChange,
  labelledBy,
  ownTags = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Id of the visible caption. Do not wrap this in a <label>: its tag buttons would become the label's control. */
  labelledBy?: string;
  /** The teacher's tags already in use, offered after the standard topics. */
  ownTags?: string[];
}) {
  const t = useTranslations('auth.formFields');
  const tt = useTranslations('topics');
  const label = useTagLabel();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Arrow keys moved through the list: Enter then takes the highlighted suggestion even with nothing typed.
  const [browsing, setBrowsing] = useState(false);
  const { standard, own } = suggestTags(text, (id) => tt(`names.${id}`), ownTags, value);
  const options = [...standard, ...own];
  const shown = open && options.length > 0;

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map(normalizeTag)
      .filter(Boolean);
    const next = [...new Set([...value, ...parts])];
    if (next.length !== value.length) onChange(next);
    setText('');
    setActive(0);
    setBrowsing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      setBrowsing(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Exactly a topic or one of the teacher's tags: that, as Tab would add it. Otherwise the highlighted suggestion
      // (typed into or browsed), else the typed text as a new tag.
      const exact = browsing ? null : exactTag(text, ownTags);
      if (exact) add(exact);
      else if (shown && (text.trim() || browsing) && options[active]) add(options[active]);
      else add(text);
    } else if (e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const optionId = (i: number) => `${listId}-${i}`;
  return (
    <div className="relative">
      <div className={cn(inputClass, 'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5')}>
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700">
            {label(tag)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== tag))}
              aria-label={t('removeTag', { tag: label(tag) })}
              className="-my-1 -mr-1.5 rounded-full p-1.5 hover:bg-ink-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 border-none bg-transparent text-sm outline-none"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setBrowsing(false);
            setOpen(true);
          }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (text.trim()) add(text);
          }}
          maxLength={MAX_TAG_LENGTH}
          role="combobox"
          aria-expanded={shown}
          aria-controls={shown ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={shown ? optionId(active) : undefined}
          aria-labelledby={labelledBy}
          placeholder={value.length ? '' : t('tagsPlaceholder')}
        />
      </div>
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label={tt('input.suggestions')}
          className="motion-rise absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-control border border-rule bg-surface py-1 shadow-lg"
        >
          {options.map((tag, i) => (
            <li
              key={tag}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                add(tag);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm',
                i === active ? 'bg-ink-50 text-ink-700' : 'text-slate-700',
              )}
            >
              <span>{label(tag)}</span>
              <span className="text-xs text-slate-500">{i < standard.length ? tt('input.standard') : tt('input.yours')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Button that loads a text file (.txt/.in/.out/...) and passes its content to onLoad. */
export function LoadFileButton({
  onLoad,
  label,
  accept = '.txt,.in,.out,.inp,.ans,.dat',
}: {
  onLoad: (text: string, fileName: string) => void;
  label?: string;
  accept?: string;
}) {
  const t = useTranslations('auth.formFields');
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onLoad((await f.text()).replace(/\r\n/g, '\n'), f.name);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex min-h-7 items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap text-slate-500 hover:bg-slate-100 hover:text-ink-600"
      >
        <Upload className="h-3.5 w-3.5 shrink-0" />
        {label ?? t('loadFile')}
      </button>
    </>
  );
}

/** Monospace textarea for (possibly large) test data with a "load from file" button. */
export function IoTextarea({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const t = useTranslations('auth.formFields');
  const lines = value ? value.split('\n').length : 0;
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap text-slate-500">{t('ioStats', { lines, chars: value.length })}</span>
          <LoadFileButton onLoad={(t) => onChange(t)} />
        </span>
      </div>
      <textarea
        id={id}
        className={cn(monoTextareaClass, 'whitespace-pre')}
        rows={rows}
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Password field with a show/hide button (OJ-17, U5): typing a password blind on a phone is the most common sign-in
 * mistake. The input comes first, so a wrapping <label> still names it (not the button).
 */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations('auth.formFields');
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={shown ? 'text' : 'password'} className={cn(inputClass, 'pr-11', props.className)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        title={shown ? t('hidePassword') : t('showPassword')}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-slate-500 hover:text-slate-800"
      >
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  );
}
