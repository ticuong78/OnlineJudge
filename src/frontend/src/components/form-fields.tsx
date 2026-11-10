'use client';

import { Eye, Pencil, Upload, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
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
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {labelExtra}
        </span>
        <div className="flex gap-1 text-xs xl:hidden">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={cn('flex items-center gap-1 rounded px-2 py-0.5', mode === 'edit' ? 'bg-slate-200' : 'text-slate-500')}
          >
            <Pencil className="h-3 w-3 shrink-0" /> {t('write')}
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={cn('flex items-center gap-1 rounded px-2 py-0.5', mode === 'preview' ? 'bg-slate-200' : 'text-slate-500')}
          >
            <Eye className="h-3 w-3 shrink-0" /> {t('preview')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <textarea
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
            <span className="text-xs text-slate-400">{t('previewEmpty')}</span>
          )}
        </div>
      </div>
      {below}
    </div>
  );
}

/** Chip-style tags input. Enter or comma adds a tag. */
export function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations('auth.formFields');
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className={cn(inputClass, 'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={t('removeTag', { tag })}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 border-none bg-transparent text-sm outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length ? '' : t('tagsPlaceholder')}
      />
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
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-slate-500 hover:bg-slate-100 hover:text-ink-600"
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
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap text-slate-400">{t('ioStats', { lines, chars: value.length })}</span>
          <LoadFileButton onLoad={(t) => onChange(t)} />
        </span>
      </div>
      <textarea
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
