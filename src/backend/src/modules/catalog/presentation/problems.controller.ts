import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { Actor } from '../../../shared/application/actor.js';
import { CurrentActor, Roles } from '../../../shared/presentation/decorators.js';
import { ProblemService } from '../application/problem.service.js';
import {
  CreateProblemBody,
  ProblemListQuery,
  ProblemTagsQuery,
  SharingBody,
  SuggestDraftTestsBody,
  SuggestSectionBody,
  SuggestTestCasesBody,
  UpsertProblemBody,
  UpsertSolutionBody,
  UpsertTestCaseBody,
} from './problem.dto.js';

/** Teachers' problem banks. Students reach problems only through sessions. */
@Controller('problems')
@Roles('ADMIN', 'TEACHER')
export class ProblemsController {
  constructor(private readonly problems: ProblemService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: ProblemListQuery) {
    const { tag, ...rest } = query;
    return this.problems.list(actor, { ...rest, tags: tag, scope: query.scope ?? 'mine' });
  }

  /** Topics and other tags in a bank scope, with how many problems carry each (OJ-20). Before ':id'. */
  @Get('tags')
  tags(@CurrentActor() actor: Actor, @Query() query: ProblemTagsQuery) {
    return this.problems.tagCounts(actor, query.scope ?? 'mine', query.organizationId);
  }

  /** AI rewrite of one section of the problem being written (saved or not); nothing is saved. */
  @Post('suggest-section') @HttpCode(200)
  suggestSection(@CurrentActor() actor: Actor, @Body() body: SuggestSectionBody) {
    return this.problems.suggestSection(actor, body);
  }

  /** AI test suggestions for a problem not saved yet; nothing is saved. */
  @Post('suggest-tests') @HttpCode(200)
  suggestDraftTests(@CurrentActor() actor: Actor, @Body() body: SuggestDraftTestsBody) {
    return this.problems.suggestDraftTests(actor, body);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.problems.get(actor, id);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body() { testCases, ...problem }: CreateProblemBody) {
    return this.problems.create(actor, problem, testCases);
  }

  @Put(':id')
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertProblemBody) {
    return this.problems.update(actor, id, body);
  }

  @Delete(':id') @HttpCode(204)
  delete(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.problems.delete(actor, id);
  }

  @Put(':id/sharing')
  share(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SharingBody) {
    return this.problems.share(actor, id, body);
  }

  @Post(':id/copy')
  copy(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.problems.copy(actor, id);
  }

  @Post(':id/test-cases')
  addTestCase(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertTestCaseBody) {
    return this.problems.addTestCase(actor, id, body);
  }

  /** AI suggestions to review; nothing is saved. */
  @Post(':id/test-cases/suggest') @HttpCode(200)
  suggestTestCases(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SuggestTestCasesBody) {
    return this.problems.suggestTestCases(actor, id, body);
  }

  @Put(':id/test-cases/:testCaseId')
  updateTestCase(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCaseId', ParseUUIDPipe) testCaseId: string,
    @Body() body: UpsertTestCaseBody,
  ) {
    return this.problems.updateTestCase(actor, id, testCaseId, body);
  }

  @Delete(':id/test-cases/:testCaseId') @HttpCode(204)
  removeTestCase(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCaseId', ParseUUIDPipe) testCaseId: string,
  ) {
    return this.problems.removeTestCase(actor, id, testCaseId);
  }

  @Put(':id/solution')
  setSolution(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertSolutionBody) {
    return this.problems.setSolution(actor, id, body);
  }

  @Delete(':id/solution') @HttpCode(204)
  clearSolution(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.problems.clearSolution(actor, id);
  }
}
