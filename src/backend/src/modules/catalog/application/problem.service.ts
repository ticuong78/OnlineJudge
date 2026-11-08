import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { hasFileIo, ioSideOf, toStandardIo } from '@oj/contracts';
import type {
  Paginated,
  ProblemSectionSuggestionDto,
  ProblemDetailDto,
  ProblemSummaryDto,
  SharingDto,
  SolutionDto,
  SuggestDraftTestsRequest,
  SuggestProblemSectionRequest,
  SuggestTestCasesRequest,
  TestCaseDto,
  TestCaseSuggestionsDto,
  UpsertProblemRequest,
  UpsertSolutionRequest,
  UpsertTestCaseRequest,
} from '@oj/contracts';
import { isOrgMember, type Actor } from '../../../shared/application/actor.js';
import { MEMBER_LEFT_ORGANIZATION, type MemberLeftOrganizationEvent } from '../../identity/identity.events.js';
import { AiAccess, aiRequiresVip } from '../../../shared/application/ai-access.js';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { stripExternalLinks } from '../../../shared/domain/external-links.js';
import { Problem, ResourceLimits, Sharing, Solution } from '../domain/problem.js';
import { ProblemQueries, ProblemRepository, type ProblemListFilter } from '../domain/problem.repository.js';
import { toDetailDto, toSummaryDto, toTestCaseDto } from './problem.mapper.js';
import { ProblemSectionWriter, TestCaseSuggester, type TestSuggestionContext } from './ports.js';
import { UnshareChecks } from './unshare-checks.js';

/** Application service for problem blueprints in teachers' banks. */
@Injectable()
export class ProblemService {
  private readonly logger = new Logger(ProblemService.name);

  constructor(
    private readonly problems: ProblemRepository,
    private readonly queries: ProblemQueries,
    private readonly events: EventPublisher,
    private readonly suggester: TestCaseSuggester,
    private readonly writer: ProblemSectionWriter,
    private readonly ai: AiAccess,
    private readonly unshareChecks: UnshareChecks,
  ) {}

  // ---------- Queries ----------

  async list(
    actor: Actor,
    filter: Omit<ProblemListFilter, 'viewerId' | 'organizationIds'> & { organizationId?: string },
  ): Promise<Paginated<ProblemSummaryDto>> {
    if (filter.scope === 'all' && actor.role !== 'ADMIN') {
      throw DomainError.forbidden('catalog.scope_all', 'Chỉ quản trị viên được xem toàn bộ ngân hàng.');
    }
    const { organizationId, ...rest } = filter;
    // Organization scope: only the viewer's own organizations (students have none), optionally one of them.
    const mine = actor.role === 'TEACHER' ? (actor.organizations ?? []).map((o) => o.id) : [];
    const organizationIds = organizationId ? mine.filter((id) => id === organizationId) : mine;
    const { rows, total } = await this.queries.list({ ...rest, viewerId: actor.id, organizationIds });
    return { items: rows.map(toSummaryDto), total, page: filter.page, pageSize: filter.pageSize };
  }

  async get(actor: Actor, id: string): Promise<ProblemDetailDto> {
    const problem = await this.load(id);
    problem.ensureViewableBy(actor);
    return toDetailDto(problem, actor);
  }

  // ---------- Commands ----------

  /** A new problem, optionally with its whole test list (examples are tests marked `isSample`). */
  async create(actor: Actor, input: UpsertProblemRequest, tests: UpsertTestCaseRequest[] = []): Promise<ProblemDetailDto> {
    const problem = await this.newProblem(actor, input, tests);
    return toDetailDto(problem, actor);
  }

  /** Same as `create`, for the importer. */
  async createWithTests(actor: Actor, input: UpsertProblemRequest, tests: UpsertTestCaseRequest[]): Promise<string> {
    return (await this.newProblem(actor, input, tests)).id;
  }

  private async newProblem(actor: Actor, input: UpsertProblemRequest, tests: UpsertTestCaseRequest[]): Promise<Problem> {
    const problem = Problem.create(await this.problems.nextSeq(), owner(actor), input, limitsOf(input));
    tests.forEach((t) => problem.addTestCase(t));
    await this.problems.save(problem);
    return problem;
  }

  async update(actor: Actor, id: string, input: UpsertProblemRequest): Promise<ProblemDetailDto> {
    const problem = await this.loadEditable(actor, id);
    problem.update(input, limitsOf(input));
    await this.problems.save(problem);
    return toDetailDto(problem, actor);
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const problem = await this.loadEditable(actor, id);
    problem.markDeleted();
    await this.problems.delete(id);
    await this.events.publish(problem.pullEvents());
  }

  async share(actor: Actor, id: string, input: SharingDto): Promise<ProblemDetailDto> {
    const problem = await this.loadEditable(actor, id);
    const organizationIds = [...new Set(input.organizationIds ?? [])];
    // A teacher shares only with organizations they belong to; organizations already chosen stay allowed for the
    // administrator, who edits on the owner's behalf.
    const allowed = (orgId: string) => isOrgMember(actor, orgId) || (actor.role === 'ADMIN' && problem.sharing.organizationIds.includes(orgId));
    if (organizationIds.some((orgId) => !allowed(orgId))) {
      throw DomainError.forbidden('catalog.not_in_organization', 'Bạn chỉ chia sẻ được với tổ chức mà bạn là thành viên.');
    }
    const sharing = Sharing.of(input.isPublic, input.publicTests, input.publicSolution, organizationIds);
    // Making the statement private is refused while something else relies on it being public (a public set).
    if (problem.sharing.isPublic && !sharing.isPublic) {
      const reason = await this.unshareChecks.reasonToStayPublic(problem.id);
      if (reason) throw DomainError.conflict('catalog.still_shared', reason);
    }
    problem.share(sharing);
    await this.problems.save(problem);
    return toDetailDto(problem, actor);
  }

  /**
   * A teacher left an organization (OJ-8): they keep their problems, which stop being shared with it, and the
   * organization keeps a copy of each in its successor org admin's bank ("copied from" the original).
   */
  @OnEvent(MEMBER_LEFT_ORGANIZATION, { async: true, promisify: true })
  async onMemberLeftOrganization(event: MemberLeftOrganizationEvent): Promise<void> {
    const shared = await this.problems.findByOwnerSharedWith(event.userId, event.organizationId);
    // The successor sees the problem through the organization while it is still shared, so the copy is complete.
    const successor: Actor = {
      id: event.successorId,
      role: 'TEACHER',
      name: event.successorName,
      organizations: [{ id: event.organizationId, role: 'ADMIN' }],
    };
    for (const problem of shared) {
      const copy = problem.copyFor(successor, await this.problems.nextSeq());
      await this.problems.save(copy);
      problem.share(problem.sharing.withoutOrganization(event.organizationId));
      await this.problems.save(problem);
    }
    if (shared.length) this.logger.log(`${shared.length} problem(s) copied for organization ${event.organizationId}`);
  }

  async copy(actor: Actor, id: string): Promise<ProblemDetailDto> {
    const copy = await this.copyToBank(actor, id);
    return toDetailDto(copy, actor);
  }

  /** Copies a viewable problem into the actor's bank. */
  async copyToBank(actor: Actor, id: string): Promise<Problem> {
    return (await this.copyManyToBank(actor, [id]))[0];
  }

  /**
   * Copies several problems (a set) into the actor's bank, in order. All or nothing: every problem is checked
   * first, so one the actor may not see does not leave the ones before it as stray copies.
   */
  async copyManyToBank(actor: Actor, ids: string[]): Promise<Problem[]> {
    const sources: Problem[] = [];
    for (const id of ids) {
      const source = await this.problems.findById(id);
      if (!source || !source.canView(actor)) {
        throw ids.length > 1
          ? DomainError.notFound('catalog.problem_not_shared', `Đề có bài ${source?.code ?? 'đã bị xóa'} chưa công khai nên chưa lưu được đề này.`)
          : DomainError.notFound('catalog.problem_not_found', 'Không tìm thấy bài tập.');
      }
      sources.push(source);
    }
    const copies: Problem[] = [];
    for (const source of sources) {
      const copy = source.copyFor(actor, await this.problems.nextSeq());
      await this.problems.save(copy);
      copies.push(copy);
    }
    return copies;
  }

  async addTestCase(actor: Actor, problemId: string, input: UpsertTestCaseRequest): Promise<TestCaseDto> {
    const problem = await this.loadEditable(actor, problemId);
    const testCase = problem.addTestCase(input);
    await this.problems.save(problem);
    return toTestCaseDto(testCase);
  }

  async updateTestCase(actor: Actor, problemId: string, testCaseId: string, input: UpsertTestCaseRequest): Promise<TestCaseDto> {
    const problem = await this.loadEditable(actor, problemId);
    const testCase = problem.updateTestCase(testCaseId, input);
    await this.problems.save(problem);
    return toTestCaseDto(testCase);
  }

  async removeTestCase(actor: Actor, problemId: string, testCaseId: string): Promise<void> {
    const problem = await this.loadEditable(actor, problemId);
    problem.removeTestCase(testCaseId);
    await this.problems.save(problem);
  }

  /** AI-proposed tests for a saved problem (its solution helps); nothing is saved. */
  async suggestTestCases(actor: Actor, problemId: string, input: SuggestTestCasesRequest): Promise<TestCaseSuggestionsDto> {
    const problem = await this.loadEditable(actor, problemId);
    await this.ai.ensureAllowed(actor);
    const { content, limits, solution } = problem;
    return this.suggestTests(
      { ...content, ...limits, solution: solution && { language: solution.language, code: solution.code, explanation: solution.explanation } },
      problem.testCases.map((t) => ({ input: t.data.input, expectedOutput: t.data.expectedOutput })),
      input,
    );
  }

  /** AI-proposed tests for a problem still being written (creating, importing); nothing is saved. */
  async suggestDraftTests(actor: Actor, input: SuggestDraftTestsRequest): Promise<TestCaseSuggestionsDto> {
    await this.ai.ensureAllowed(actor);
    const { timeLimitMs, memoryLimitMb, ...content } = input.problem;
    const limits = ResourceLimits.default;
    return this.suggestTests(
      { ...content, timeLimitMs: timeLimitMs ?? limits.timeLimitMs, memoryLimitMb: memoryLimitMb ?? limits.memoryLimitMb, solution: null },
      input.tests,
      input,
    );
  }

  private async suggestTests(
    problem: Omit<TestSuggestionContext, 'existingTests' | 'count' | 'focus'>,
    existing: { input: string; expectedOutput: string }[],
    input: SuggestTestCasesRequest,
  ): Promise<TestCaseSuggestionsDto> {
    if (!this.suggester.available) {
      throw DomainError.validation('catalog.ai_unavailable', 'Máy chủ chưa cấu hình AI nên chưa gợi ý test được.');
    }
    let result: TestCaseSuggestionsDto;
    try {
      result = await this.suggester.suggest({
        ...problem,
        existingTests: existing.slice(0, MAX_SHOWN_TESTS),
        count: input.count ?? 5,
        focus: input.focus?.trim() || null,
      });
    } catch (error) {
      this.logger.warn(`Test suggestions failed for "${problem.title}": ${(error as Error).message}`);
      throw DomainError.validation('catalog.ai_failed', 'AI chưa gợi ý được test lúc này. Hãy thử lại sau ít phút.');
    }
    // Drop suggestions whose input the problem (or an earlier suggestion) already has.
    const seen = new Set(existing.map((t) => sameInput(t.input)));
    const suggestions = result.suggestions.filter((s) => {
      const key = sameInput(s.input);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...result, suggestions };
  }

  /**
   * AI rewrite of one text section of a problem being written (possibly not saved yet); nothing is saved.
   * Text sections never come back with file input/output; without an API key (or for a regular, non-VIP teacher
   * account) only that rule-based rewrite is offered.
   */
  async suggestSection(actor: Actor, input: SuggestProblemSectionRequest): Promise<ProblemSectionSuggestionDto> {
    const { section, problem } = input;
    const side = ioSideOf(section);
    const current = problem[section];
    // Without AI, the one fix we can still offer is standard input/output.
    const ruleBased = (): ProblemSectionSuggestionDto => ({
      text: toStandardIo(current, side),
      notes: ['Máy chủ chưa dùng được AI nên chỉ chuyển phần đọc/ghi file sang nhập/xuất chuẩn.'],
    });
    if (!(await this.ai.allows(actor.id))) {
      if (hasFileIo(current, side)) {
        return { ...ruleBased(), notes: ['Tài khoản thường không dùng được AI nên chỉ chuyển phần đọc/ghi file sang nhập/xuất chuẩn.'] };
      }
      throw aiRequiresVip();
    }
    if (!this.writer.available) {
      if (hasFileIo(current, side)) return ruleBased();
      throw aiUnavailable();
    }
    try {
      const { text, notes } = await this.writer.write(section, problem);
      // Neither file input/output nor links to other places come back, whatever the model wrote.
      const clean = stripExternalLinks(text).text;
      return { text: hasFileIo(clean, side) ? toStandardIo(clean, side) : clean, notes };
    } catch (error) {
      this.logger.warn(`Section rewrite (${section}) failed: ${(error as Error).message}`);
      if (hasFileIo(current, side)) return ruleBased();
      throw aiFailed();
    }
  }

  async setSolution(actor: Actor, problemId: string, input: UpsertSolutionRequest): Promise<SolutionDto> {
    const problem = await this.loadEditable(actor, problemId);
    const solution = Solution.of(input.explanation, input.language, input.code);
    problem.setSolution(solution);
    await this.problems.save(problem);
    return { ...solution };
  }

  async clearSolution(actor: Actor, problemId: string): Promise<void> {
    const problem = await this.loadEditable(actor, problemId);
    problem.setSolution(null);
    await this.problems.save(problem);
  }

  private async load(id: string): Promise<Problem> {
    const problem = await this.problems.findById(id);
    if (!problem) throw DomainError.notFound('catalog.problem_not_found', 'Không tìm thấy bài tập.');
    return problem;
  }

  private async loadEditable(actor: Actor, id: string): Promise<Problem> {
    const problem = await this.load(id);
    problem.ensureViewableBy(actor);
    problem.ensureEditableBy(actor);
    return problem;
  }
}

const MAX_SHOWN_TESTS = 10;
const aiUnavailable = () => DomainError.validation('catalog.ai_unavailable', 'Máy chủ chưa cấu hình AI nên chưa gợi ý được.');
const aiFailed = () => DomainError.validation('catalog.ai_failed', 'AI chưa gợi ý được lúc này. Hãy thử lại sau ít phút.');
const sameInput = (s: string) => s.trim().split(/\s+/).join(' ');
const owner = (actor: Actor) => ({ id: actor.id, name: actor.name });
const limitsOf = (input: UpsertProblemRequest) => ResourceLimits.of(input.timeLimitMs, input.memoryLimitMb);
