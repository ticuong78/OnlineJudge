import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { Actor } from '../../../shared/application/actor.js';
import { AiAvailability } from '../../../shared/application/ai-availability.js';
import { AiQuota } from '../../../shared/application/ai-quota.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { CurrentActor, Roles } from '../../../shared/presentation/decorators.js';

class AiUsageQuery {
  /** Administrators only: another account's usage. */
  @IsOptional() @IsUUID() userId?: string;
}

/** Monthly AI allowances and what is used (OJ-21). Teachers see their own; administrators may ask for anyone's. */
@Controller('ai')
@Roles('ADMIN', 'TEACHER')
export class AiUsageController {
  constructor(
    private readonly quota: AiQuota,
    private readonly availability: AiAvailability,
  ) {}

  @Get('usage')
  usage(@CurrentActor() actor: Actor, @Query() query: AiUsageQuery) {
    if (query.userId && query.userId !== actor.id && actor.role !== 'ADMIN') {
      throw DomainError.forbidden('ai.usage_forbidden', 'Chỉ quản trị viên được xem lượt dùng AI của người khác.');
    }
    return this.quota.usage(query.userId ?? actor.id, this.availability.enabled);
  }
}
