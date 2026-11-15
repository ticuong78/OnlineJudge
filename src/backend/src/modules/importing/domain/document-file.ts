import { DomainError } from '../../../shared/domain/domain-error.js';

/** What the importer needs to know about an upload (same shape as the application port's UploadedFile). */
export interface DocumentFile {
  originalName: string;
  buffer: Buffer;
}

const ZIP = Buffer.from('PK\u0003\u0004', 'latin1');
const PDF = Buffer.from('%PDF-', 'latin1');

const IMAGE_TYPES = [
  { ext: ['.png'], media: 'image/png', is: (h: Buffer) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: ['.jpg', '.jpeg'], media: 'image/jpeg', is: (h: Buffer) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { ext: ['.webp'], media: 'image/webp', is: (h: Buffer) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP' },
] as const;

export type ImageMediaType = (typeof IMAGE_TYPES)[number]['media'];

/** Claude reads images of at most 5 MB (OJ-23); the upload limit for documents is larger. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The image type of an upload, by its extension (OJ-23); null for documents. */
export function imageMediaType(name: string): ImageMediaType | null {
  const lower = name.toLowerCase();
  return IMAGE_TYPES.find((t) => t.ext.some((e) => lower.endsWith(e)))?.media ?? null;
}

/**
 * Why an upload cannot be read as an exam document or a photo of one, or null when it can. The extension says what the
 * file claims to be; the first bytes say what it is (a .docx is a ZIP package, a PDF starts with "%PDF-" within its
 * first kilobyte, images have their own signatures). Checked before any reader, so a renamed file gets this message
 * instead of "no text found" (K-3).
 */
export function documentFileProblem(file: DocumentFile): DomainError | null {
  const name = file.originalName.toLowerCase();
  const head = file.buffer.subarray(0, 1024);
  const image = IMAGE_TYPES.find((t) => t.ext.some((e) => name.endsWith(e)));
  if (image) {
    if (!image.is(head)) {
      return DomainError.validation('import.invalid_file',
        `Tệp này không phải ảnh ${image.ext[0].slice(1).toUpperCase()} hợp lệ (nội dung không khớp đuôi tệp). Hãy chụp hoặc lưu lại ảnh rồi tải lên.`);
    }
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      return DomainError.validation('import.image_too_large', 'Ảnh tối đa 5MB. Hãy chụp lại với độ phân giải thấp hơn hoặc cắt bớt phần thừa.');
    }
    return null;
  }
  const isDocx = name.endsWith('.docx');
  if (!isDocx && !name.endsWith('.pdf')) {
    return DomainError.validation('import.unsupported_type', 'Chỉ hỗ trợ tệp .docx, .pdf hoặc ảnh chụp đề (.png, .jpg, .webp).');
  }
  const genuine = isDocx ? head.subarray(0, 4).equals(ZIP) : head.includes(PDF);
  if (!genuine) {
    return DomainError.validation('import.invalid_file',
      `Tệp này không phải tài liệu Word (.docx) hoặc PDF hợp lệ (nội dung không khớp đuôi ${isDocx ? '.docx' : '.pdf'}). `
        + 'Hãy mở tệp bằng Word rồi lưu lại dạng .docx hoặc xuất ra PDF, hoặc dán nội dung đề vào tab "Dán nội dung".');
  }
  return null;
}
