import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { DomainError } from '../domain/domain-error.js';
import { maskEmail, maskEmailsIn } from '../domain/mask-email.js';
import { MailTransport, type MailMessage } from '../application/mail-transport.js';

/** SMTP delivery, e.g. Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER + App Password. */
export class SmtpMailTransport extends MailTransport {
  private readonly logger = new Logger('SmtpMailTransport');

  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {
    super();
  }

  async send(message: MailMessage) {
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // The server's reply often echoes the recipient ("550 <x@y>: Recipient address rejected"), so mask it too.
      this.logger.error(`Cannot send email to ${maskEmail(message.to)}: ${maskEmailsIn((error as Error).message)}`);
      throw DomainError.conflict('mail.send_failed', 'Không gửi được email. Hãy kiểm tra lại địa chỉ email hoặc thử lại sau ít phút.');
    }
  }
}

/**
 * Development fallback when SMTP is not configured: prints the email (and its code) to the server log.
 * Production refuses to start without SMTP_HOST (config/environment.ts), so this never runs there.
 */
export class ConsoleMailTransport extends MailTransport {
  private readonly logger = new Logger('ConsoleMailTransport');

  async send(message: MailMessage) {
    this.logger.warn(`[email chưa được gửi thật — chưa cấu hình SMTP]\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
  }
}

export function createMailTransport(config: ConfigService): MailTransport {
  const host = config.get<string>('SMTP_HOST');
  if (!host) return new ConsoleMailTransport();
  const port = Number(config.get('SMTP_PORT', 465));
  const user = config.get<string>('SMTP_USER');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
  });
  return new SmtpMailTransport(transporter, config.get<string>('MAIL_FROM') ?? `Online Judge <${user}>`);
}
