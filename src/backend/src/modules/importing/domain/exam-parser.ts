import type { Difficulty, ProblemDraftDto } from '@oj/contracts';
import type { DocumentBlock, ExamDocument } from './exam-document.js';

/** Points of an example test read from a document (same default as a test added by hand). */
export const SAMPLE_POINTS = 10;

/**
 * Domain service: turns an exam document into problem drafts using heuristics that match
 * common Vietnamese/English problem layouts ("Bài 1", "Dữ liệu vào", "Kết quả", "Ví dụ", ...).
 * The result is always reviewed by the admin before import, so the parser favours recall
 * and reports anything doubtful as a warning.
 */
export class ExamParser {
  parse(doc: ExamDocument): ProblemDraftDto[] {
    const { preamble, segments } = splitIntoProblems(doc.blocks);
    const defaults = readMetadata(preamble.filter(isParagraph).map((b) => b.text).join('\n'));
    return segments.map((segment) => new DraftBuilder(segment, defaults).build());
  }
}

// ---------- Text helpers ----------

/** Lowercase + strip Vietnamese diacritics, keeping string length so indexes stay valid. */
export function fold(text: string): string {
  return Array.from(text.normalize('NFC'))
    .map((ch) => {
      if (ch === 'đ' || ch === 'Đ') return 'd';
      return ch.normalize('NFD')[0].toLowerCase();
    })
    .join('');
}

const isParagraph = (b: DocumentBlock): b is { kind: 'paragraph'; text: string } => b.kind === 'paragraph';

// ---------- Patterns (matched against folded text) ----------

/** A problem header is one short line; longer paragraphs are content (the split below always required this). */
const MAX_HEADER_LENGTH = 200;
/**
 * "Bài 1.", "Câu 2:", "Problem III -": the header up to its title. The title is the rest of the paragraph (see
 * matchProblemHeader); with no `(.*)$` after it this pattern cannot backtrack far (each whitespace run is greedy).
 */
const PROBLEM_HEADER_PREFIX = /^(bai tap|bai|cau|problem|exercise|task)\s*(?:so\s*)?(\d+|[ivx]+)\s*(?:[:.)\-–—]|\s|$)\s*/;
/** A title never holds one of these (the old single pattern read the title with `(.*)$`, whose dot skips them). */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * Index where a run of `chars` at the end of `text` starts (text.length when there is none), found from the end.
 * `/[…]+$/` scans that run again from every position of a long run not at the end, which is quadratic: a 100k-space
 * first line took over 15 seconds in the title clean-up (OJ-15 F4).
 */
function trailingStart(text: string, chars: RegExp): number {
  let i = text.length;
  while (i > 0 && chars.test(text[i - 1])) i--;
  return i;
}

/**
 * Matches a problem header on one folded paragraph, in linear time (OJ-15 F4). The old single pattern
 * `PREFIX(.*)$` could split its three optional whitespace runs in cubically many ways, and when the title failed on a
 * line break every split was tried: "Bài 1" + thousands of
 * spaces + U+2028 blocked the server for minutes. Same answer, found directly: the prefix with greedy whitespace, then
 * the rest of the paragraph as the title, which matches only if it holds no line break. (A line break inside the
 * whitespace before the title is fine, as before: "Bài 1\u2028Tổng hai số" is still a header.) Returns the groups
 * the old pattern did: [whole, word, number, title].
 */
function matchProblemHeader(folded: string): [string, string, string, string] | null {
  const prefix = PROBLEM_HEADER_PREFIX.exec(folded);
  if (!prefix) return null;
  const title = folded.slice(prefix[0].length);
  if (LINE_BREAK.test(title)) return null;
  return [folded, prefix[1], prefix[2], title];
}

type Section = 'statement' | 'input' | 'output' | 'constraints' | 'example' | 'explanation';

const SECTION_HEADERS: [Section, RegExp][] = [
  ['example', /^(vi du|cac vi du|example|examples|sample tests?|test mau|du lieu mau)\b\s*\d*/],
  ['input', /^(du lieu vao|du lieu nhap|du lieu dau vao|dau vao|input format|input|nhap vao|nhap)\b/],
  ['output', /^(ket qua ra|ket qua|du lieu ra|du lieu dau ra|dau ra|output format|output|xuat ra|xuat)\b/],
  ['constraints', /^(gioi han|rang buoc|constraints?|subtasks?|cham diem|han che)\b/],
  ['explanation', /^(giai thich|explanation|notes?|ghi chu)\b/],
];

const SAMPLE_INPUT = /^(sample input|input mau|input|dau vao|du lieu vao|vao)\s*\d*\s*:?\s*/;
const SAMPLE_OUTPUT = /^(sample output|output mau|output|dau ra|ket qua|du lieu ra|ra)\s*\d*\s*:?\s*/;
const SAMPLE_IO_HEADER = /^(sample (input|output)|input mau|output mau)\b/;

const TIME_RE = /(thoi gian|time limit|time)[^\d\n]{0,30}?(\d+(?:[.,]\d+)?)\s*(ms|milliseconds?|giay|s|sec|seconds?)\b/;
const MEMORY_RE = /(bo nho|memory(?: limit)?)[^\d\n]{0,30}?(\d+(?:[.,]\d+)?)\s*(mb|kb|gb|megabytes?)\b/;
// One whitespace run before the optional separator and one after it, not two adjacent optional runs (OJ-15 F4).
const DIFFICULTY_RE = /(do kho|muc do|difficulty|level)\s*(?:[:=\-–]\s*)?(rat kho|very hard|expert|trung binh|medium|kho|hard|de|easy|[1-5])\b/;
const STARS_RE = /(★|⭐|\*){1,5}/;

interface Metadata {
  timeLimitMs?: number;
  memoryLimitMb?: number;
  difficulty?: Difficulty;
}

function readMetadata(raw: string): Metadata {
  const text = fold(raw);
  const meta: Metadata = {};
  const time = TIME_RE.exec(text);
  if (time) {
    const value = Number(time[2].replace(',', '.'));
    meta.timeLimitMs = Math.round(time[3].startsWith('m') ? value : value * 1000);
  }
  const memory = MEMORY_RE.exec(text);
  if (memory) {
    const value = Number(memory[2].replace(',', '.'));
    const unit = memory[3];
    meta.memoryLimitMb = Math.round(unit === 'kb' ? value / 1024 : unit === 'gb' ? value * 1024 : value);
  }
  const difficulty = DIFFICULTY_RE.exec(text);
  if (difficulty) meta.difficulty = toDifficulty(difficulty[2]);
  return meta;
}

function toDifficulty(word: string): Difficulty {
  if (['rat kho', 'very hard', 'expert', '4', '5'].includes(word)) return 'EXPERT';
  if (['kho', 'hard', '3'].includes(word)) return 'HARD';
  if (['trung binh', 'medium', '2'].includes(word)) return 'MEDIUM';
  return 'EASY';
}

/** True when a paragraph contains nothing but limits/difficulty information. */
function isPureMetadata(text: string): boolean {
  const rest = fold(text)
    .replace(TIME_RE, '')
    .replace(MEMORY_RE, '')
    .replace(DIFFICULTY_RE, '')
    .replace(/gioi han|thoi gian|bo nho|chay|thuc hien|moi test|tren moi test|per test|[\s:;,.\-–()/|]+/g, '');
  return rest.length <= 3;
}

// ---------- Splitting ----------

interface Segment {
  header: string;
  blocks: DocumentBlock[];
}

function splitIntoProblems(blocks: DocumentBlock[]): { preamble: DocumentBlock[]; segments: Segment[] } {
  const preamble: DocumentBlock[] = [];
  const segments: Segment[] = [];
  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.text.length < MAX_HEADER_LENGTH && matchProblemHeader(fold(block.text.trim()))) {
      segments.push({ header: block.text.trim(), blocks: [] });
    } else if (segments.length) {
      segments[segments.length - 1].blocks.push(block);
    } else {
      preamble.push(block);
    }
  }
  if (segments.length === 0) {
    // Single-problem document: the first paragraph is the title.
    const first = preamble.findIndex((b) => isParagraph(b) && b.text.trim());
    if (first === -1) return { preamble: [], segments: [] };
    const title = (preamble[first] as { text: string }).text.trim();
    return { preamble: [], segments: [{ header: title, blocks: preamble.slice(first + 1) }] };
  }
  return { preamble, segments };
}

// ---------- Building one draft ----------

interface Sample {
  input: string[];
  output: string[];
}

class DraftBuilder {
  private readonly parts: Record<Section, string[]> = {
    statement: [], input: [], output: [], constraints: [], example: [], explanation: [],
  };
  private section: Section = 'statement';
  private samples: Sample[] = [];
  private sampleSide: 'input' | 'output' | null = null;
  private meta: Metadata = {};
  private images = 0;
  private title = '';

  constructor(
    private readonly segment: Segment,
    private readonly defaults: Metadata,
  ) {}

  build(): ProblemDraftDto {
    this.title = this.extractTitle(this.segment.header);
    this.mergeMeta(readMetadata(this.segment.header));

    for (const block of this.segment.blocks) {
      if (block.kind === 'image') {
        this.images++;
        this.parts[this.textSection()].push('*[Hình ảnh trong đề gốc]*');
      } else if (block.kind === 'table') {
        this.handleTable(block.rows);
      } else {
        this.handleParagraph(block.text);
      }
    }
    return this.toDraft();
  }

  private extractTitle(header: string): string {
    const folded = fold(header);
    const m = matchProblemHeader(folded);
    let title = m ? header.slice(header.length - m[3].length) : header;
    title = title
      .replace(/\(\s*\d+(?:[.,]\d+)?\s*(điểm|diem|points?|đ)\s*\)/gi, '')
      .replace(/\b\d+(?:[.,]\d+)?\s*(điểm|points?)\b/gi, '');
    title = title.slice(0, trailingStart(title, /[-–—:.\s]/u)).trim();
    if (!title && m) title = header.trim();
    return title;
  }

  private mergeMeta(meta: Metadata) {
    this.meta = { ...meta, ...this.meta };
  }

  private textSection(): Section {
    return this.section === 'example' ? 'explanation' : this.section;
  }

  private handleParagraph(raw: string) {
    const text = raw.trimEnd();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const folded = fold(trimmed);

    // Title on its own line right after "Bài 1".
    if (!this.title && trimmed.length <= 120 && this.isEmpty()) {
      this.title = trimmed;
      return;
    }

    const meta = readMetadata(trimmed);
    if (meta.timeLimitMs || meta.memoryLimitMb || meta.difficulty) {
      this.mergeMeta(meta);
      if (isPureMetadata(trimmed)) return;
    }

    if (this.section === 'example' && this.handleSampleLine(text, folded)) return;

    const header = this.matchSectionHeader(trimmed, folded);
    if (header) {
      this.section = header.section;
      if (header.section === 'example') {
        this.sampleSide = null;
        if (SAMPLE_IO_HEADER.test(folded)) this.handleSampleLine(text, folded);
        else if (header.rest) this.parts.example.push(header.rest);
      } else if (header.rest) {
        this.parts[header.section].push(header.rest);
      }
      return;
    }

    this.parts[this.textSection()].push(trimmed);
  }

  /** Returns true if the line was consumed as part of a sample. */
  private handleSampleLine(text: string, folded: string): boolean {
    const isShort = folded.length <= 40;
    const input = SAMPLE_INPUT.exec(folded);
    const output = SAMPLE_OUTPUT.exec(folded);
    if (input && (isShort || folded[input[0].length - 1] === ':')) {
      this.sampleSide = 'input';
      this.samples.push({ input: [], output: [] });
      const rest = text.trim().slice(input[0].length).trim();
      if (rest) this.current().input.push(rest);
      return true;
    }
    if (output && (isShort || folded[output[0].length - 1] === ':')) {
      if (!this.samples.length) this.samples.push({ input: [], output: [] });
      this.sampleSide = 'output';
      const rest = text.trim().slice(output[0].length).trim();
      if (rest) this.current().output.push(rest);
      return true;
    }
    if (SECTION_HEADERS.some(([section, re]) => section !== 'example' && section !== 'input' && section !== 'output' && re.test(folded))) {
      this.sampleSide = null;
      return false;
    }
    if (/^(vi du|example|sample)\b/.test(folded)) {
      this.sampleSide = null;
      return true;
    }
    if (this.sampleSide) {
      this.current()[this.sampleSide].push(text.trimEnd());
      return true;
    }
    return false;
  }

  private current(): Sample {
    return this.samples[this.samples.length - 1];
  }

  private matchSectionHeader(trimmed: string, folded: string): { section: Section; rest: string } | null {
    for (const [section, re] of SECTION_HEADERS) {
      const m = re.exec(folded);
      if (!m) continue;
      const after = folded.slice(m[0].length);
      // One whitespace run before the optional "(...)" and one after it: two adjacent \s* runs made a long line of
      // spaces quadratic to reject (OJ-15 F4). Accepts exactly what the old pattern accepted.
      const colon = /^\s*(?:\([^)]*\)\s*)?[:.]/.exec(after);
      if (colon) return { section, rest: trimmed.slice(m[0].length + colon[0].length).trim() };
      if (folded.length <= 40) return { section, rest: '' };
    }
    return null;
  }

  private handleTable(rows: string[][]) {
    const cleaned = rows.map((r) => r.map((c) => c.trimEnd())).filter((r) => r.some((c) => c.trim()));
    if (!cleaned.length) return;
    const header = cleaned[0].map((c) => fold(c.trim()));
    const inCol = header.findIndex((c) => /(input|vao|\.inp\b|dau vao)/.test(c));
    const outCol = header.findIndex((c, i) => i !== inCol && /(output|ra\b|\.out\b|ket qua|dau ra)/.test(c));

    if (inCol !== -1 && outCol !== -1) {
      for (const row of cleaned.slice(1)) {
        this.samples.push({ input: (row[inCol] ?? '').split('\n'), output: (row[outCol] ?? '').split('\n') });
      }
      return;
    }
    if (this.section === 'example' && cleaned[0].length >= 2) {
      for (const row of cleaned) this.samples.push({ input: row[0].split('\n'), output: row[1].split('\n') });
      return;
    }
    // Generic table (e.g. constraints per subtask): keep as Markdown.
    const md = [
      `| ${cleaned[0].join(' | ')} |`,
      `| ${cleaned[0].map(() => '---').join(' | ')} |`,
      ...cleaned.slice(1).map((r) => `| ${r.map((c) => c.replace(/\n/g, '<br>')).join(' | ')} |`),
    ].join('\n');
    this.parts[this.textSection()].push(md);
  }

  private isEmpty(): boolean {
    return Object.values(this.parts).every((p) => p.length === 0) && this.samples.length === 0;
  }

  private toDraft(): ProblemDraftDto {
    const join = (lines: string[]) => lines.join('\n\n').trim();
    const samples = this.samples
      .map((s) => ({ input: block(s.input), expectedOutput: block(s.output) }))
      .filter((s) => s.input.trim() || s.expectedOutput.trim());

    let statement = join(this.parts.statement);
    const notes = [...this.parts.example, ...this.parts.explanation];
    if (notes.length) statement += `\n\n### Giải thích ví dụ\n\n${join(notes)}`;

    const meta = { ...this.defaults, ...this.meta };
    const warnings: string[] = [];
    if (!this.title) warnings.push('Không tìm thấy tên bài.');
    if (!this.parts.input.length) warnings.push('Không tìm thấy phần "Dữ liệu vào".');
    if (!this.parts.output.length) warnings.push('Không tìm thấy phần "Kết quả".');
    if (!samples.length) warnings.push('Không tìm thấy ví dụ (test mẫu).');
    if (samples.some((s) => !s.expectedOutput.trim())) warnings.push('Có ví dụ thiếu kết quả mong đợi.');
    if (!meta.difficulty) warnings.push('Đề không ghi độ khó — mặc định "Trung bình", hãy chọn lại.');
    if (!meta.timeLimitMs) warnings.push('Không thấy giới hạn thời gian — mặc định 1 giây.');
    if (this.images) warnings.push(`Đề có ${this.images} hình ảnh/công thức không trích xuất được, cần kiểm tra lại nội dung.`);

    return {
      title: this.title || 'Bài chưa đặt tên',
      difficulty: meta.difficulty ?? 'MEDIUM',
      statement,
      inputFormat: join(this.parts.input),
      outputFormat: join(this.parts.output),
      constraints: join(this.parts.constraints),
      timeLimitMs: clamp(meta.timeLimitMs ?? 1000, 100, 15_000),
      memoryLimitMb: clamp(meta.memoryLimitMb ?? 256, 16, 1024),
      // Examples from the document become example tests; the teacher adds the judging tests.
      tests: samples.map((s) => ({ ...s, isSample: true, points: SAMPLE_POINTS })),
      warnings,
    };
  }
}

/** The lines without blank lines at either end. By index: shift() in a loop was quadratic on many blank lines (OJ-15 F4). */
function block(lines: string[]): string {
  let first = 0;
  let last = lines.length;
  while (first < last && !lines[first].trim()) first++;
  while (last > first && !lines[last - 1].trim()) last--;
  return first < last ? lines.slice(first, last).join('\n') + '\n' : '';
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
