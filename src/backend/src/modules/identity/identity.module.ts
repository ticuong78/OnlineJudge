import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { isProduction } from '../../config/environment.js';
import { AiAccess } from '../../shared/application/ai-access.js';
import { aiLimitsFrom, AiQuota, aiRateFrom, AiUsageStore } from '../../shared/application/ai-quota.js';
import { RateLimiter } from '../../shared/application/rate-limiter.js';
import { AccountService } from './application/account.service.js';
import { Authenticator } from './application/authenticator.js';
import { OneTimeCodes } from './application/one-time-codes.js';
import { IdentityMailer, PasswordHasher, TokenService } from './application/ports.js';
import { IdentityFacade } from './application/identity.facade.js';
import { RecentSignIns } from './application/recent-sign-ins.js';
import { TeamService } from './application/team.service.js';
import { OrganizationService } from './application/organization.service.js';
import { OrganizationRepository } from './domain/organization.repository.js';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository.js';
import {
  OrganizationInvitationOrmEntity,
  OrganizationMemberOrmEntity,
  OrganizationOrmEntity,
} from './infrastructure/organization.orm-entity.js';
import { OrganizationInvitationsController, OrganizationsController } from './presentation/organization.controllers.js';
import { VerificationSweeper } from './application/verification-sweeper.js';
import { UserRepository, VerificationRepository } from './domain/user.repository.js';
import { EmailIdentityMailer } from './infrastructure/email-identity-mailer.js';
import { JwtTokenService, ScryptPasswordHasher } from './infrastructure/security.js';
import { TypeOrmUserRepository, TypeOrmVerificationRepository } from './infrastructure/typeorm-user.repository.js';
import { UserOrmEntity, VerificationOrmEntity } from './infrastructure/user.orm-entity.js';
import { RedisRecentSignIns } from './infrastructure/redis-recent-sign-ins.js';
import { UserAiAccess } from './infrastructure/user-ai-access.js';
import { AiUsageOrmEntity } from './infrastructure/ai-usage.orm-entity.js';
import { TypeOrmAiUsageStore } from './infrastructure/typeorm-ai-usage.store.js';
import { AiUsageController } from './presentation/ai-usage.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';
import { AuthController, UsersController } from './presentation/identity.controllers.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserOrmEntity,
      VerificationOrmEntity,
      OrganizationOrmEntity,
      OrganizationMemberOrmEntity,
      OrganizationInvitationOrmEntity,
      AiUsageOrmEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController, UsersController, OrganizationsController, OrganizationInvitationsController, AiUsageController],
  providers: [
    AccountService,
    Authenticator,
    TeamService,
    OrganizationService,
    IdentityFacade,
    OneTimeCodes,
    VerificationSweeper,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: VerificationRepository, useClass: TypeOrmVerificationRepository },
    { provide: OrganizationRepository, useClass: TypeOrmOrganizationRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: IdentityMailer, useClass: EmailIdentityMailer },
    { provide: RecentSignIns, inject: [Redis], useFactory: (redis: Redis) => new RedisRecentSignIns(redis) },
    { provide: AiAccess, useClass: UserAiAccess },
    { provide: AiUsageStore, useClass: TypeOrmAiUsageStore },
    // Monthly AI allowances (OJ-21), with the limits from the environment.
    {
      provide: AiQuota,
      inject: [AiAccess, AiUsageStore, RateLimiter, ConfigService],
      useFactory: (access: AiAccess, store: AiUsageStore, limiter: RateLimiter, config: ConfigService) =>
        new AiQuota(access, store, limiter, aiLimitsFrom((key) => config.get<string>(key)), aiRateFrom((key) => config.get<string>(key)),
          aiRateFrom((key) => config.get<string>(key), 'AI_ADMIN_RATE_PER_MINUTE'),
        ),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [IdentityFacade, AiAccess, AiQuota],
})
export class IdentityModule implements OnApplicationBootstrap {
  constructor(
    private readonly accounts: AccountService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.accounts.ensureAdmin(
      this.config.getOrThrow('ADMIN_EMAIL'),
      this.config.getOrThrow('ADMIN_PASSWORD'),
      this.config.get('ADMIN_NAME', 'Quản trị viên'),
      { strict: isProduction({ NODE_ENV: this.config.get('NODE_ENV') }) },
    );
  }
}
