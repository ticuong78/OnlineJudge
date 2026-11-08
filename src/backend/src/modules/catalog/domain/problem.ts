import { Difficulties, fileIoFields, fileIoMessage, Languages, type Difficulty, type Language } from '@oj/contracts';
import { AggregateRoot, newId, type DomainEvent } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';
import { isOrgMember, type Actor } from '../../../shared/application/actor.js';
import { PROBLEM_DELETED, type ProblemDeletedEvent } from '../catalog.events.js';

const MAX_TEST_CASES = 200;
const MAX_TEST_DATA_BYTES = 8 * 1024 * 1024;

// ---------- Value objects ----------

export class ResourceLimits {
  private constructor(
    readonly timeLimitMs: number,
    readonly memoryLimitMb: number,
  ) {}

  static of(timeLimitMs: number, memoryLimitMb: number): ResourceLimits {
    assert(Number.isInteger(timeLimitMs) && timeLimitMs >= 100 && timeLimitMs <= 15_000,
      'catalog.invalid_time_limit', 'Giới hạn thời gian phải từ 100ms đến 15000ms.');
    assert(Number.isInteger(memoryLimitMb) && memoryLimitMb >= 16 && memoryLimitMb <= 1024,
      'catalog.invalid_memory_limit', 'Giới hạn bộ nhớ phải từ 16MB đến 1024MB.');
    return new ResourceLimits(timeLimitMs, memoryLimitMb);
  }

  static readonly default = new ResourceLimits(1000, 256);
}

export interface ProblemContent {
  title: string;
  difficulty: Difficulty;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
}

function validContent(content: ProblemContent): ProblemContent {
  const title = content.title.trim();
  assert(title.length >= 1 && title.length <= 200, 'catalog.invalid_title', 'Tên bài phải từ 1 đến 200 ký tự.');
  assert(Difficulties.includes(content.difficulty), 'catalog.invalid_difficulty', 'Mức độ khó không hợp lệ.');
  const tags = [...new Set(content.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  assert(tags.length <= 20, 'catalog.too_many_tags', 'Tối đa 20 thẻ.');
  // Programs are judged on standard input/output only.
  const fileFields = fileIoFields(content);
  assert(!fileFields.length, 'catalog.file_io', fileIoMessage(fileFields));
  return { ...content, title, tags };
}

export class Solution {
  private constructor(
    readonly explanation: string,
    readonly language: Language | null,
    readonly code: string,
  ) {}

  static of(explanation: string, language: Language | null, code: string): Solution {
    assert(explanation.trim() || code.trim(), 'catalog.empty_solution', 'Đáp án cần có lời giải thích hoặc mã nguồn.');
    assert(language === null || Languages.includes(language), 'catalog.invalid_language', 'Ngôn ngữ không hợp lệ.');
    return new Solution(explanation, language, code);
  }
}

// ---------- Entity inside the aggregate ----------

export interface TestCaseData {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

export class TestCase {
  constructor(
    readonly id: string,
    public data: TestCaseData,
    public order: number,
  ) {}

  static validate(data: TestCaseData): TestCaseData {
    assert(Number.isFinite(data.points) && data.points >= 0 && data.points <= 1000,
      'catalog.invalid_points', 'Điểm của test phải từ 0 đến 1000.');
    assert(Buffer.byteLength(data.input) + Buffer.byteLength(data.expectedOutput) <= MAX_TEST_DATA_BYTES,
      'catalog.test_too_large', 'Dữ liệu một test không được vượt quá 8MB.');
    return data;
  }
}

/**
 * How much of a blueprint is visible outside its owner's bank.
 * Hidden tests and the solution can only be shared together with the statement.
 */
export const MAX_SHARED_ORGANIZATIONS = 20;

/**
 * Public sharing (statement, then optionally hidden tests and the solution) and sharing with organizations (OJ-8):
 * teachers of `organizationIds` see the whole problem. The two are independent.
 */
export class Sharing {
  private constructor(
    readonly isPublic: boolean,
    readonly publicTests: boolean,
    readonly publicSolution: boolean,
    readonly organizationIds: readonly string[],
  ) {}

  static of(isPublic: boolean, publicTests: boolean, publicSolution: boolean, organizationIds: readonly string[] = []): Sharing {
    assert(isPublic || (!publicTests && !publicSolution), 'catalog.invalid_sharing',
      'Chỉ có thể chia sẻ test hoặc lời giải khi đề bài đã công khai.');
    const orgs = [...new Set(organizationIds)];
    assert(orgs.length <= MAX_SHARED_ORGANIZATIONS, 'catalog.too_many_organizations',
      `Chỉ chia sẻ được với tối đa ${MAX_SHARED_ORGANIZATIONS} tổ chức.`);
    return new Sharing(isPublic, publicTests, publicSolution, orgs);
  }

  static readonly private = new Sharing(false, false, false, []);

  withoutOrganization(organizationId: string): Sharing {
    return new Sharing(this.isPublic, this.publicTests, this.publicSolution, this.organizationIds.filter((id) => id !== organizationId));
  }
}

export interface Owner {
  id: string;
  name: string;
}

export interface SourceRef {
  id: string;
  code: string;
  ownerName: string;
}

// ---------- Events ----------

export class ProblemDeleted implements DomainEvent, ProblemDeletedEvent {
  readonly name = PROBLEM_DELETED;
  readonly occurredAt = new Date();
  constructor(readonly problemId: string) {}
}

// ---------- Aggregate root ----------

/** Human-friendly problem code derived from the sequence number, e.g. P0007. */
export const formatProblemCode = (seq: number) => `P${String(seq).padStart(4, '0')}`;

export interface ProblemState {
  seq: number;
  owner: Owner;
  sharing: Sharing;
  copiedFrom: SourceRef | null;
  content: ProblemContent;
  limits: ResourceLimits;
  testCases: TestCase[];
  solution: Solution | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Problem blueprint in a teacher's bank: statement, limits, test cases and the official solution.
 * Nobody submits to a blueprint; sessions take a frozen snapshot of it.
 * Test cases can only be changed through the root so invariants (count, size, order) hold.
 */
export class Problem extends AggregateRoot {
  private constructor(id: string, private state: ProblemState) {
    super(id);
  }

  static create(seq: number, owner: Owner, content: ProblemContent, limits: ResourceLimits): Problem {
    const now = new Date();
    return new Problem(newId(), {
      seq,
      owner,
      sharing: Sharing.private,
      copiedFrom: null,
      content: validContent(content),
      limits,
      testCases: [],
      solution: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(id: string, state: ProblemState): Problem {
    return new Problem(id, state);
  }

  get code(): string {
    return formatProblemCode(this.state.seq);
  }
  get seq() { return this.state.seq; }
  get owner() { return this.state.owner; }
  get sharing() { return this.state.sharing; }
  get copiedFrom() { return this.state.copiedFrom; }
  get content(): Readonly<ProblemContent> { return this.state.content; }
  get limits() { return this.state.limits; }
  get testCases(): readonly TestCase[] { return this.state.testCases; }
  get solution() { return this.state.solution; }
  get createdAt() { return this.state.createdAt; }
  get updatedAt() { return this.state.updatedAt; }

  get totalPoints(): number {
    return this.state.testCases.reduce((sum, t) => sum + t.data.points, 0);
  }

  // ---------- Access rules ----------

  isOwnedBy(actor: Actor): boolean {
    return this.state.owner.id === actor.id;
  }

  canEdit(actor: Actor): boolean {
    return this.isOwnedBy(actor) || actor.role === 'ADMIN';
  }

  /** Teachers of an organization the problem is shared with (OJ-8). Students are never members. */
  isSharedWith(actor: Actor): boolean {
    return actor.role === 'TEACHER' && this.state.sharing.organizationIds.some((id) => isOrgMember(actor, id));
  }

  /** Staff can browse public blueprints and those shared with their organizations; students never see blueprints. */
  canView(actor: Actor): boolean {
    return this.canEdit(actor) || (this.state.sharing.isPublic && actor.role !== 'STUDENT') || this.isSharedWith(actor);
  }

  /** Organization colleagues see the whole problem; others only what is shared publicly. */
  canSeeHiddenTests(actor: Actor): boolean {
    return this.canEdit(actor) || this.isSharedWith(actor) || (this.canView(actor) && this.state.sharing.publicTests);
  }

  canSeeSolution(actor: Actor): boolean {
    return this.canEdit(actor) || this.isSharedWith(actor) || (this.canView(actor) && this.state.sharing.publicSolution);
  }

  ensureEditableBy(actor: Actor): void {
    if (!this.canEdit(actor)) {
      throw DomainError.forbidden('catalog.not_owner', 'Chỉ giáo viên sở hữu bài này hoặc quản trị viên được chỉnh sửa.');
    }
  }

  ensureViewableBy(actor: Actor): void {
    if (!this.canView(actor)) throw DomainError.notFound('catalog.problem_not_found', 'Không tìm thấy bài tập.');
  }

  // ---------- Behaviour ----------

  share(sharing: Sharing): void {
    this.state.sharing = sharing;
    this.touch();
  }

  /**
   * A private copy in `owner`'s bank. Only what the source shares is copied:
   * samples always, hidden tests if shared, the solution if shared.
   */
  copyFor(actor: Actor, seq: number): Problem {
    if (!this.canView(actor)) throw DomainError.notFound('catalog.problem_not_found', 'Không tìm thấy bài tập.');
    const withTests = this.canSeeHiddenTests(actor);
    const copy = Problem.create(seq, { id: actor.id, name: actor.name }, { ...this.state.content }, this.state.limits);
    copy.state.copiedFrom = { id: this.id, code: this.code, ownerName: this.state.owner.name };
    for (const t of this.state.testCases) {
      if (withTests || t.data.isSample) copy.addTestCase({ ...t.data });
    }
    if (this.canSeeSolution(actor)) copy.state.solution = this.state.solution;
    return copy;
  }

  update(content: ProblemContent, limits: ResourceLimits): void {
    this.state.content = validContent(content);
    this.state.limits = limits;
    this.touch();
  }

  addTestCase(data: TestCaseData): TestCase {
    assert(this.state.testCases.length < MAX_TEST_CASES, 'catalog.too_many_tests', `Tối đa ${MAX_TEST_CASES} test mỗi bài.`);
    const testCase = new TestCase(newId(), TestCase.validate(data), this.state.testCases.length + 1);
    this.state.testCases.push(testCase);
    this.touch();
    return testCase;
  }

  updateTestCase(testCaseId: string, data: TestCaseData): TestCase {
    const testCase = this.findTestCase(testCaseId);
    testCase.data = TestCase.validate(data);
    this.touch();
    return testCase;
  }

  removeTestCase(testCaseId: string): void {
    this.findTestCase(testCaseId);
    this.state.testCases = this.state.testCases.filter((t) => t.id !== testCaseId);
    this.state.testCases.forEach((t, i) => (t.order = i + 1));
    this.touch();
  }

  setSolution(solution: Solution | null): void {
    this.state.solution = solution;
    this.touch();
  }

  /** A problem can only be given to students once it has at least one test case. */
  ensureJudgeable(): void {
    if (this.state.testCases.length === 0) {
      throw DomainError.validation('catalog.no_tests', `Bài ${this.code} chưa có test, chưa thể giao cho học sinh.`);
    }
  }

  markDeleted(): void {
    this.record(new ProblemDeleted(this.id));
  }

  private findTestCase(id: string): TestCase {
    const testCase = this.state.testCases.find((t) => t.id === id);
    if (!testCase) throw DomainError.notFound('catalog.test_not_found', 'Không tìm thấy test.');
    return testCase;
  }

  private touch() {
    this.state.updatedAt = new Date();
  }
}
