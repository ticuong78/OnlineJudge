import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ImportService } from '../src/modules/importing/application/import.service.js';
import { documentFileProblem } from '../src/modules/importing/domain/document-file.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';

const SAMPLES = join(__dirname, '../../../samples/exams');
const file = (name: string, buffer = readFileSync(join(SAMPLES, name))) => ({ originalName: name, mimeType: 'application/octet-stream', buffer });

test('K-3: real Word and PDF files pass the signature check', () => {
  for (const name of ['de-kiem-tra-vong-lap.docx', 'de-thi-hsg-file-io.docx', 'de-luyen-tap.pdf', 'de-scan-khong-co-chu.pdf']) {
    assert.equal(documentFileProblem(file(name)), null, name);
  }
});

test('K-3: a file whose content is not Word or PDF is named as such, whatever its extension', () => {
  assert.equal(documentFileProblem(file('khong-phai-word.docx'))?.code, 'import.invalid_file');
  assert.equal(documentFileProblem(file('de.pdf', Buffer.from('PK\u0003\u0004 a zip, not a pdf')))?.code, 'import.invalid_file');
  assert.equal(documentFileProblem(file('de.docx', Buffer.from('%PDF-1.7 a pdf named docx')))?.code, 'import.invalid_file');
  assert.equal(documentFileProblem(file('de.doc', Buffer.from('anything')))?.code, 'import.unsupported_type');
  assert.equal(documentFileProblem(file('trong.pdf', Buffer.alloc(0)))?.code, 'import.invalid_file');
});

test('K-3: the import refuses such a file before any reader, with the right message', async () => {
  let readerCalled = false;
  const reader = { read: async () => { readerCalled = true; return { fileName: '', blocks: [] }; } };
  const service = new ImportService(reader as never, { available: true, read: async () => { readerCalled = true; return []; } } as never, {} as never, { allows: async () => true } as never);
  const error = await service.parse({ id: 't', role: 'TEACHER', name: 'T' }, file('khong-phai-word.docx')).then(() => null, (e: DomainError) => e);
  assert.equal(error?.code, 'import.invalid_file');
  assert.match(error!.message, /không phải tài liệu Word \(\.docx\) hoặc PDF hợp lệ/);
  assert.equal(readerCalled, false, 'neither the document reader nor the AI reader sees it');
});
