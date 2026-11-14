import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment } from './config/environment.js';
import { databaseOptions, openDatabase, retryDatabaseError } from './database.js';
import { AssessmentModule } from './modules/assessment/assessment.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ClassroomModule } from './modules/classroom/classroom.module.js';
import { CommunityModule } from './modules/community/community.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ImportingModule } from './modules/importing/importing.module.js';
import { IntegrityModule } from './modules/integrity/integrity.module.js';
import { JudgingModule } from './modules/judging/judging.module.js';
import { SharedModule } from './shared/shared.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'], validate: validateEnvironment }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...databaseOptions((key) => config.get<string>(key)),
        autoLoadEntities: true,
        // A database that is not up yet is retried; a failed migration is not (it would run again each time).
        toRetry: retryDatabaseError,
      }),
      // Migrations under a lock, then DB_SYNC in development, before any module reads the database (OJ-26, OJ-28).
      dataSourceFactory: (options) => openDatabase(options!),
    }),
    SharedModule,
    // Bounded contexts
    IdentityModule,
    ClassroomModule,
    CatalogModule,
    ImportingModule,
    JudgingModule,
    AssessmentModule,
    IntegrityModule,
    CommunityModule,
  ],
})
export class AppModule {}
