import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';
import { EventPublisher } from './application/event-publisher.js';
import { MailTransport } from './application/mail-transport.js';
import { RateLimiter } from './application/rate-limiter.js';
import { ClaudeClient, createClaudeClient } from './infrastructure/claude.js';
import { createMailTransport } from './infrastructure/mail-transports.js';
import { NestEventPublisher } from './infrastructure/nest-event-publisher.js';
import { RedisRateLimiter } from './infrastructure/redis-rate-limiter.js';
import { RateLimitGuard } from './presentation/rate-limit.js';

/**
 * One Redis connection for request-time state (rate limits, recent sign-ins); BullMQ keeps its own. Commands fail
 * fast when Redis is unreachable, so a request is refused rather than left hanging or let through uncounted.
 */
export function createRedis(config: ConfigService): Redis {
  return new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), { maxRetriesPerRequest: 1, commandTimeout: 2_000 });
}

@Global()
@Module({
  providers: [
    { provide: EventPublisher, useClass: NestEventPublisher },
    { provide: MailTransport, inject: [ConfigService], useFactory: createMailTransport },
    { provide: ClaudeClient, inject: [ConfigService], useFactory: createClaudeClient },
    { provide: Redis, inject: [ConfigService], useFactory: createRedis },
    { provide: RateLimiter, inject: [Redis], useFactory: (redis: Redis) => new RedisRateLimiter(redis) },
    // Registered before the auth guard (IdentityModule) so abusive clients are turned away first.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [EventPublisher, MailTransport, ClaudeClient, RateLimiter, Redis],
})
export class SharedModule implements OnApplicationShutdown {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => undefined);
  }
}
