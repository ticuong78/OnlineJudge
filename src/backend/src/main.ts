import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { parseTrustProxy } from './config/environment.js';
import { ApiExceptionFilter } from './shared/presentation/domain-error.filter.js';

/** After SIGTERM/SIGINT the server gets this long to finish; a stuck shutdown (e.g. a dead Redis connection) must not hang forever. */
const SHUTDOWN_TIMEOUT_MS = 15_000;

async function bootstrap() {
  // Imported here, not at the top, so a configuration error is reported as a short message, not a stack trace.
  const { AppModule } = await import('./app.module.js');
  // abortOnError: false -> a configuration error reaches the catch below as one short message, not a stack trace.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false });
  app.setGlobalPrefix('api');
  // Behind a reverse proxy the client's address is only known when TRUST_PROXY says how many proxies to believe.
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  // Test data can be large.
  app.useBodyParser('json', { limit: '20mb' });
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    // 429 answers say how long to wait; a browser on another origin only sees the header if it is exposed.
    exposedHeaders: ['Retry-After'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      setTimeout(() => {
        console.error(`Graceful shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS / 1000}s; exiting.`);
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    });
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API ready on http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
