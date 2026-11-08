import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException, Logger, NotFoundException, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import type { ApiErrorBody } from '@oj/contracts';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { ApiExceptionFilter } from '../src/shared/presentation/domain-error.filter.js';

/** Runs the filter on one exception and returns the HTTP status and JSON body it produced. */
function respond(exception: unknown): { status: number; body: ApiErrorBody } {
  const out: { status: number; body: ApiErrorBody } = { status: 0, body: { statusCode: 0, message: '', code: '' } };
  const res = { status: (s: number) => ((out.status = s), res), json: (b: ApiErrorBody) => ((out.body = b), res), setHeader: () => res };
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  new ApiExceptionFilter().catch(exception, host as never);
  return out;
}

test('K-13: every error body carries a stable code, not only domain errors', () => {
  const validation = respond(new BadRequestException(['Tên lớp phải từ 1 đến 100 ký tự.', 'Mã lớp gồm 4–20 ký tự.']));
  assert.deepEqual(validation, { status: 400, body: { statusCode: 400, message: 'Tên lớp phải từ 1 đến 100 ký tự.; Mã lớp gồm 4–20 ký tự.', code: 'request.invalid' } });
  assert.equal(respond(new NotFoundException('Cannot GET /api/nope')).body.code, 'request.not_found');
  assert.equal(respond(new PayloadTooLargeException()).body.code, 'request.too_large');
  assert.equal(respond(new UnauthorizedException()).body.code, 'auth.required');
  assert.equal(respond(new ForbiddenException()).body.code, 'auth.forbidden');
});

test('K-13: unexpected errors are 500 with a generic message and a code; domain errors keep theirs', (ctx) => {
  ctx.mock.method(Logger.prototype, 'error', () => undefined);
  assert.deepEqual(respond(new Error('db down: password=secret')), { status: 500, body: { statusCode: 500, message: 'Đã xảy ra lỗi hệ thống.', code: 'server.error' } });
  const domain = respond(DomainError.conflict('organization.no_seats', 'Hết chỗ.'));
  assert.deepEqual([domain.status, domain.body.code], [409, 'organization.no_seats']);
});
