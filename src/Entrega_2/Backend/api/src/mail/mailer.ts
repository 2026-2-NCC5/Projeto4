import nodemailer from 'nodemailer';
import type { AppConfig } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** false quando o envio de e-mail não está configurado (recuperação de senha indisponível). */
  readonly available: boolean;
  send(message: MailMessage): Promise<void>;
}

class SmtpMailer implements Mailer {
  readonly available = true;
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly config: AppConfig['mail'] & { smtp: NonNullable<AppConfig['mail']['smtp']> }) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass ?? '' } } : {}),
      // Mensagens montadas apenas com texto; nunca buscar arquivos ou URLs externas.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
  }
}

class DisabledMailer implements Mailer {
  readonly available = false;
  async send(): Promise<void> {
    throw new Error('Envio de e-mail não configurado (MAIL_TRANSPORT=disabled).');
  }
}

export function createMailer(config: AppConfig): Mailer {
  if (config.mail.transport === 'smtp' && config.mail.smtp) {
    return new SmtpMailer({ ...config.mail, smtp: config.mail.smtp });
  }
  return new DisabledMailer();
}
