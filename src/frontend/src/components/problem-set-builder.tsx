'use client';

import {
  Difficulties,
  DifficultyLabels,
  ProblemSetTypeLabels,
  ProblemSetTypes,
  type Difficulty,
  type ProblemSetDto,
  type ProblemSetItemDto,
  type ProblemSetType,
  type UpsertProblemSetRequest,
} from '@oj/contracts';
import { ArrowDown, ArrowUp, Check, Plus, Save, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { MarkdownField } from './form-fields';
import { Button, Card, DifficultyBadge, EmptyState, Field, InlineAlert, inputClass, LoadingState, Pagination } from './ui';

type Item = Omit<ProblemSetItemDto, 'order'>;

function ProblemPicker({ selected, onAdd }: { selected: Set<string>; onAdd: (i: Item) => void }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [search, difficulty]);
  const { data, loading, error } = useAsync(
    () => api.listProblems({ scope: 'mine', search, difficulty, page, pageSize: 10 }),
    [search, difficulty, page],
  );

  return (
    <Card className="flex flex-col">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <h2 className="font-semibold">Ngân hàng của tôi</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Tìm theo tên hoặc mã bài"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={inputClass}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
          aria-label="Độ khó"
        >
          <option value="">Mọi độ khó</option>
          {Difficulties.map((d) => (
            <option key={d} value={d}>
              {DifficultyLabels[d]}
            </option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <p className="p-4 text-sm text-mark-600">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Không có bài phù hợp trong ngân hàng của bạn" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.items.map((p) => {
              const added = selected.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{p.code}</span>
                      <DifficultyBadge difficulty={p.difficulty} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'ghost' : 'secondary'}
                    disabled={added}
                    onClick={() =>
                      onAdd({
                        problemId: p.id,
                        problemCode: p.code,
                        problemTitle: p.title,
                        difficulty: p.difficulty,
                        points: 10,
                      })
                    }
                  >
                    {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    <span key={added ? 'added' : 'add'}>{added ? 'Đã thêm' : 'Thêm'}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={10} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

export function ProblemSetBuilder({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: ProblemSetDto;
  onSubmit: (body: UpsertProblemSetRequest) => Promise<void>;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [type, setType] = useState<ProblemSetType>(initial?.type ?? 'HOMEWORK');
  const [items, setItems] = useState<Item[]>(
    [...(initial?.items ?? [])].sort((a, b) => a.order - b.order).map(({ order: _o, ...i }) => i),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((s, i) => s + (Number(i.points) || 0), 0);
  const selected = new Set(items.map((i) => i.problemId));

  const move = (idx: number, dir: -1 | 1) => {
    setItems((xs) => {
      const j = idx + dir;
      if (j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Đặt tên cho đề trước khi lưu.');
    if (items.length === 0) return setError('Đề chưa có bài nào. Thêm bài từ ngân hàng của bạn ở bên phải.');
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description,
        type,
        items: items.map((i) => ({ problemId: i.problemId, points: Number(i.points) || 0 })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được đề. Thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Tên đề" className="md:col-span-2">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kiểm tra 15 phút: vòng lặp"
            />
          </Field>
          <Field label="Loại đề">
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as ProblemSetType)}>
              {ProblemSetTypes.map((t) => (
                <option key={t} value={t}>
                  {ProblemSetTypeLabels[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <MarkdownField label="Lời dặn cho học sinh (chép sang phiên khi giao bài)" value={description} onChange={setDescription} rows={4} />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="font-semibold">Các bài trong đề ({items.length})</h2>
            <span className="text-sm text-slate-600">
              Tổng điểm: <b className="text-lg tabular-nums text-slate-900">{total}</b>
            </span>
          </div>
          {items.length === 0 ? (
            <EmptyState title="Đề chưa có bài nào">Chọn bài từ ngân hàng của bạn để thêm vào đề.</EmptyState>
          ) : (
            <ol className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <li key={it.problemId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-12 text-sm font-semibold tabular-nums text-slate-500">Bài {idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.problemTitle}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{it.problemCode}</span>
                      <DifficultyBadge difficulty={it.difficulty} />
                    </div>
                  </div>
                  <label className="flex items-center gap-1 text-sm text-slate-600">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className={cn(inputClass, 'w-20 py-1 text-right')}
                      value={it.points}
                      onChange={(e) =>
                        setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, points: Number(e.target.value) } : x)))
                      }
                      aria-label={`Điểm bài ${idx + 1}`}
                    />
                    điểm
                  </label>
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Lên">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      aria-label="Xuống"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-mark-600 hover:bg-mark-50"
                      onClick={() => setItems((xs) => xs.filter((_, j) => j !== idx))}
                      aria-label="Bỏ khỏi đề"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <ProblemPicker selected={selected} onAdd={(i) => setItems((xs) => [...xs, i])} />
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-rule bg-white/95 px-4 py-3">
        <span className="text-sm text-slate-600">
          {items.length} bài, {total} điểm
        </span>
        <Button type="submit" loading={saving}>
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
