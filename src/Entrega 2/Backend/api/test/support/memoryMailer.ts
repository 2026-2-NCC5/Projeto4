import type { MailMessage, Mailer } from '../../src/mail/mailer.js';

/** Caixa de saída em memória para testes (substitui o SMTP). */
export class MemoryMailer implements Mailer {
  readonly available: boolean;
  readonly sent: MailMessage[] = [];

  constructor(available = true) {
    this.available = available;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.available) throw new Error('mail disabled');
    this.sent.push(message);
  }

  lastCodeFor(email: string): string | null {
    const message = [...this.sent].reverse().find((item) => item.to === email);
    return message?.text.match(/é: (\d+)/)?.[1] ?? null;
  }
}

/** Relógio controlável para testar expiração, cooldown e janelas de limite. */
export function createClock(start = new Date('2026-09-17T12:00:00.000Z')) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}
