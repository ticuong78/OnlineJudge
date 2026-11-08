import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment } from './config/environment.js';
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
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNC', 'false') === 'true',
        // Hosted Postgres (e.g. Supabase) signs its certificate with its own CA: verify against that file.
        ...(config.get<string>('DATABASE_SSL_CA') ? { ssl: { ca: readFileSync(config.get<string>('DATABASE_SSL_CA')!, 'utf8') } } : {}),
      }),
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
