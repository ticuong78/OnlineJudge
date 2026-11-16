import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassroomModule } from '../classroom/classroom.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ClassAccess, LearningRecordStore, ProblemCatalog } from './application/ports.js';
import { ProblemSetService } from './application/problem-set.service.js';
import { SessionFacade } from './application/session.facade.js';
import { GradebookService } from './application/gradebook.service.js';
import { SessionService } from './application/session.service.js';
import { AttemptRepository, ProblemSetRepository, SessionRepository, LearningPathRepository } from './domain/repositories.js';
import { CatalogProblemCatalog, ClassroomClassAccess, PublicSetsKeepProblemsPublic } from './infrastructure/adapters.js';
import { TypeOrmLearningRecordStore } from './infrastructure/learning-record.store.js';
import {
  LearningProgressOrmEntity,
  LearningSessionOrmEntity,
  ProblemSetOrmEntity,
  SessionAttemptOrmEntity,
  SessionOrmEntity,
  SessionTestsOrmEntity,
  LearningPathOrmEntity,
} from './infrastructure/orm-entities.js';
import {
  TypeOrmAttemptRepository,
  TypeOrmLearningPathRepository,
  TypeOrmProblemSetRepository,
  TypeOrmSessionRepository,
} from './infrastructure/repositories.js';
import { ClassGradebookController, LearningPathsController, PracticeController, ProblemSetsController, ProgressController, SessionsController } from './presentation/assessment.controllers.js';
import { LearningPathService } from './application/learning-path.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProblemSetOrmEntity,
      SessionOrmEntity,
      SessionTestsOrmEntity,
      SessionAttemptOrmEntity,
      LearningSessionOrmEntity,
      LearningProgressOrmEntity,
      LearningPathOrmEntity,
    ]),
    CatalogModule,
    ClassroomModule,
    IdentityModule,
  ],
  controllers: [ClassGradebookController, ProblemSetsController, SessionsController, ProgressController, PracticeController, LearningPathsController],
  providers: [
    ProblemSetService,
    SessionService,
    GradebookService,
    SessionFacade,
    LearningPathService,
    { provide: LearningPathRepository, useClass: TypeOrmLearningPathRepository },
    { provide: ProblemSetRepository, useClass: TypeOrmProblemSetRepository },
    { provide: SessionRepository, useClass: TypeOrmSessionRepository },
    { provide: AttemptRepository, useClass: TypeOrmAttemptRepository },
    { provide: LearningRecordStore, useClass: TypeOrmLearningRecordStore },
    { provide: ProblemCatalog, useClass: CatalogProblemCatalog },
    { provide: ClassAccess, useClass: ClassroomClassAccess },
    PublicSetsKeepProblemsPublic,
  ],
  exports: [SessionFacade],
})
export class AssessmentModule {}
