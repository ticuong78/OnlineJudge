import { Injectable, Logger } from '@nestjs/common';
import { fileIoFields, fileIoMessage, isAboutFileIo, type ImportProblemsResponse, type ParsedExamDto, type ProblemDraftDto } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { AiAccess } from '../../../shared/application/ai-access.js';
import { assert } from '../../../shared/domain/domain-error.js';
import { documentFileProblem } from '../domain/document-file.js';
import { documentText, type ExamDocument } from '../domain/exam-document.js';
import { ExamParser } from '../domain/exam-parser.js';
import { stripExternalLinks } from '../../../shared/domain/external-links.js';
import { DocumentReader, ProblemCatalogGateway, SmartExamReader, type UploadedFile } from './ports.js';

const PASTED = 'Nội dung đã dán';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly parser = new ExamParser();

  constructor(
    private readonly reader: DocumentReader,
    private readonly smartReader: SmartExamReader,
    private readonly catalog: ProblemCatalogGateway,
    private readonly ai: AiAccess,
  ) {}

  /**
   * Step 1: read + split into drafts. Stateless; nothing is persisted until the teacher confirms.
   * The AI reader is tried first when available and the account may use AI (administrators and VIP teachers);
   * the rule-based parser is the fallback.
   */
  async parse(actor: Actor, file: UploadedFile): Promise<ParsedExamDto> {
    const problem = documentFileProblem(file);
    if (problem) throw problem;
    // The text layer may be empty (scanned PDF); that only matters if the AI reader is not used.
    const doc: ExamDocument | null = await this.reader.read(file).catch(() => null);
    return this.extract(actor, file, doc);
  }

  /** Step 1 for text pasted by the teacher instead of a file: same reading, same drafts. */
  async parseText(actor: Actor, text: string): Promise<ParsedExamDto> {
    const value = text.replace(/\r\n?/g, '\n').trim();
    assert(value, 'import.empty_text', 'Hãy dán nội dung đề vào ô trước.');
    const doc: ExamDocument = {
      fileName: PASTED,
      blocks: value.split('\n').filter((line) => line.trim()).map((line) => ({ kind: 'paragraph', text: line })),
    };
    return this.extract(actor, { originalName: PASTED, mimeType: 'text/plain', buffer: Buffer.from(value) }, doc);
  }

  private async extract(actor: Actor, file: UploadedFile, doc: ExamDocument | null): Promise<ParsedExamDto> {
    const rawText = doc ? documentText(doc) : '';
    const aiAllowed = await this.ai.allows(actor.id);

    if (aiAllowed && this.smartReader.available) {
      try {
        const drafts = await this.smartReader.read(file, doc);
        return { fileName: file.originalName, parser: 'AI', drafts: drafts.map(cleanDraft), rawText };
      } catch (error) {
        this.logger.warn(`AI reader failed for ${file.originalName}, using the rule-based parser: ${(error as Error).message}`);
      }
    }

    assert(doc && rawText.trim().length > 0, 'import.empty_document',
      'Không đọc được chữ trong tài liệu (có thể là PDF dạng ảnh scan). '
        + (aiAllowed ? 'Đọc đề bằng AI sẽ xử lý được loại tệp này.' : 'Tài khoản giáo viên VIP có thể đọc loại tệp này bằng AI.'));
    return { fileName: file.originalName, parser: 'BASIC', drafts: this.parser.parse(doc).map(cleanDraft), rawText };
  }

  /** Step 2: create problems from the reviewed drafts; samples become sample test cases. */
  async confirm(actor: Actor, drafts: ProblemDraftDto[]): Promise<ImportProblemsResponse> {
    assert(drafts.length > 0 && drafts.length <= 50, 'import.invalid_count', 'Số bài nhập phải từ 1 đến 50.');
    // Checked for every draft first, so a refused draft does not leave the ones before it half-imported.
    drafts.forEach((draft, i) => {
      const fields = fileIoFields(draft);
      assert(!fields.length, 'import.file_io', `Bài ${i + 1} (${draft.title.trim() || 'chưa đặt tên'}): ${fileIoMessage(fields)}`);
    });
    const problemIds: string[] = [];
    for (const draft of drafts) {
      problemIds.push(
        await this.catalog.createProblem(
          actor,
          {
            title: draft.title,
            difficulty: draft.difficulty,
            tags: [],
            statement: draft.statement,
            inputFormat: draft.inputFormat,
            outputFormat: draft.outputFormat,
            constraints: draft.constraints,
            timeLimitMs: draft.timeLimitMs,
            memoryLimitMb: draft.memoryLimitMb,
          },
          draft.tests,
        ),
      );
    }
    return { problemIds };
  }
}

/**
 * What every read draft goes through, whichever reader produced it:
 * - links to other places (the original problem elsewhere, group invitations...) are removed from the text;
 * - the teacher's file wording is kept (the review screen offers the standard-I/O rewrite and refuses file
 *   wording), so hints about files would only repeat that, and hints about links point at removed text: both go.
 */
function cleanDraft(draft: ProblemDraftDto): ProblemDraftDto {
  const strip = (text: string) => stripExternalLinks(text).text;
  return {
    ...draft,
    statement: strip(draft.statement),
    inputFormat: strip(draft.inputFormat),
    outputFormat: strip(draft.outputFormat),
    constraints: strip(draft.constraints),
    warnings: draft.warnings.filter((w) => !isAboutFileIo(w) && !LINK_HINT.test(w)),
  };
}

const LINK_HINT = /https?:\/\/|www\.|đường dẫn|liên kết|\blinks?\b|\burl\b/i;
