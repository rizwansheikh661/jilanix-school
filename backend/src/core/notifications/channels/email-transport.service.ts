/**
 * Email transport — provider-agnostic outbound SMTP send.
 *
 * Wraps a single Nodemailer transporter built from `cfg.mail`. The transport
 * itself does not know about SES vs SendGrid vs Mailpit — it just speaks
 * SMTP. The channel adapter (EmailAdapter) calls into this service.
 *
 * Two transport modes:
 *   - `smtp`  — real SMTP host (Mailpit on :1025 in dev, provider SMTP in
 *               prod). Built once on bootstrap and pooled.
 *   - `json`  — Nodemailer's in-process sink. Returns the composed envelope
 *               instead of dispatching. Used by unit tests; never enabled in
 *               production (env.schema.ts forbids it).
 */
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';

import { ConfigService } from '../../config/config.service';

export type EmailSendInput = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly headers?: Readonly<Record<string, string>>;
};

export type EmailSendResult = {
  readonly messageId: string;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
  readonly response: string;
};

@Injectable()
export class EmailTransportService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailTransportService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  public onApplicationBootstrap(): void {
    this.transporter = this.buildTransporter();
    const { transport, smtp, from } = this.config.mail;
    this.logger.log(
      `Email transport ready (${transport}, host=${smtp.host}:${smtp.port}, from="${from}")`,
    );
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }

  public async send(input: EmailSendInput): Promise<EmailSendResult> {
    const t = this.transporter ?? this.buildTransporter();
    const info = await t.sendMail({
      from: this.config.mail.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
      headers: input.headers,
    });
    return {
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
      response: info.response ?? '',
    };
  }

  private buildTransporter(): Transporter {
    const { transport, smtp } = this.config.mail;
    if (transport === 'json') {
      return nodemailer.createTransport({ jsonTransport: true });
    }
    const options: SMTPPool.Options = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      pool: true,
    };
    if (smtp.user && smtp.password) {
      options.auth = { user: smtp.user, pass: smtp.password };
    }
    return nodemailer.createTransport(options);
  }
}
