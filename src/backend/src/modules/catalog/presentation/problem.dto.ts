import { Difficulties, Languages, MAX_TAG_LENGTH, SuggestableSections, type BankScope, type Difficulty, type Language, type SuggestProblemSectionRequest } from '@oj/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../shared/presentation/pagination.dto.js';

export class ProblemListQuery extends PaginationQuery {
  @IsOptional() @IsIn(['mine', 'public', 'organization', 'all']) scope?: BankScope;
  /** `organization` scope: narrow to one of the viewer's organizations. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(Difficulties) difficulty?: Difficulty;
  /** One or more topics (`?tag=a&tag=b`): problems carrying all of them (OJ-20). */
  @IsOptional() @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(MAX_TAG_LENGTH, { each: true }) tag?: string[];
}

/** The bank scope whose tags are counted (OJ-20). */
export class ProblemTagsQuery {
  @IsOptional() @IsIn(['mine', 'public', 'organization', 'all']) scope?: BankScope;
  @IsOptional() @IsUUID() organizationId?: string;
}

export class UpsertProblemBody {
  @IsString() @MaxLength(200) title: string;
  @IsIn(Difficulties, { message: 'Mức độ khó không hợp lệ.' }) difficulty: Difficulty;
  /** A loose size guard only: the domain applies the 40-character limit after normalising, with a clear message. */
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(200, { each: true }) tags: string[];
  @IsString() @MaxLength(100_000) statement: string;
  @IsString() @MaxLength(20_000) inputFormat: string;
  @IsString() @MaxLength(20_000) outputFormat: string;
  @IsString() @MaxLength(20_000) constraints: string;
  @Type(() => Number) @IsInt() timeLimitMs: number;
  @Type(() => Number) @IsInt() memoryLimitMb: number;
}

export class UpsertTestCaseBody {
  @IsString() input: string;
  @IsString() expectedOutput: string;
  @IsBoolean() isSample: boolean;
  @Type(() => Number) @IsNumber() @Min(0) points: number;
}

export class CreateProblemBody extends UpsertProblemBody {
  @IsOptional() @IsArray() @ArrayMaxSize(200, { message: 'Tối đa 200 test.' })
  @ValidateNested({ each: true }) @Type(() => UpsertTestCaseBody)
  testCases?: UpsertTestCaseBody[];
}

export class SuggestTestCasesBody {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10, { message: 'Mỗi lần gợi ý tối đa 10 test.' }) count?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) focus?: string | null;
}

class DraftSampleBody {
  @IsString() @MaxLength(20_000) input: string;
  @IsString() @MaxLength(20_000) expectedOutput: string;
}

class DraftContentBody {
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(100_000) statement: string;
  @IsString() @MaxLength(20_000) inputFormat: string;
  @IsString() @MaxLength(20_000) outputFormat: string;
  @IsString() @MaxLength(20_000) constraints: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => DraftSampleBody)
  samples?: DraftSampleBody[];
}

export class SuggestSectionBody {
  @IsIn(SuggestableSections) section: SuggestProblemSectionRequest['section'];
  @ValidateNested() @Type(() => DraftContentBody) problem: DraftContentBody;
}

class DraftWithLimitsBody extends DraftContentBody {
  @IsOptional() @Type(() => Number) @IsInt() timeLimitMs?: number;
  @IsOptional() @Type(() => Number) @IsInt() memoryLimitMb?: number;
}

export class SuggestDraftTestsBody extends SuggestTestCasesBody {
  @ValidateNested() @Type(() => DraftWithLimitsBody) problem: DraftWithLimitsBody;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => DraftSampleBody) tests: DraftSampleBody[];
}

export class SharingBody {
  @IsBoolean() isPublic: boolean;
  @IsBoolean() publicTests: boolean;
  @IsBoolean() publicSolution: boolean;
  /** OJ-8: organizations of the owner that see the whole problem; each is checked against the actor's memberships. */
  // Required, not defaulted: a client that leaves it out must not silently remove all organization sharing.
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) organizationIds: string[];
}

export class UpsertSolutionBody {
  @IsString() @MaxLength(100_000) explanation: string;
  @ValidateIf((_, v) => v !== null) @IsIn(Languages) language: Language | null;
  @IsString() @MaxLength(100_000) code: string;
}
