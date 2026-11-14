import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExamParser } from '../src/modules/importing/domain/exam-parser.js';
import type { DocumentBlock } from '../src/modules/importing/domain/exam-document.js';
import { htmlToBlocks } from '../src/modules/importing/infrastructure/document-reader.js';
import { inlineEquations } from '../src/modules/importing/infrastructure/omml.js';

/**
 * Upper bound for the OJ-15 speed tests. Generous on purpose: the suites run in parallel and timings vary under load,
 * while the quadratic versions these guard against took 4 to 34 seconds on the same inputs.
 */
const LIMIT_MS = 1_000;

const p = (text: string): DocumentBlock => ({ kind: 'paragraph', text });
const parse = (blocks: DocumentBlock[]) => new ExamParser().parse({ fileName: 'de.docx', blocks });

test('splits a Vietnamese exam into problems with sections, limits and table samples', () => {
  const drafts = parse([
    p('ĐỀ THI HỌC SINH GIỎI TIN HỌC'),
    p('Thời gian làm bài: 150 phút'),
    p('Bài 1. TỔNG HAI SỐ (5 điểm)'),
    p('Độ khó: Dễ'),
    p('Cho hai số nguyên a và b. Hãy tính a + b.'),
    p('Dữ liệu vào: Một dòng chứa hai số nguyên a, b.'),
    p('Kết quả: In ra tổng a + b.'),
    p('Giới hạn: |a|, |b| ≤ 10^9'),
    p('Ví dụ:'),
    { kind: 'table', rows: [['Input', 'Output'], ['1 2', '3'], ['10 20', '30']] },
    p('Bài 2: Dãy con'),
    p('Thời gian: 2 giây. Bộ nhớ: 512 MB'),
    p('Mức độ: khó'),
    p('Đếm số dãy con có tổng bằng K.'),
    p('Input'),
    p('Dòng đầu chứa n và K.'),
    p('Output'),
    p('Một số nguyên là đáp số.'),
    p('Ví dụ'),
    p('Input'),
    p('3 3'),
    p('1 2 3'),
    p('Output'),
    p('2'),
  ]);

  assert.equal(drafts.length, 2);
  const [a, b] = drafts;
  assert.equal(a.title, 'TỔNG HAI SỐ');
  assert.equal(a.difficulty, 'EASY');
  assert.match(a.statement, /tính a \+ b/);
  assert.match(a.inputFormat, /hai số nguyên a, b/);
  assert.match(a.outputFormat, /tổng a \+ b/);
  assert.match(a.constraints, /10\^9/);
  assert.deepEqual(a.tests, [
    { input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 10 },
    { input: '10 20\n', expectedOutput: '30\n', isSample: true, points: 10 },
  ]);

  assert.equal(b.title, 'Dãy con');
  assert.equal(b.difficulty, 'HARD');
  assert.equal(b.timeLimitMs, 2000);
  assert.equal(b.memoryLimitMb, 512);
  assert.match(b.inputFormat, /n và K/);
  assert.deepEqual(b.tests, [{ input: '3 3\n1 2 3\n', expectedOutput: '2\n', isSample: true, points: 10 }]);
  assert.ok(!b.warnings.some((w) => w.includes('ví dụ')));
});

test('single problem without "Bài N" header uses the first line as title and warns', () => {
  const [draft] = parse([p('Số nguyên tố'), p('Kiểm tra n có phải số nguyên tố.')]);
  assert.equal(draft.title, 'Số nguyên tố');
  assert.ok(draft.warnings.some((w) => w.includes('ví dụ')));
  assert.equal(draft.difficulty, 'MEDIUM');
});

test('converts mammoth HTML (paragraphs, line breaks, tables) to blocks', () => {
  const blocks = htmlToBlocks(
    '<p>Bài 1. A &amp; B</p><table><tr><td><p>Input</p></td><td><p>Output</p></td></tr>' +
      '<tr><td><p>1</p><p>2</p></td><td><p>3</p></td></tr></table><p>x<br />y</p>',
  );
  assert.deepEqual(blocks, [
    { kind: 'paragraph', text: 'Bài 1. A & B' },
    { kind: 'table', rows: [['Input', 'Output'], ['1\n2', '3']] },
    { kind: 'paragraph', text: 'x\ny' },
  ]);
});

test('superscripts and subscripts from Word keep their meaning', () => {
  const blocks = htmlToBlocks('<p>|a| ≤ 10<sup>6</sup>, a<sub>i</sub> ≤ 10<sup>18</sup>, x<sup>&lt;</sup></p>');
  assert.deepEqual(blocks, [{ kind: 'paragraph', text: '|a| ≤ 10^6, a_i ≤ 10^{18}, x^<' }]);
});

test('Word equations become plain text instead of disappearing', () => {
  const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
  const xml =
    '<w:p><w:r><w:t>n ≤ </w:t></w:r>' +
    `<m:oMath><m:sSup><m:sSupPr><m:ctrlPr/></m:sSupPr><m:e>${r('10')}</m:e><m:sup>${r('5')}</m:sup></m:sSup></m:oMath>` +
    `<m:oMath><m:f><m:num>${r('a+b')}</m:num><m:den>${r('2')}</m:den></m:f></m:oMath>` +
    `<m:oMath><m:sSub><m:e>${r('a')}</m:e><m:sub>${r('i+1')}</m:sub></m:sSub></m:oMath>` +
    `<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r('n')}</m:e></m:rad></m:oMath>` +
    `<m:oMath><m:d><m:e>${r('a')}</m:e><m:e>${r('b')}</m:e></m:d></m:oMath></w:p>`;
  const texts = [...inlineEquations(xml).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['n ≤ ', '10^5', '(a+b)/2', 'a_{i+1}', 'sqrt(n)', '(a,b)']);
});

const lan = { id: 't', role: 'TEACHER' as const, name: 'Lan' };

test('pasted exam text is split into problems like an uploaded file', async () => {
  const { ImportService } = await import('../src/modules/importing/application/import.service.js');
  const service = new ImportService({} as never, { available: false } as never, {} as never, { allows: async () => true } as never);
  const parsed = await service.parseText(
    lan,
    'Bài 1. TỔNG HAI SỐ\r\nCho hai số nguyên a và b.\r\n\r\nDữ liệu vào: Một dòng chứa a, b.\nKết quả: In ra a + b.\nVí dụ\nInput\n1 2\nOutput\n3\n' +
      'Bài 2. HIỆU\nTính a - b.\nDữ liệu vào: Hai số a, b.\nKết quả: In ra a - b.',
  );
  assert.equal(parsed.fileName, 'Nội dung đã dán');
  assert.equal(parsed.parser, 'BASIC');
  assert.deepEqual(parsed.drafts.map((d) => d.title), ['TỔNG HAI SỐ', 'HIỆU']);
  assert.deepEqual(parsed.drafts[0].tests, [{ input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 10 }]);
  await assert.rejects(service.parseText(lan, '  \n '), /Hãy dán nội dung đề/);
});

// ---------------------------------------------------------------- OJ-15 F4: untrusted text cannot stall the server

const timed = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

test('F4 regression: hostile paragraphs are parsed in linear time', () => {
  // Measured before the fix: 2,000 spaces blocked the event loop for about 8 s, 4,000 for over a minute.
  const header = `Bài 1${' '.repeat(4000)}x y`;
  assert.ok(timed(() => parse([p(header), p('Dữ liệu vào: hai số')])) < LIMIT_MS, 'problem header with a Unicode line separator');
  const longHeader = `Bài 1${' '.repeat(100_000)}z`;
  assert.ok(timed(() => parse([p(longHeader)])) < LIMIT_MS, 'a paste-limit-sized line');
  const section = `Input${' '.repeat(40_000)}x`;
  assert.ok(timed(() => parse([p('Bài 1. Tổng'), p(section)])) < LIMIT_MS, 'section header followed by a long run of spaces');
});

test('F4: headers and section colons are recognised exactly as before', () => {
  const [d] = parse([p('Bài 2 - Dãy con'), p('Dữ liệu vào (input.txt) : một số n'), p('Kết quả: in n')]);
  assert.equal(d.title, 'Dãy con');
  assert.match(d.inputFormat, /một số n/);
  // As with the original single pattern: a line break may sit in the whitespace before the title (the reported
  // "Bài 1\u2028Tổng hai số" case), never inside the title itself.
  const before = parse([p('Bài 1\u2028Tổng hai số'), p('Bài 3\nĐếm')]);
  assert.deepEqual(before.map((x) => x.title), ['Tổng hai số', 'Đếm']);
  const inside = parse([p('Bài 5. Hai\u2028dòng'), p('Bài 6. Thật')]);
  assert.deepEqual(inside.map((x) => x.title), ['Thật'], 'a title holding a line break is content, not a header');
});

test('F4 regression: a difficulty line with a long run of spaces is read in linear time, and still read', () => {
  assert.ok(timed(() => parse([p(`Độ khó${' '.repeat(50_000)}x`), p('Bài 1. T')])) < LIMIT_MS);
  const [d] = parse([p('Mức độ :  Khó'), p('Bài 1. T')]);
  assert.equal(d.difficulty, 'HARD');
});

test('F4 follow-up: blank lines in a table cell and unclosed Word equations are handled in linear time', () => {
  assert.ok(timed(() => parse([p('Bài 1. T'), { kind: 'table', rows: [['Input', 'Output'], [`${'\n'.repeat(200_000)}1 2`, '3']] }])) < LIMIT_MS);
  assert.ok(timed(() => inlineEquations('<m:oMath>'.repeat(20_000))) < LIMIT_MS);
  assert.ok(timed(() => inlineEquations('<m:oMathPara '.repeat(20_000))) < LIMIT_MS);
  assert.equal(
    inlineEquations('<w:t>n ≤ </w:t><m:oMath><m:sSup><m:e><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>5</m:t></m:r></m:sup></m:sSup></m:oMath>'),
    '<w:t>n ≤ </w:t><w:r><w:t xml:space="preserve">10^5</w:t></w:r>',
    'a well-formed equation is still converted',
  );
});
