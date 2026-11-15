import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { SmtpMailTransport } from '../src/shared/infrastructure/mail-transports.js';

test('a failed send is logged without the full recipient address', async (ctx) => {
  const failing = { sendMail: async () => { throw new Error('connection refused'); } } as unknown as Transporter;
  const error = ctx.mock.method(Logger.prototype, 'error', () => {});
  const transport = new SmtpMailTransport(failing, 'Online Judge <oj@truong.vn>');

  await assert.rejects(transport.send({ to: 'nguyen.van.lan@truong.vn', subject: 's', text: 't', html: 'h' }), (e: DomainError) => e.code === 'mail.send_failed');

  const logged = error.mock.calls.map((c) => String(c.arguments[0]));
  assert.equal(logged.length, 1);
  assert.match(logged[0], /connection refused/);
  assert.doesNotMatch(logged[0], /nguyen\.van\.lan/);
  assert.match(logged[0], /n\*+@truong\.vn/, 'the domain and first letter are kept, enough to tell a typo from an outage');
});

test('addresses the mail server echoes back in its error are masked too (R2-F4)', async (ctx) => {
  const rejecting = {
    sendMail: async () => { throw new Error('Can\'t send mail - all recipients were rejected: 550 5.1.1 <nguyen.van.lan@truong.vn>: Recipient address rejected'); },
  } as unknown as Transporter;
  const error = ctx.mock.method(Logger.prototype, 'error', () => {});
  await assert.rejects(new SmtpMailTransport(rejecting, 'oj@truong.vn').send({ to: 'nguyen.van.lan@truong.vn', subject: 's', text: 't', html: 'h' }));
  const logged = String(error.mock.calls[0].arguments[0]);
  assert.doesNotMatch(logged, /nguyen\.van\.lan/);
  assert.match(logged, /Recipient address rejected/, 'the reason is kept');
});
