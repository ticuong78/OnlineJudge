import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Injectable, Logger } from '@nestjs/common';
import type { ProblemDraftDto } from '@oj/contracts';
import { z } from 'zod';
import { ClaudeClient } from '../../../shared/infrastructure/claude.js';
import { SmartExamReader, type UploadedFile } from '../application/ports.js';
import { documentText, type ExamDocument } from '../domain/exam-document.js';
import { SAMPLE_POINTS } from '../domain/exam-parser.js';
import { imageMediaType } from '../domain/document-file.js';

const DraftsSchema = z.object({
  problems: z.array(
    z.object({
      title: z.string(),
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
      difficultyStated: z.boolean(),
      statement: z.string(),
      inputFormat: z.string(),
      outputFormat: z.string(),
      constraints: z.string(),
      timeLimitMs: z.number(),
      timeLimitStated: z.boolean(),
      memoryLimitMb: z.number(),
      samples: z.array(z.object({ input: z.string(), expectedOutput: z.string() })),
      notes: z.array(z.string()),
    }),
  ),
});

const SYSTEM = `Bạn đọc đề thi lập trình (thường bằng tiếng Việt) và tách thành từng bài tập riêng.
Với mỗi bài:
- title: tên bài, bỏ số thứ tự "Bài 1", số điểm và tên file.
- statement, inputFormat, outputFormat, constraints: giữ nguyên nội dung gốc, viết bằng Markdown; công thức viết dạng LaTeX $...$.
  Kể cả khi đề yêu cầu đọc/ghi file (BAI1.INP, BAI1.OUT...), vẫn chép đúng câu chữ của đề; giáo viên sẽ tự chọn cách sửa.
  Nếu đề không tách riêng phần nào thì để chuỗi rỗng, không tự bịa.
- samples: các ví dụ vào/ra, giữ nguyên từng dòng và khoảng trắng; mỗi chuỗi kết thúc bằng một ký tự xuống dòng.
- timeLimitMs / memoryLimitMb: theo đề (giây → ms). Nếu đề không ghi thì dùng 1000 và 256, và đặt timeLimitStated = false.
- difficulty: theo đề nếu có ghi (difficultyStated = true); nếu không thì tự ước lượng và đặt difficultyStated = false.
- notes: những điểm giáo viên nên kiểm tra lại (hình vẽ không đọc được, ví dụ bị thiếu, chỗ mờ...), bằng tiếng Việt, ngắn gọn.
  Không ghi chú gì về việc đọc/ghi file.
Bỏ qua phần đầu đề (tên kỳ thi, thời gian làm bài cả đề, bảng tổng hợp tên file).
Bỏ hẳn, không chép vào bất kỳ trường nào và không nhắc tới trong notes:
- mọi đường dẫn ra ngoài và câu chỉ để dẫn tới nơi khác (ví dụ "Link problem : https://leetcode.com/...", "Nguồn: Codeforces", "Xem lời giải tại...");
- lời mời tham gia nhóm, kênh, trang (Zalo, Facebook, Telegram, Discord...), quảng cáo, số điện thoại liên hệ;
- nội dung tuyên truyền tư tưởng lệch lạc, kích động, hoặc kêu gọi hành vi vi phạm pháp luật.
Chỉ giữ phần thuộc về bài tập: câu chuyện của đề, yêu cầu, dữ liệu vào/ra, ràng buộc, ví dụ.`;

/** Claude reads the original document: PDF as a document block (layout and scans included), DOCX as extracted text. */
@Injectable()
export class ClaudeExamReader extends SmartExamReader {
  private readonly logger = new Logger(ClaudeExamReader.name);

  constructor(private readonly claude: ClaudeClient) {
    super();
  }

  get available(): boolean {
    return this.claude.enabled;
  }

  async read(file: UploadedFile, extracted: ExamDocument | null): Promise<ProblemDraftDto[]> {
    const isPdf = file.originalName.toLowerCase().endsWith('.pdf');
    // A photo of a problem (OJ-23) is sent as an image; the system prompt's rules apply to what is in it.
    const image = imageMediaType(file.originalName);
    const source: Anthropic.Beta.BetaContentBlockParam = image
      ? { type: 'image', source: { type: 'base64', media_type: image, data: file.buffer.toString('base64') } }
      : isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } }
      : { type: 'text', text: `Nội dung đề (trích từ file Word hoặc do giáo viên dán vào, bảng ghi dạng "ô | ô"; số mũ ghi dạng 10^6 hoặc 10^{18}, chỉ số dưới dạng a_i, công thức Word đã đổi sang dạng chữ như (a+b)/2, sqrt(n); đó là đúng nội dung gốc, không cần ghi chú kiểm tra):\n\n${extracted ? documentText(extracted) : ''}` };

    const response = await this.claude.api!.beta.messages.parse({
      ...ClaudeClient.target(this.claude.models.examReader),
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: betaZodOutputFormat(DraftsSchema) },
      messages: [{ role: 'user', content: [source, { type: 'text', text: image ? 'Ảnh trên là ảnh chụp đề. Đọc kỹ chữ trong ảnh rồi tách thành các bài tập; chỗ nào mờ, không chắc thì ghi vào notes.' : 'Tách đề trên thành các bài tập.' }] }],
    });

    if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this document');
    if (response.stop_reason === 'max_tokens') throw new Error('Exam too long for one AI read');
    const parsed = response.parsed_output;
    if (!parsed || !parsed.problems.length) throw new Error('AI returned no problems');
    this.logger.log(`AI read ${parsed.problems.length} problems from ${file.originalName}`);

    return parsed.problems.map((p) => ({
      title: p.title.trim() || 'Bài chưa đặt tên',
      difficulty: p.difficulty,
      statement: p.statement,
      inputFormat: p.inputFormat,
      outputFormat: p.outputFormat,
      constraints: p.constraints,
      timeLimitMs: clamp(Math.round(p.timeLimitMs), 100, 15_000),
      memoryLimitMb: clamp(Math.round(p.memoryLimitMb), 16, 1024),
      tests: p.samples.filter((s) => s.input.trim() || s.expectedOutput.trim()).map((s) => ({
        input: withNewline(s.input),
        expectedOutput: withNewline(s.expectedOutput),
        isSample: true,
        points: SAMPLE_POINTS,
      })),
      warnings: [
        ...(p.difficultyStated ? [] : ['Đề không ghi độ khó — AI đã ước lượng, hãy kiểm tra lại.']),
        ...(p.timeLimitStated ? [] : ['Không thấy giới hạn thời gian — mặc định 1 giây.']),
        ...(p.samples.length ? [] : ['Không tìm thấy ví dụ (test mẫu).']),
        ...p.notes,
      ],
    }));
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const withNewline = (s: string) => (s.endsWith('\n') ? s : `${s}\n`);
