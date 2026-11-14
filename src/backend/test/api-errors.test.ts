import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { BadRequestException, ForbiddenException, Logger, NotFoundException, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import type { ApiErrorBody } from '@oj/contracts';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { errorForLog, maskEmailsIn } from '../src/shared/domain/mask-email.js';
import { ApiExceptionFilter } from '../src/shared/presentation/domain-error.filter.js';

/**
 * Upper bound for the OJ-15 speed tests. Generous on purpose: the suites run in parallel and timings vary under load,
 * while the quadratic versions these guard against took 4 to 34 seconds on the same inputs.
 */
const LIMIT_MS = 1_000;

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

/** Shaped like TypeORM's QueryFailedError: the query, its parameters and the driver's fields copied onto the error. */
class FakeQueryFailedError extends Error {
  query = 'INSERT INTO "verifications"("id", "email", "codeHash", "linkHash") VALUES ($1, $2, $3, $4)';
  parameters = ['4f1c…', 'hs01@truong.edu.vn', 'scrypt$aa11bb22cc33', 'link$dd44ee55'];
  detail = 'Key (email)=(hs01@truong.edu.vn) already exists.';
  driverError = { detail: this.detail, parameters: this.parameters };
  constructor() {
    super('duplicate key value violates unique constraint "UQ_verification_email" for hs01@truong.edu.vn');
    this.name = 'QueryFailedError';
  }
}

test('B2 regression: an unexpected database error is logged without emails, parameters or hashes', (ctx) => {
  const logged: string[] = [];
  ctx.mock.method(Logger.prototype, 'error', (...args: unknown[]) => {
    // What Nest would print: strings as they are, anything else through util.inspect (which shows own fields).
    logged.push(args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 5 }))).join(' '));
  });
  const res = respond(new FakeQueryFailedError());
  assert.equal(res.status, 500);
  const text = logged.join('\n');
  assert.ok(text.includes('QueryFailedError'), 'the error is still logged, with its name');
  assert.ok(text.includes('UQ_verification_email'), 'and what failed');
  assert.ok(!text.includes('hs01@truong.edu.vn'), 'no full email');
  assert.ok(!text.includes('scrypt$aa11bb22cc33') && !text.includes('link$dd44ee55'), 'no hashes');
  assert.ok(!text.includes('INSERT INTO'), 'no query text');
});

test('B2: errorForLog keeps the stack, masks emails, and does not describe non-errors', () => {
  const line = errorForLog(new Error('SMTP refused hs02@truong.edu.vn'));
  assert.match(line, /^Error: SMTP refused h\*\*\*@truong\.edu\.vn/);
  assert.match(line, /\n\s+at /, 'the stack frames are kept');
  assert.equal(errorForLog({ email: 'hs03@truong.edu.vn' }), 'Non-error thrown (object)');
});

test('B2 follow-up: stack frames with package paths stay readable; real addresses are still masked', () => {
  const err = new Error('send to hs04@truong.edu.vn failed');
  err.stack = `Error: send to hs04@truong.edu.vn failed
    at Query.run (/app/node_modules/.pnpm/typeorm@0.3.27_pg@8.16.3/node_modules/typeorm/query.js:10:5)`;
  const line = errorForLog(err);
  assert.ok(line.includes('typeorm@0.3.27_pg@8.16.3/node_modules'), line);
  assert.ok(line.includes('h***@truong.edu.vn') && !line.includes('hs04@'), line);
});

test('F2 regression: every realistic address is masked, wherever it sits in a sentence', () => {
  const cases: [string, string][] = [
    ['Refused hs01@truong.edu.vn.', 'Refused h***@truong.edu.vn.'], // the OJ-14 regression
    ['to hs01@truong.edu.vn, hs02@truong.edu.vn.', 'to h***@truong.edu.vn, h***@truong.edu.vn.'],
    ['Key (email)=(hs03@truong.edu.vn) already exists.', 'Key (email)=(h***@truong.edu.vn) already exists.'],
    ['<hs04@truong.edu.vn>: mailbox full', '<h***@truong.edu.vn>: mailbox full'],
    ['a.b+tag@mail.sub.example.co.uk', 'a***@mail.sub.example.co.uk'],
    ['HS05@TRUONG.EDU.VN', 'H***@TRUONG.EDU.VN'],
    ['ivan@почта.рф.', 'i***@почта.рф.'],
    ['ivan@xn--80a1acny.xn--p1ai', 'i***@xn--80a1acny.xn--p1ai'],
    ['line one hs06@truong.edu.vn.\nline two', 'line one h***@truong.edu.vn.\nline two'],
  ];
  for (const [input, masked] of cases) assert.equal(maskEmailsIn(input), masked, input);
  const frame = 'at q (/app/node_modules/.pnpm/typeorm@0.3.27_pg@8.16.3/node_modules/x.js:1:2)';
  assert.equal(maskEmailsIn(frame), frame, 'package paths stay readable');
});

test('F2 follow-up: masking long text stays linear', () => {
  for (const text of ['a'.repeat(100_000), 'a@'.repeat(50_000), `a@${'b.'.repeat(50_000)}`]) {
    const start = performance.now();
    maskEmailsIn(text);
    assert.ok(performance.now() - start < LIMIT_MS, text.slice(0, 10));
  }
});
