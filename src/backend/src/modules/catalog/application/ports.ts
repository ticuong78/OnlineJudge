import type { Language, ProblemDraftContent, SuggestableSection, TestCaseSuggestionsDto } from '@oj/contracts';

/** What the suggester knows about a problem: the statement, its limits, the tests it already has and the solution. */
export interface TestSuggestionContext {
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  existingTests: { input: string; expectedOutput: string }[];
  solution: { language: Language | null; code: string; explanation: string } | null;
  count: number;
  focus: string | null;
}

/** Port: an AI that proposes extra test cases. Optional (needs an API key). */
export abstract class TestCaseSuggester {
  abstract get available(): boolean;
  abstract suggest(context: TestSuggestionContext): Promise<TestCaseSuggestionsDto>;
}

/** A rewritable section: the four text sections and the title (OJ-22). */
export type TextSection = SuggestableSection;

/** Port: an AI that rewrites one text section of a problem from the rest of it. Optional (needs an API key). */
export abstract class ProblemSectionWriter {
  abstract get available(): boolean;
  abstract write(section: TextSection, problem: ProblemDraftContent): Promise<{ text: string; notes: string[] }>;
}
