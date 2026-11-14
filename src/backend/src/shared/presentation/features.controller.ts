import { Controller, Get } from '@nestjs/common';
import type { FeaturesDto } from '@oj/contracts';
import { AiAvailability } from '../application/ai-availability.js';
import { Roles } from './decorators.js';

/**
 * What this server can do, so staff screens can disable a control with its reason instead of failing on use (OJ-13).
 * Says only whether a feature is on: never a key, a model or any other configuration value.
 */
@Controller('features')
@Roles('ADMIN', 'TEACHER')
export class FeaturesController {
  constructor(private readonly ai: AiAvailability) {}

  @Get()
  get(): FeaturesDto {
    return { ai: this.ai.enabled };
  }
}
