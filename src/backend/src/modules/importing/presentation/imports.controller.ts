import { Body, Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Difficulties, type Difficulty } from '@oj/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DomainError } from '../../../shared/domain/domain-error.js';
import type { Actor } from '../../../shared/application/actor.js';
import { CurrentActor, Roles } from '../../../shared/presentation/decorators.js';
import { ImportService } from '../application/import.service.js';

// Test data is not limited here: tests added by hand have no request limit either (catalog/presentation/problem.dto.ts,
// UpsertTestCaseBody); the catalog domain caps each test (8 MB), and test data never goes through the text checks.
class TestBody {
  @IsString() input: string;
  @IsString() expectedOutput: string;
  @IsBoolean() isSample: boolean;
  @Type(() => Number) @IsNumber() @Min(0) points: number;
}

// The same text limits as a problem typed by hand (problem.dto.ts): confirmed drafts become problems, and their text
// goes through the same checks (file-I/O detection), which must not be fed megabytes (OJ-15 F4).
class DraftBody {
  @IsString() @MaxLength(200) title: string;
  @IsIn(Difficulties) difficulty: Difficulty;
  @IsString() @MaxLength(100_000) statement: string;
  @IsString() @MaxLength(20_000) inputFormat: string;
  @IsString() @MaxLength(20_000) outputFormat: string;
  @IsString() @MaxLength(20_000) constraints: string;
  @IsInt() timeLimitMs: number;
  @IsInt() memoryLimitMb: number;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TestBody) tests: TestBody[];
  @IsArray() @IsString({ each: true }) warnings: string[];
}

class ParseTextBody {
  @IsString() @MaxLength(100_000, { message: 'Nội dung dài quá 100.000 ký tự. Hãy chia thành nhiều lần.' }) text: string;
}

class ConfirmBody {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DraftBody)
  drafts: DraftBody[];
}

@Controller('imports')
@Roles('ADMIN', 'TEACHER')
export class ImportsController {
  constructor(private readonly imports: ImportService) {}

  @Post('parse') @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  parse(@CurrentActor() actor: Actor, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw DomainError.validation('import.no_file', 'Vui lòng chọn tệp .docx hoặc .pdf.');
    // Multer decodes the multipart filename as latin1; restore UTF-8 (Vietnamese names).
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.imports.parse(actor, { originalName, mimeType: file.mimetype, buffer: file.buffer });
  }

  /** Same as `parse`, for exam text pasted by the teacher. */
  @Post('parse-text') @HttpCode(200)
  parseText(@CurrentActor() actor: Actor, @Body() body: ParseTextBody) {
    return this.imports.parseText(actor, body.text);
  }

  @Post('confirm')
  confirm(@CurrentActor() actor: Actor, @Body() body: ConfirmBody) {
    return this.imports.confirm(actor, body.drafts);
  }
}
