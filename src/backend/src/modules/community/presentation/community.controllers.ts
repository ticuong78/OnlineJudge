import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { ThreadKind } from '@oj/contracts';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import type { Actor } from '../../../shared/application/actor.js';
import { CurrentActor, Roles } from '../../../shared/presentation/decorators.js';
import { CommunityService } from '../application/community.service.js';

class CreateThreadBody {
  @IsIn(['ANNOUNCEMENT', 'QUESTION']) kind: ThreadKind;
  @IsString() @Length(1, 200, { message: 'Tiêu đề phải từ 1 đến 200 ký tự.' }) title: string;
  @IsString() @Length(1, 20_000, { message: 'Nội dung phải từ 1 đến 20000 ký tự.' }) body: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() sessionId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^[A-Za-z]{1,3}$/) problemKey?: string | null;
}

class ReplyBody {
  @IsString() @Length(1, 20_000, { message: 'Nội dung phải từ 1 đến 20000 ký tự.' }) body: string;
}

class PinBody {
  @IsBoolean() pinned: boolean;
}

class TopicQuery {
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @Matches(/^[A-Za-z]{1,3}$/) problemKey?: string;
}

@Controller('classes/:classId/threads')
export class ClassThreadsController {
  constructor(private readonly community: CommunityService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Param('classId', ParseUUIDPipe) classId: string, @Query() query: TopicQuery) {
    return this.community.list(actor, classId, query);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Param('classId', ParseUUIDPipe) classId: string, @Body() body: CreateThreadBody) {
    return this.community.create(actor, classId, body);
  }
}

@Controller('threads')
export class ThreadsController {
  constructor(private readonly community: CommunityService) {}

  // Declared before ':id', which would otherwise take "awaiting" as a thread id.
  @Get('awaiting')
  @Roles('ADMIN', 'TEACHER')
  awaiting(@CurrentActor() actor: Actor) {
    return this.community.awaiting(actor);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.community.get(actor, id);
  }

  @Post(':id/replies')
  reply(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReplyBody) {
    return this.community.reply(actor, id, body.body);
  }

  @Delete(':id') @HttpCode(204)
  delete(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.community.delete(actor, id);
  }

  @Delete(':id/replies/:replyId') @HttpCode(204)
  deleteReply(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
  ) {
    return this.community.deleteReply(actor, id, replyId);
  }

  @Post(':id/pin') @HttpCode(200)
  pin(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: PinBody) {
    return this.community.pin(actor, id, body.pinned);
  }
}
