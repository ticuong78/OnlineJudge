import { DomainError } from '../../../shared/domain/domain-error.js';

/** What the importer needs to know about an upload (same shape as the application port's UploadedFile). */
export interface DocumentFile {
  originalName: string;
  buffer: Buffer;
}

const ZIP = Buffer.from('PK\u0003\u0004', 'latin1');
const PDF = Buffer.from('%PDF-', 'latin1');

/**
 * Why an upload cannot be read as an exam document, or null when it can. The extension says what the file claims to
 * be; the first bytes say what it is (a .docx is a ZIP package, a PDF starts with "%PDF-" within its first kilobyte).
 * Checked before any reader, so a renamed file gets this message instead of "no text found" (K-3).
 */
export function documentFileProblem(file: DocumentFile): DomainError | null {
  const name = file.originalName.toLowerCase();
  const isDocx = name.endsWith('.docx');
  if (!isDocx && !name.endsWith('.pdf')) {
    return DomainError.validation('import.unsupported_type', 'Chỉ hỗ trợ tệp .docx hoặc .pdf.');
  }
  const head = file.buffer.subarray(0, 1024);
  const genuine = isDocx ? head.subarray(0, 4).equals(ZIP) : head.includes(PDF);
  if (!genuine) {
    return DomainError.validation('import.invalid_file',
      `Tệp này không phải tài liệu Word (.docx) hoặc PDF hợp lệ (nội dung không khớp đuôi ${isDocx ? '.docx' : '.pdf'}). `
        + 'Hãy mở tệp bằng Word rồi lưu lại dạng .docx hoặc xuất ra PDF, hoặc dán nội dung đề vào tab "Dán nội dung".');
  }
  return null;
}
