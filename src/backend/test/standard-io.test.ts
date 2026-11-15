import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileIoFields, hasFileIo, isAboutFileIo, toStandardIo } from '@oj/contracts';

/**
 * Upper bound for the OJ-15 speed tests. Generous on purpose: the suites run in parallel and timings vary under load,
 * while the quadratic versions these guard against took 4 to 34 seconds on the same inputs.
 */
const LIMIT_MS = 1_000;

test('file-based input/output wording becomes standard input/output', () => {
  assert.equal(toStandardIo('Dữ liệu vào từ file BAI1.INP gồm hai số a, b.'), 'Dữ liệu vào từ đầu vào chuẩn gồm hai số a, b.');
  assert.equal(toStandardIo('Đọc dữ liệu từ tệp văn bản "SUM.INP":'), 'Đọc dữ liệu từ đầu vào chuẩn:');
  assert.equal(toStandardIo('Ghi kết quả ra file BAI1.OUT một số nguyên.'), 'Ghi kết quả ra màn hình (đầu ra chuẩn) một số nguyên.');
  assert.equal(toStandardIo('Kết quả ghi vào tập tin KQ.OUT'), 'Kết quả ghi ra màn hình (đầu ra chuẩn)');
  assert.equal(toStandardIo('Dữ liệu vào (BAI1.INP): một dòng chứa n.'), 'Dữ liệu vào: một dòng chứa n.');
  assert.equal(toStandardIo('Tên file chương trình: BAI1.CPP\nCho dãy số nguyên.'), 'Cho dãy số nguyên.');
});

test('every way of giving the input in a file becomes standard input', () => {
  const cases: [string, string][] = [
    ['Dữ liệu vào: cho trong file BAI1.INP gồm hai dòng.', 'Dữ liệu vào: được cho từ đầu vào chuẩn gồm hai dòng.'],
    ['Dữ liệu vào được cho bởi tệp văn bản DAYSO.INP có cấu trúc:', 'Dữ liệu vào được cho từ đầu vào chuẩn có cấu trúc:'],
    ['File dữ liệu vào BAI1.INP gồm một dòng chứa n.', 'Dữ liệu vào gồm một dòng chứa n.'],
    ['Tệp dữ liệu vào: SUM.INP', 'Dữ liệu vào:'],
    ['Tệp vào BAI1.INP gồm:', 'Dữ liệu vào gồm:'],
    ['Tệp input gồm n dòng.', 'Dữ liệu vào gồm n dòng.'],
    ['File BAUOC.INP gồm một dòng ghi số nguyên dương N.', 'Dữ liệu vào gồm một dòng ghi số nguyên dương N.'],
    ['Input file: input.txt', 'Input:'],
    ['Dòng đầu tiên của tệp chứa số n.', 'Dòng đầu tiên của dữ liệu vào chứa số n.'],
    ['Dữ liệu nằm trong tệp BAI2.INP.', 'Dữ liệu được cho từ đầu vào chuẩn.'],
    ['Dữ liệu vào: Đọc dữ liệu từ tệp input.txt', 'Dữ liệu vào: Đọc dữ liệu từ đầu vào chuẩn'],
  ];
  for (const [source, expected] of cases) assert.equal(toStandardIo(source), expected, source);
});

test('in the output section a bare "file" means the result', () => {
  assert.equal(toStandardIo('File kết quả BAI1.OUT gồm một số.', 'output'), 'Kết quả gồm một số.');
  assert.equal(toStandardIo('Tệp ra: SUM.OUT', 'output'), 'Kết quả:');
  assert.equal(toStandardIo('Kết quả ghi trong file KQ.OUT', 'output'), 'Kết quả in ra màn hình (đầu ra chuẩn)');
  assert.equal(toStandardIo('Dòng đầu của file ghi số cách chọn.', 'output'), 'Dòng đầu của kết quả ghi số cách chọn.');
});

test('text without files is left alone', () => {
  const s = 'Cho n số nguyên. In ra tổng của chúng.\nRa khỏi vòng lặp khi n = 0.';
  assert.equal(toStandardIo(s), s);
  assert.equal(toStandardIo('Profile của học sinh có 3 dòng.'), 'Profile của học sinh có 3 dòng.');
});

test('hints about reading or writing files are recognised', () => {
  for (const note of [
    'Đề yêu cầu đọc từ file BAI1.INP và ghi ra BAI1.OUT, cần chuyển sang stdin/stdout.',
    'Chương trình phải ghi kết quả vào tệp.',
    'Tên file chương trình không rõ.',
    'Học sinh cần dùng freopen.',
    'File đầu vào có thể rất lớn.',
  ]) assert.ok(isAboutFileIo(note), note);
  for (const note of [
    'Đề không ghi độ khó — AI đã ước lượng, hãy kiểm tra lại.',
    'Hình vẽ ở bài 2 không đọc được.',
    'Không tìm thấy ví dụ (test mẫu).',
    'Có nhiều đáp án đúng, cần checker riêng.',
  ]) assert.ok(!isAboutFileIo(note), note);
});

test('the teacher wording is kept on import; file wording is refused until it is fixed', async () => {
  const { ImportService } = await import('../src/modules/importing/application/import.service.js');
  const p = (text: string) => ({ kind: 'paragraph' as const, text });
  const doc = { fileName: 'de.docx', blocks: [
    p('Bài 1. TỔNG HAI SỐ'),
    p('Cho hai số nguyên a và b.'),
    p('Dữ liệu vào: Đọc từ file TONG.INP một dòng chứa a, b.'),
    p('Kết quả: Ghi ra file TONG.OUT tổng a + b.'),
    p('Ví dụ:'),
    { kind: 'table' as const, rows: [['TONG.INP', 'TONG.OUT'], ['1 2', '3']] },
  ] };
  const created: string[] = [];
  const service = new ImportService(
    { read: async () => doc } as never,
    { available: false } as never,
    { createProblem: async (_: unknown, problem: { title: string }) => (created.push(problem.title), 'id') } as never,
    { allows: async () => true } as never,
  );
  const [draft] = (await service.parse({ id: 't', role: 'TEACHER', name: 'Lan' }, { originalName: 'de.docx', mimeType: '', buffer: Buffer.from('PK\u0003\u0004') /* a .docx is a ZIP package */ })).drafts;
  assert.equal(draft.inputFormat, 'Đọc từ file TONG.INP một dòng chứa a, b.');
  assert.equal(draft.outputFormat, 'Ghi ra file TONG.OUT tổng a + b.');
  assert.deepEqual(draft.tests, [{ input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 10 }]);
  assert.ok(draft.warnings.every((w) => !isAboutFileIo(w)));

  const fine = { ...draft, title: 'Bài ổn', inputFormat: 'Một dòng chứa a, b.', outputFormat: 'In ra a + b.' };
  await assert.rejects(service.confirm({ id: 't', role: 'TEACHER', name: 'Lan' }, [fine, draft]),
    /Bài 2 \(TỔNG HAI SỐ\): Phần Dữ liệu vào, Kết quả còn yêu cầu đọc\/ghi file/);
  assert.deepEqual(created, [], 'nothing is imported when one draft is refused');

  const fixed = { ...draft, inputFormat: toStandardIo(draft.inputFormat), outputFormat: toStandardIo(draft.outputFormat, 'output') };
  assert.deepEqual(fileIoFields(fixed), []);
  await service.confirm({ id: 't', role: 'TEACHER', name: 'Lan' }, [fixed]);
  assert.deepEqual(created, ['TỔNG HAI SỐ']);
});

test('a problem asking for files cannot be saved', async () => {
  const { Problem, ResourceLimits } = await import('../src/modules/catalog/domain/problem.js');
  const content = { title: 'A', difficulty: 'EASY' as const, tags: [], statement: 'Cho a.', inputFormat: 'Một số a.', outputFormat: 'In ra a.', constraints: '' };
  const problem = Problem.create(1, { id: 't', name: 'Lan' }, content, ResourceLimits.default);
  assert.throws(() => problem.update({ ...content, outputFormat: 'Ghi ra tệp A.OUT số a.' }, ResourceLimits.default), /Phần Kết quả còn yêu cầu đọc\/ghi file/);
  assert.ok(hasFileIo('Dữ liệu vào (BAI1.INP): n'));
  assert.ok(!hasFileIo('Nhập từ bàn phím số n. In ra màn hình kết quả.'));
});

// ---------------------------------------------------------------- OJ-15 F4: problem text cannot stall the server

test('F4 regression: file-I/O detection and rewriting stay linear on long runs of spaces', () => {
  const sp = ' '.repeat(50_000);
  for (const [name, run] of [
    ['hasFileIo', () => hasFileIo(`của${sp}tệ`)], // 34 s before the fix; runs on every problem save
    ['toStandardIo', () => toStandardIo(`${sp}x`)],
    ['sentence-start rule', () => hasFileIo(`.${sp}x`)],
  ] as const) {
    const start = performance.now();
    run();
    assert.ok(performance.now() - start < LIMIT_MS, name);
  }
});

test('F4 follow-up: long runs of "-" or "_" before a dot are linear too', () => {
  for (const [name, run] of [
    ['dashes', () => hasFileIo(`${'-'.repeat(100_000)}.x`)], // about 16 s at this size before the bound
    ['underscores and dashes', () => toStandardIo(`${'_-'.repeat(50_000)}.inp`)],
  ] as const) {
    const start = performance.now();
    run();
    assert.ok(performance.now() - start < LIMIT_MS, name);
  }
  assert.equal(toStandardIo('Dữ liệu vào (BAI_1-A.INP): hai số'), 'Dữ liệu vào: hai số', 'ordinary names are still removed');
});
