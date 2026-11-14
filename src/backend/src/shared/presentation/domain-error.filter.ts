import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@oj/contracts';
import type { Response } from 'express';
import { DomainError, type DomainErrorKind } from '../domain/domain-error.js';
import { errorForLog } from '../domain/mask-email.js';

const STATUS: Record<DomainErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

/**
 * Stable codes for errors raised by Nest itself (validation pipe, unknown routes, body limits, guards), so clients can
 * branch on `code` for every error, not only domain errors. Unlisted statuses fall back to `request.failed`.
 */
const HTTP_CODES: Record<number, string> = {
  400: 'request.invalid',
  401: 'auth.required',
  403: 'auth.forbidden',
  404: 'request.not_found',
  405: 'request.method_not_allowed',
  409: 'request.conflict',
  413: 'request.too_large',
  415: 'request.unsupported_media_type',
  429: 'request.rate_limited',
};

/** Maps domain errors and Nest HTTP exceptions to the shared `ApiErrorBody` shape. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiErrorBody;

    if (exception instanceof DomainError) {
      if (exception.kind === 'rate_limited' && exception.details?.retryAfterSeconds) {
        res.setHeader('Retry-After', exception.details.retryAfterSeconds);
      }
      body = {
        statusCode: STATUS[exception.kind],
        message: exception.message,
        code: exception.code,
        ...(exception.details ? { details: exception.details } : {}),
      };
    } else if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const raw = typeof payload === 'string' ? payload : (payload as { message?: string | string[] }).message;
      const statusCode = exception.getStatus();
      body = {
        statusCode,
        message: Array.isArray(raw) ? raw.join('; ') : (raw ?? exception.message),
        code: HTTP_CODES[statusCode] ?? (statusCode >= 500 ? 'server.error' : 'request.failed'),
      };
    } else {
      this.logger.error(errorForLog(exception));
      body = { statusCode: 500, message: 'Đã xảy ra lỗi hệ thống.', code: 'server.error' };
    }
    res.status(body.statusCode).json(body);
  }
}
