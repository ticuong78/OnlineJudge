/**
 * Builds the sample files used for manual and UAT testing of "Nhập đề" (exam import) and of submissions.
 *   node samples/make-samples.mjs
 * No extra packages: .docx files are zipped with the backend's jszip, PDFs are printed by Playwright's Chromium
 * (installed with `pnpm exec playwright install chromium`), so Vietnamese text keeps its diacritics.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const JSZip = createRequire(path.join(root, 'src/backend/package.json'))('jszip');
const { chromium } = createRequire(path.join(root, 'package.json'))('@playwright/test');
const out = (...p) => path.join(here, ...p);
mkdirSync(out('exams'), { recursive: true });

// ---------------------------------------------------------------- minimal .docx writer

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, bold = false) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (text, bold = false) => `<w:p>${run(text, bold)}</w:p>`;
const table = (rows) => `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('')}</w:tblBorders></w:tblPr>${rows
  .map((cells, i) => `<w:tr>${cells.map((c) => `<w:tc>${c.split('\n').map((line) => para(line, i === 0)).join('')}</w:tc>`).join('')}</w:tr>`)
  .join('')}</w:tbl>`;

/** blocks: strings (paragraph; "# " prefix = bold) or { table: string[][] } */
async function docx(file, blocks) {
  const body = blocks.map((b) => (typeof b === 'string' ? (b.startsWith('# ') ? para(b.slice(2), true) : para(b)) : table(b.table))).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  writeFileSync(out('exams', file), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ---------------------------------------------------------------- 1. a normal class test (Word), with noise to filter

await docx('de-kiem-tra-vong-lap.docx', [
  '# TRƯỜNG THPT NGUYỄN DU — TỔ TIN HỌC',
  '# ĐỀ KIỂM TRA 45 PHÚT: VÒNG LẶP VÀ MẢNG (LỚP 10)',
  'Thời gian: 1 giây. Bộ nhớ: 256 MB',
  'Tham gia nhóm Zalo ôn thi HSG Tin học: zalo.me/g/abcxyz123 để nhận thêm đề miễn phí!',
  '# Bài 1. TỔNG CÁC CHỮ SỐ (3 điểm)',
  'Độ khó: Dễ',
  'Cho số nguyên dương n. Hãy tính tổng các chữ số của n.',
  'Link problem : https://leetcode.com/problems/add-digits/',
  'Dữ liệu vào: Một dòng chứa số nguyên dương n.',
  'Kết quả: In ra tổng các chữ số của n.',
  'Giới hạn: 1 ≤ n ≤ 10^18',
  'Ví dụ',
  'Input',
  '1234',
  'Output',
  '10',
  'Input',
  '9',
  'Output',
  '9',
  '# Bài 2: ĐẾM SỐ CHẴN (3 điểm)',
  'Độ khó: Trung bình',
  'Cho dãy gồm n số nguyên. Đếm xem trong dãy có bao nhiêu số chẵn.',
  'Dữ liệu vào:',
  'Dòng đầu chứa số nguyên n.',
  'Dòng thứ hai chứa n số nguyên a1, a2, ..., an.',
  'Kết quả: Một số nguyên là số lượng số chẵn trong dãy.',
  'Ràng buộc: 1 ≤ n ≤ 10^5; |ai| ≤ 10^9',
  'Ví dụ:',
  { table: [['Input', 'Output'], ['5\n1 2 3 4 6', '3'], ['3\n-2 0 7', '2']] },
  '# Câu 3. SỐ LỚN THỨ HAI (4 điểm)',
  'Mức độ: khó',
  'Thời gian: 2 giây',
  'Cho dãy n số nguyên đôi một khác nhau. Tìm số lớn thứ hai trong dãy.',
  'Dữ liệu vào: Dòng đầu là n (n ≥ 2), dòng sau gồm n số nguyên.',
  'Kết quả: In ra số lớn thứ hai.',
  'Ví dụ',
  'Input',
  '4',
  '7 2 9 4',
  'Output',
  '7',
  'Giải thích: số lớn nhất là 9, số lớn thứ hai là 7.',
  'Đăng ký khóa học lập trình tại fanpage facebook.com/hoclaptrinhcaptoc — giảm 50% hôm nay!',
]);

// ---------------------------------------------------------------- 2. an HSG-style exam with file input/output (Word)

await docx('de-thi-hsg-file-io.docx', [
  '# SỞ GIÁO DỤC VÀ ĐÀO TẠO — KỲ THI CHỌN HỌC SINH GIỎI CẤP TỈNH',
  '# Môn: TIN HỌC — Thời gian làm bài: 150 phút',
  'Tổng quan: thí sinh đặt tên file chương trình theo tên bài (BAI1.CPP, BAI2.CPP...).',
  '# Bài 1. SỐ HOÀN HẢO (6 điểm)',
  'Một số nguyên dương được gọi là số hoàn hảo nếu nó bằng tổng các ước dương nhỏ hơn nó. Ví dụ 6 = 1 + 2 + 3.',
  'Dữ liệu vào: Đọc từ file văn bản BAI1.INP gồm một số nguyên dương n.',
  'Kết quả: Ghi ra file văn bản BAI1.OUT chữ YES nếu n là số hoàn hảo, ngược lại ghi NO.',
  'Giới hạn: 1 ≤ n ≤ 10^12. Thời gian: 1 giây. Bộ nhớ: 256 MB',
  'Ví dụ',
  { table: [['BAI1.INP', 'BAI1.OUT'], ['6', 'YES'], ['12', 'NO']] },
  '# Bài 2. XÂU ĐỐI XỨNG (7 điểm)',
  'Độ khó: Khó',
  'Cho một xâu S chỉ gồm chữ cái thường. Tìm độ dài xâu con liên tiếp dài nhất của S là xâu đối xứng.',
  'Dữ liệu vào: File BAI2.INP chứa xâu S (1 ≤ |S| ≤ 5000).',
  'Kết quả: File BAI2.OUT gồm một số nguyên là độ dài tìm được.',
  'Ví dụ',
  { table: [['BAI2.INP', 'BAI2.OUT'], ['abacdcaba', '9'], ['abcd', '1']] },
  '# Bài 3. ĐƯỜNG ĐI NGẮN NHẤT (7 điểm)',
  'Độ khó: Rất khó',
  'Cho đồ thị vô hướng n đỉnh, m cạnh có trọng số dương. Tìm độ dài đường đi ngắn nhất từ đỉnh 1 đến đỉnh n, in -1 nếu không có đường đi.',
  'Dữ liệu vào: File BAI3.INP: dòng đầu n, m; m dòng tiếp theo mỗi dòng ba số u, v, w.',
  'Kết quả: File BAI3.OUT gồm một số nguyên.',
  'Giới hạn: 2 ≤ n ≤ 10^5; 1 ≤ m ≤ 2·10^5; 1 ≤ w ≤ 10^9. Thời gian: 2 giây.',
  'Ví dụ',
  { table: [['BAI3.INP', 'BAI3.OUT'], ['4 4\n1 2 1\n2 4 5\n1 3 2\n3 4 1', '3']] },
]);

// ---------------------------------------------------------------- 3 and 4. PDFs (a text layer, and a "scan" without one)

const pdfHtml = `<!doctype html><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;margin:40px}h1{font-size:18px}h2{font-size:15px;margin-top:22px}pre{font-family:Courier,monospace;margin:0}</style>
<h1>ĐỀ LUYỆN TẬP CUỐI TUẦN — LỚP 11</h1>
<p>Thời gian: 1 giây. Bộ nhớ: 128 MB</p>
<h2>Bài 1. Chia kẹo</h2>
<p>Độ khó: Dễ</p>
<p>Có n cái kẹo chia đều cho k bạn. Mỗi bạn được bao nhiêu kẹo và còn dư bao nhiêu kẹo?</p>
<p>Dữ liệu vào: Một dòng gồm hai số nguyên dương n và k.</p>
<p>Kết quả: In ra hai số: số kẹo mỗi bạn nhận được và số kẹo còn dư.</p>
<p>Ví dụ</p>
<p>Input</p><pre>17 5</pre><p>Output</p><pre>3 2</pre>
<h2>Bài 2. Năm nhuận</h2>
<p>Độ khó: Trung bình</p>
<p>Cho năm y. In YES nếu y là năm nhuận theo lịch Gregory, ngược lại in NO.</p>
<p>Dữ liệu vào: Một số nguyên y (1 ≤ y ≤ 10^9).</p>
<p>Kết quả: YES hoặc NO.</p>
<p>Ví dụ</p>
<p>Input</p><pre>2024</pre><p>Output</p><pre>YES</pre>
<p>Input</p><pre>1900</pre><p>Output</p><pre>NO</pre>`;

const scanHtml = `<!doctype html><meta charset="utf-8"><body style="margin:40px"><canvas id="c" width="700" height="300"></canvas><script>
const g = document.getElementById('c').getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, 700, 300); g.fillStyle = '#222'; g.font = '20px Arial';
['Bài 1. Tổng hai số', 'Cho hai số nguyên a và b. In ra a + b.', 'Dữ liệu vào: hai số a, b.', 'Kết quả: tổng a + b.']
  .forEach((line, i) => g.fillText(line, 20, 50 + i * 40));
document.body.appendChild(Object.assign(new Image(), { src: c.toDataURL() })); c.remove();
</script>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(pdfHtml);
await page.pdf({ path: out('exams', 'de-luyen-tap.pdf'), format: 'A4' });
await page.setContent(scanHtml);
await page.waitForTimeout(200);
await page.pdf({ path: out('exams', 'de-scan-khong-co-chu.pdf'), format: 'A4' });
await browser.close();

// ---------------------------------------------------------------- 5. text for the "Dán nội dung" tab, and a bad file

writeFileSync(out('exams', 'noi-dung-dan.txt'), `Bài 1. Đảo số
Cho số nguyên dương n, in ra các chữ số của n theo thứ tự ngược lại.
Dữ liệu vào: Một số nguyên dương n (n ≤ 10^9).
Kết quả: Số sau khi đảo (bỏ các số 0 ở đầu).
Ví dụ
Input
1230
Output
321

Bài 2. Bảng cửu chương
Độ khó: Dễ
Cho số nguyên k (1 ≤ k ≤ 9). In bảng cửu chương k, mỗi dòng có dạng "k x i = tích" với i từ 1 đến 10.
Dữ liệu vào: Một số nguyên k.
Kết quả: 10 dòng như mô tả.
Ví dụ
Input
2
Output
2 x 1 = 2
2 x 2 = 4
2 x 3 = 6
2 x 4 = 8
2 x 5 = 10
2 x 6 = 12
2 x 7 = 14
2 x 8 = 16
2 x 9 = 18
2 x 10 = 20
`);
writeFileSync(out('exams', 'khong-phai-word.docx'), 'Đây là một file văn bản thường bị đổi đuôi thành .docx, không phải tài liệu Word.\n');
console.log('Samples written to', out('exams'));
