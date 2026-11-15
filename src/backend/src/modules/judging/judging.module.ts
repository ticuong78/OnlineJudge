import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssessmentModule } from '../assessment/assessment.module.js';
import { JudgingFacade } from './application/judging.facade.js';
import { JudgeWatchdog } from './application/judge-watchdog.js';
import { JudgingService } from './application/judging.service.js';
import { TrialRunService } from './application/trial-run.service.js';
import { TrialStore } from './application/trial-store.js';
import { JudgeQueue, SessionGateway } from './application/ports.js';
import { SubmissionQueries, SubmissionRepository } from './domain/submission.repository.js';
import { BullMqJudgeQueue, JudgeResultsConsumer } from './infrastructure/bullmq-judge-queue.js';
import { RedisTrialStore } from './infrastructure/redis-trial-store.js';
import { AssessmentSessionGateway } from './infrastructure/session.gateway.js';
import { SubmissionOrmEntity } from './infrastructure/submission.orm-entity.js';
import { TypeOrmSubmissionQueries, TypeOrmSubmissionRepository } from './infrastructure/typeorm-submission.repository.js';
import { RejudgeController, SubmissionsController, TrialRunsController } from './presentation/submissions.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([SubmissionOrmEntity]), AssessmentModule],
  controllers: [SubmissionsController, RejudgeController, TrialRunsController],
  providers: [
    JudgingService,
    TrialRunService,
    { provide: TrialStore, inject: [Redis], useFactory: (redis: Redis) => new RedisTrialStore(redis) },
    JudgingFacade,
    JudgeWatchdog,
    JudgeResultsConsumer,
    { provide: SubmissionRepository, useClass: TypeOrmSubmissionRepository },
    { provide: SubmissionQueries, useClass: TypeOrmSubmissionQueries },
    { provide: SessionGateway, useClass: AssessmentSessionGateway },
    { provide: JudgeQueue, useClass: BullMqJudgeQueue },
  ],
  exports: [JudgingFacade],
})
export class JudgingModule {}
