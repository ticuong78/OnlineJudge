export type DomainErrorKind = 'validation' | 'not_found' | 'forbidden' | 'conflict' | 'unauthorized' | 'rate_limited';

/**
 * Errors raised by domain/application code. They carry no HTTP knowledge;
 * the presentation layer maps `kind` to a status code.
 */
export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    readonly code: string,
    message: string,
    /** Extra data for the client (ids it can link to). */
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }

  static validation(code: string, message: string, details?: Record<string, string>) {
    return new DomainError('validation', code, message, details);
  }
  static notFound(code: string, message: string) {
    return new DomainError('not_found', code, message);
  }
  static forbidden(code: string, message: string) {
    return new DomainError('forbidden', code, message);
  }
  static conflict(code: string, message: string, details?: Record<string, string>) {
    return new DomainError('conflict', code, message, details);
  }
  static unauthorized(code: string, message: string) {
    return new DomainError('unauthorized', code, message);
  }
  /** Too many attempts; the client may try again after `retryAfterSeconds` (sent as `Retry-After`). */
  static rateLimited(code: string, message: string, retryAfterSeconds: number, details?: Record<string, string>) {
    return new DomainError('rate_limited', code, message, { ...details, retryAfterSeconds: String(Math.max(1, Math.ceil(retryAfterSeconds))) });
  }
}

export function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw DomainError.validation(code, message);
}
