import type { Request, Response } from 'express';
import type { Logger } from '../config/logger.js';
import type { QueueRealtimeEventType, QueueSyncEvent, QueueTicketRealtimeEvent } from '../contracts/mobileApi.v1.js';
import type { QueueEventBus, QueueTicketEvent } from './eventBus.js';
import type { QueueService } from './service.js';

interface Client {
  userId: string;
  res: Response;
  seq: number;
  heartbeat: ReturnType<typeof setInterval>;
  expiry: ReturnType<typeof setTimeout>;
}

export interface QueueRealtimeHubOptions {
  bus: QueueEventBus;
  service: QueueService;
  logger: Logger;
  heartbeatMs?: number;
  /** a conexão é encerrada periodicamente: o app reconecta com o token de acesso atualizado */
  maxStreamMs?: number;
  /** limite de conexões simultâneas por usuário (abas/aparelhos) */
  maxStreamsPerUser?: number;
  /**
   * Sem laço residente (funções serverless): enquanto houver conexões abertas nesta instância, chamado a cada
   * `tickMs` — atualiza a fila e, pelo barramento, as próprias conexões.
   */
  onTick?: () => Promise<void>;
  tickMs?: number;
}

function toRealtime(event: QueueTicketEvent): QueueTicketRealtimeEvent {
  return {
    type: event.type,
    subscriptionId: event.subscriptionId,
    ticket: event.ticket,
    status: event.status,
    position: event.position,
    ahead: event.ahead,
    desk: event.desk,
    calledAt: event.calledAt,
    milestone: event.milestone,
    late: event.late,
    timestamp: event.occurredAt,
  };
}

/**
 * Tempo real para o app aberto (Server-Sent Events: HTTP simples, sem dependência nova).
 * O push continua sendo o canal para app em segundo plano/fechado.
 *
 * Cada usuário recebe só o próprio acompanhamento: `queue.status` (estado completo) quando algo muda,
 * `queue.sync` a cada leitura sem mudanças e os eventos `queue.ticket.*` do seu acompanhamento.
 */
export class QueueRealtimeHub {
  private readonly clients = new Map<string, Set<Client>>();
  private detach: Array<() => void> = [];
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: QueueRealtimeHubOptions) {}

  get connections(): number {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }

  attach(): void {
    const { bus } = this.options;
    this.detach = [
      bus.on('queue.updated', async ({ changes }) => {
        if (changes.changed) await this.broadcastStatus();
        else this.broadcastSync();
      }),
      bus.on('queue.source_unavailable', () => this.broadcastSync()),
      bus.on('queue.source_recovered', () => this.broadcastSync()),
      bus.on('queue.ticket', async (event) => {
        if (!this.clients.has(event.userId)) return;
        this.sendToUser(event.userId, event.type, toRealtime(event));
        await this.sendStatus(event.userId);
      }),
    ];
  }

  /** GET /api/queue/stream (autenticado). */
  async handle(req: Request, res: Response): Promise<void> {
    const userId = req.auth!.userId;
    const existing = this.clients.get(userId) ?? new Set<Client>();
    const max = this.options.maxStreamsPerUser ?? 3;
    // conexões antigas do mesmo usuário cedem lugar à mais nova
    for (const old of [...existing].slice(0, Math.max(0, existing.size - max + 1))) this.close(old);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 5000\n\n');

    const client: Client = {
      userId,
      res,
      seq: 0,
      heartbeat: setInterval(() => res.write(': ping\n\n'), this.options.heartbeatMs ?? 25_000),
      expiry: setTimeout(() => this.close(client), this.options.maxStreamMs ?? 5 * 60_000),
    };
    client.heartbeat.unref?.();
    client.expiry.unref?.();
    const set = this.clients.get(userId) ?? new Set<Client>();
    set.add(client);
    this.clients.set(userId, set);
    this.startTicker();
    req.on('close', () => this.remove(client));
    req.log.debug({ status: 'queue_stream_opened', connections: this.connections }, 'queue stream opened');
    await this.sendStatus(userId);
  }

  private write(client: Client, event: QueueRealtimeEventType, data: unknown) {
    if (client.res.writableEnded) return;
    client.seq += 1;
    client.res.write(`id: ${client.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private sendToUser(userId: string, event: QueueRealtimeEventType, data: unknown) {
    for (const client of this.clients.get(userId) ?? []) this.write(client, event, data);
  }

  private async sendStatus(userId: string) {
    if (!this.clients.has(userId)) return;
    try {
      const status = await this.options.service.status(userId);
      this.sendToUser(userId, 'queue.status', status);
    } catch (error) {
      this.options.logger.warn({ status: 'queue_stream_status_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue stream status failed');
    }
  }

  private async broadcastStatus() {
    await Promise.all([...this.clients.keys()].map((userId) => this.sendStatus(userId)));
  }

  private broadcastSync() {
    const overview = this.options.service.overview();
    const payload: QueueSyncEvent = { status: overview.status, sync: overview.sync };
    for (const set of this.clients.values()) for (const client of set) this.write(client, 'queue.sync', payload);
  }

  private remove(client: Client) {
    clearInterval(client.heartbeat);
    clearTimeout(client.expiry);
    const set = this.clients.get(client.userId);
    set?.delete(client);
    if (set && set.size === 0) this.clients.delete(client.userId);
    if (this.clients.size === 0) this.stopTicker();
  }

  private startTicker() {
    const { onTick, tickMs } = this.options;
    if (!onTick || this.ticker) return;
    this.ticker = setInterval(() => {
      onTick().catch((error: unknown) => {
        this.options.logger.warn({ status: 'queue_stream_tick_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue stream tick failed');
      });
    }, tickMs ?? 10_000);
    this.ticker.unref?.();
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private close(client: Client) {
    this.remove(client);
    if (!client.res.writableEnded) client.res.end();
  }

  stop(): void {
    this.stopTicker();
    for (const off of this.detach) off();
    this.detach = [];
    for (const set of [...this.clients.values()]) for (const client of [...set]) this.close(client);
  }
}
