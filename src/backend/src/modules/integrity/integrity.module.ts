import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssessmentModule } from '../assessment/assessment.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JudgingModule } from '../judging/judging.module.js';
import { IntegrityService } from './application/integrity.service.js';
import { AiUsageReviewer, SessionAccess, SubmissionSource } from './application/ports.js';
import { IntegrityFlagRepository } from './domain/integrity-flag.repository.js';
import { AssessmentSessionAccess, JudgingSubmissionSource } from './infrastructure/adapters.js';
import { ClaudeAiUsageReviewer } from './infrastructure/claude-ai-usage-reviewer.js';
import {
  IntegrityCheckOrmEntity,
  IntegrityFirstReviewOrmEntity,
  IntegrityFlagOrmEntity,
  TypeOrmIntegrityFlagRepository,
} from './infrastructure/persistence.js';
import { IntegrityController } from './presentation/integrity.controller.js';

/** Academic integrity: background plagiarism / AI-usage checks and their teacher-only review. */
@Module({
  imports: [TypeOrmModule.forFeature([IntegrityFlagOrmEntity, IntegrityCheckOrmEntity, IntegrityFirstReviewOrmEntity]), JudgingModule, AssessmentModule, IdentityModule],
  controllers: [IntegrityController],
  providers: [
    IntegrityService,
    { provide: IntegrityFlagRepository, useClass: TypeOrmIntegrityFlagRepository },
    { provide: SubmissionSource, useClass: JudgingSubmissionSource },
    { provide: SessionAccess, useClass: AssessmentSessionAccess },
    { provide: AiUsageReviewer, useClass: ClaudeAiUsageReviewer },
  ],
})
export class IntegrityModule {}
