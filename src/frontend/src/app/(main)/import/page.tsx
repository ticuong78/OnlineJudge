'use client';

import {
  Difficulties,
  DifficultyLabels,
  fileIoFields,
  type Difficulty,
  type ParsedExamDto,
  type ProblemDraftDto,
} from '@oj/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  ClipboardPaste,
  FileUp,
  Sparkles,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Container } from '@/components/app-shell';
import {
  FileIoBlocker,
  ProblemTextField,
  SuggestionSwitch,
  useSectionSuggestions,
} from '@/components/admin/problem-text-field';
import { TestListEditor } from '@/components/admin/test-list-editor';
import { useCanUseAi } from '@/components/ai-access';
import { RequireRole, STAFF } from '@/components/guards';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, Field, InlineAlert, inputClass, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_TEXT = 100_000;

interface DraftState extends ProblemDraftDto {
  include: boolean;
  open: boolean;
}

/** Calm progress while the server reads the file (AI reading can take 20–60 seconds). */
function ParsingProgress() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const hint =
    secs < 8
      ? 'Đang tải file lên và đọc nội dung.'
      : secs < 30
        ? 'Đang tách từng bài, ví dụ và giới hạn. Đọc bằng AI thường mất 20 đến 60 giây.'
        : 'Đề dài nên cần thêm chút thời gian. Bạn cứ để trang mở.';
  return (
    <div role="status" aria-live="polite">
      <p className="font-medium text-slate-700">Đang đọc đề…</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
      <p className="mt-1 text-xs text-slate-400 tabular-nums">{secs} giây</p>
    </div>
  );
}

function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => !busy && ref.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed px-6 py-16 text-center transition',
        over ? 'border-ink-500 bg-ink-50' : 'border-slate-300 bg-white hover:border-ink-400 hover:bg-slate-50',
        busy && 'pointer-events-none opacity-70',
      )}
    >
      <input
        ref={ref}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {busy ? (
        <>
          <Spinner className="h-8 w-8" />
          <ParsingProgress />
        </>
      ) : (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-600">
            <Upload className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-slate-800">Kéo thả file đề vào đây hoặc bấm để chọn</p>
            <p className="text-sm text-slate-500">Hỗ trợ .docx và .pdf, tối đa 10MB</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Exam text pasted instead of a file; read the same way as an uploaded document. */
function PasteBox({ onSubmit, busy }: { onSubmit: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState('');
  const tooLong = text.length > MAX_TEXT;
  if (busy) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-panel border border-slate-200 bg-white px-6 py-16 text-center">
        <Spinner className="h-8 w-8" />
        <ParsingProgress />
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Dán nội dung đề (một hoặc nhiều bài) từ Word, trang web hay tin nhắn. AI sẽ tách từng bài và sắp xếp lại thành đề bài,
        dữ liệu vào, kết quả, ràng buộc và ví dụ, giống như khi tải file lên.
      </p>
      <textarea
        className={cn(inputClass, 'h-auto min-h-[16rem] py-2 font-mono text-sm')}
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Bài 1. Tổng hai số\nCho hai số nguyên a, b. Tính a + b.\nDữ liệu vào: một dòng chứa a, b.\nKết quả: in ra a + b.\nVí dụ: ...'}
        aria-label="Nội dung đề"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={cn('text-xs tabular-nums', tooLong ? 'text-mark-600' : 'text-slate-500')}>
          {text.length.toLocaleString('vi-VN')} / {MAX_TEXT.toLocaleString('vi-VN')} ký tự
          {tooLong && ' (quá dài, hãy chia thành nhiều lần)'}
        </span>
        <Button onClick={() => onSubmit(text)} disabled={!text.trim() || tooLong}>
          <Sparkles className="h-4 w-4" />
          Tái cấu trúc bằng AI
        </Button>
      </div>
    </Card>
  );
}

function DraftCard({
  index,
  d,
  update,
}: {
  index: number;
  d: DraftState;
  update: (patch: Partial<DraftState>) => void;
}) {
  const samples = d.tests.filter((t) => t.isSample);
  const suggestions = useSectionSuggestions({ ...d, samples }, (patch) => update(patch), [
    'statement',
    'inputFormat',
    'outputFormat',
    'constraints',
  ]);
  return (
    <Card className={cn('overflow-hidden', !d.include && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={d.include}
            onChange={(e) => update({ include: e.target.checked })}
          />
          <span className="text-sm font-semibold text-slate-500">Bài {index + 1}</span>
        </label>
        <input
          className={cn(inputClass, 'min-w-48 flex-1 font-medium')}
          value={d.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Tên bài"
        />
        <select
          className={cn(inputClass, 'w-36')}
          value={d.difficulty}
          onChange={(e) => update({ difficulty: e.target.value as Difficulty })}
          aria-label="Độ khó"
        >
          {Difficulties.map((x) => (
            <option key={x} value={x}>
              {DifficultyLabels[x]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ open: !d.open })}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-ink-600"
        >
          {d.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span key={d.open ? 'open' : 'closed'}>{d.open ? 'Thu gọn' : 'Chỉnh sửa chi tiết'}</span>
        </button>
        <SuggestionSwitch
          label={`Dùng gợi ý của AI cho tất cả các mục của bài ${index + 1}`}
          text="Dùng gợi ý cho cả bài"
          suggestion={suggestions.all}
          className="ml-auto"
          showLocked
        />
      </div>

      {d.include && fileIoFields(d).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-mark-200 bg-mark-50 px-4 py-2 text-sm text-mark-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Đề còn yêu cầu đọc/ghi file nên chưa nhập được.
          {!d.open && (
            <button type="button" className="font-medium underline" onClick={() => update({ open: true })}>
              Mở để sửa hoặc dùng gợi ý
            </button>
          )}
        </div>
      )}
      {d.warnings.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {d.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {!d.open ? (
        <div className="px-4 py-3 text-sm text-slate-600">
          <p className="line-clamp-2">{d.statement || <i className="text-slate-400">(chưa có nội dung đề)</i>}</p>
          <p className="mt-1 text-xs text-slate-500">
            {d.timeLimitMs} ms, {d.memoryLimitMb} MB, {d.tests.length} test ({samples.length} ví dụ)
          </p>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:w-80">
            <Field label="Thời gian (ms)">
              <input
                type="number"
                className={inputClass}
                value={d.timeLimitMs}
                onChange={(e) => update({ timeLimitMs: Number(e.target.value) })}
              />
            </Field>
            <Field label="Bộ nhớ (MB)">
              <input
                type="number"
                className={inputClass}
                value={d.memoryLimitMb}
                onChange={(e) => update({ memoryLimitMb: Number(e.target.value) })}
              />
            </Field>
          </div>
          {(
            [
              ['statement', 10],
              ['inputFormat', 3],
              ['outputFormat', 3],
              ['constraints', 3],
            ] as const
          ).map(([field, rows]) => (
            <ProblemTextField
              key={field}
              field={field}
              value={d[field]}
              onChange={(text) => update({ [field]: text })}
              rows={rows}
              suggestion={suggestions.of(field)}
            />
          ))}

          <TestListEditor
            className="shadow-none"
            tests={d.tests}
            onChange={(tests) => update({ tests })}
            suggest={(request) => api.suggestDraftTests({ ...request, problem: { ...d, samples }, tests: d.tests })}
          />
        </div>
      )}
    </Card>
  );
}

export default function ImportPage() {
  const canUseAi = useCanUseAi();
  const toast = useToast();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedExamDto | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [importing, setImporting] = useState(false);
  const [created, setCreated] = useState<{ id: string; title: string }[] | null>(null);
  const [source, setSource] = useState<'file' | 'text'>('file');

  const onFile = async (f: File) => {
    setError(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'docx' && ext !== 'pdf') return setError('File này không đọc được. Hãy chọn file .docx hoặc .pdf.');
    if (f.size > MAX_SIZE) return setError('File lớn hơn 10MB. Hãy tách đề thành file nhỏ hơn rồi tải lại.');
    await read(() => api.parseExam(f));
  };

  const onText = (text: string) => {
    setError(null);
    return read(() => api.parseExamText(text));
  };

  const read = async (load: () => Promise<ParsedExamDto>) => {
    setParsing(true);
    try {
      const res = await load();
      setParsed(res);
      setDrafts(res.drafts.map((d, i) => ({ ...d, include: true, open: i === 0 })));
      setCreated(null);
      if (res.drafts.length === 0) toast.info('Chưa tách được bài nào. Xem văn bản trích xuất ở cuối trang, hoặc thêm bài thủ công.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setParsing(false);
    }
  };

  const included = drafts.filter((d) => d.include);
  const blocked = included.some((d) => fileIoFields(d).length > 0);

  const confirm = async () => {
    const bad = included.find((d) => !d.title.trim());
    if (bad) return toast.error('Có bài chưa có tên. Điền tên cho các bài đã chọn rồi nhập lại.');
    if (blocked) return;
    setImporting(true);
    try {
      const payload: ProblemDraftDto[] = included.map(({ include: _i, open: _o, ...d }) => ({
        ...d,
        title: d.title.trim(),
      }));
      const res = await api.confirmImport({ drafts: payload });
      setCreated(res.problemIds.map((id, i) => ({ id, title: payload[i]?.title ?? id })));
      toast.success(`Đã nhập ${res.problemIds.length} bài`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setParsed(null);
    setDrafts([]);
    setCreated(null);
    setError(null);
  };

  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          title="Nhập đề"
          subtitle="Tải lên file đề (.docx/.pdf) hoặc dán nội dung đề, kiểm tra các bài được tách tự động rồi xác nhận để thêm vào ngân hàng của bạn (ở chế độ riêng tư)."
          actions={
            parsed && (
              <Button variant="secondary" onClick={reset}>
                <FileUp className="h-4 w-4" />
                Nhập đề khác
              </Button>
            )
          }
        />

        {created ? (
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 text-chalk-700">
              <CheckCircle2 className="h-6 w-6" />
              <h2 className="text-lg font-semibold">Đã nhập {created.length} bài vào ngân hàng của bạn</h2>
            </div>
            <p className="mb-3 text-sm text-slate-600">Bộ test đã được lưu cùng từng bài. Bạn có thể thêm lời giải cho từng bài:</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {created.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/bank/problems/${c.id}`} className="font-medium text-slate-800 hover:text-ink-600">
                    {c.title}
                  </Link>
                  <Link href={`/bank/problems/${c.id}?tab=solution`} className="text-sm text-ink-600 hover:underline">
                    Thêm lời giải
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-2">
              <Button onClick={reset}>Nhập file khác</Button>
              <LinkButton href="/bank/sets/new" variant="secondary">
                Tạo đề từ các bài này
              </LinkButton>
            </div>
          </Card>
        ) : !parsed ? (
          <div className="space-y-3">
            <div role="tablist" aria-label="Cách nhập đề" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {(
                [
                  ['file', 'Tải file lên', FileUp],
                  ['text', 'Dán nội dung', ClipboardPaste],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={source === key}
                  disabled={parsing}
                  onClick={() => setSource(key)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    source === key ? 'bg-ink-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {source === 'file' ? <Dropzone onFile={onFile} busy={parsing} /> : <PasteBox onSubmit={onText} busy={parsing} />}
            {error && <InlineAlert>{error}</InlineAlert>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-panel border border-slate-200 bg-white px-4 py-3">
              <FileText className="h-5 w-5 text-ink-600" />
              <span className="font-medium">{parsed.fileName}</span>
              {parsed.parser === 'AI' ? (
                <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">Đọc bằng AI</Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-600">Đọc theo mẫu</Badge>
              )}
              <span className="text-sm text-slate-500">
                tách được {drafts.length} bài, đã chọn {included.length}
              </span>
              <div className="ml-auto flex gap-2 text-sm">
                <button type="button" className="text-ink-600 hover:underline" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, include: true })))}>
                  Chọn tất cả
                </button>
                <span className="text-slate-300">|</span>
                <button type="button" className="text-ink-600 hover:underline" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, include: false })))}>
                  Bỏ chọn
                </button>
              </div>
            </div>
            {parsed.parser === 'BASIC' && (
              <p className="text-sm text-slate-600">
                Đề được đọc theo mẫu có sẵn. File PDF lộn xộn hoặc bản scan sẽ đọc tốt hơn bằng AI
                {canUseAi ? ', khi máy chủ có khóa API của Claude.' : ' (chỉ dành cho tài khoản giáo viên VIP).'}
              </p>
            )}
            <InlineAlert kind="info">
              Hãy kiểm tra tên bài, <b>chọn độ khó</b>, giới hạn và bộ test (test nào <b>là ví dụ</b>) trước khi nhập. Những cảnh báo màu vàng cần được xem lại.
            </InlineAlert>

            {drafts.map((d, i) => (
              <DraftCard
                key={i}
                index={i}
                d={d}
                update={(patch) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
              />
            ))}

            <Card>
              <button
                type="button"
                onClick={() => setShowRaw((s) => !s)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-700"
              >
                {showRaw ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Văn bản trích xuất gốc (tham khảo)
              </button>
              {showRaw && (
                <pre className="io-block max-h-[60vh] overflow-auto border-t border-slate-100 bg-slate-50 px-4 py-3">
                  {parsed.rawText || '(trống)'}
                </pre>
              )}
            </Card>

            <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
              <FileIoBlocker
                problems={drafts
                  .map((d, i) => ({ label: `Bài ${i + 1} (${d.title.trim() || 'chưa đặt tên'})`, content: d, include: d.include }))
                  .filter((p) => p.include)}
              />
              <div className="flex items-center justify-end gap-3">
                <span className="text-sm text-slate-500">
                  {included.length} bài, {included.reduce((n, d) => n + d.tests.length, 0)} test sẽ được thêm vào ngân hàng của bạn
                </span>
                <Button onClick={confirm} loading={importing} disabled={included.length === 0 || blocked}>
                  Nhập {included.length} bài
                </Button>
              </div>
            </div>
          </div>
        )}
      </Container>
    </RequireRole>
  );
}
