import type { Logger } from '../config/logger.js';
import { maskPushToken, type PushMessage, type PushProvider, type PushReceipt, type PushTicket } from './types.js';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** limite do Expo por requisição */
const EXPO_BATCH = 100;

export interface ExpoPushProviderOptions {
  /** opcional: exigido só quando "Enhanced Security for Push" está ativo no projeto Expo (segredo do backend) */
  accessToken?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Envio via Expo Push Service (que entrega por APNs/FCM). */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ExpoPushProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Expo Push HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const batch = messages.slice(i, i + EXPO_BATCH);
      const body = (await this.post(EXPO_SEND_URL, batch)) as { data?: PushTicket[] };
      if (!Array.isArray(body.data) || body.data.length !== batch.length) throw new Error('Expo Push: resposta inesperada');
      tickets.push(...body.data);
    }
    return tickets;
  }

  async getReceipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    const receipts: Record<string, PushReceipt> = {};
    for (let i = 0; i < ids.length; i += 300) {
      const body = (await this.post(EXPO_RECEIPTS_URL, { ids: ids.slice(i, i + 300) })) as { data?: Record<string, PushReceipt> };
      Object.assign(receipts, body.data ?? {});
    }
    return receipts;
  }
}

/** Desenvolvimento sem envio real: registra no log (token mascarado) e responde "ok". */
export class LogPushProvider implements PushProvider {
  readonly name = 'log';
  private counter = 0;

  constructor(private readonly logger: Logger) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    return messages.map((message) => {
      this.logger.info({ status: 'push_simulated', to: maskPushToken(message.to), title: message.title, channel_id: message.channelId }, 'push notification (log provider)');
      this.counter += 1;
      return { status: 'ok', id: `log-${this.counter}` };
    });
  }
}

/** Testes: guarda as mensagens enviadas e permite simular falhas. */
export class MemoryPushProvider implements PushProvider {
  readonly name = 'memory';
  readonly sent: PushMessage[] = [];
  /** próximas chamadas lançam erro de transporte (decrementa a cada falha) */
  failNextSends = 0;
  /** tokens que o "serviço" diz não estarem mais registrados */
  readonly unregistered = new Set<string>();

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (this.failNextSends > 0) {
      this.failNextSends -= 1;
      throw new Error('falha simulada de transporte');
    }
    return messages.map((message, index) => {
      if (this.unregistered.has(message.to)) return { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };
      this.sent.push(message);
      return { status: 'ok', id: `mem-${this.sent.length}-${index}` };
    });
  }
}
