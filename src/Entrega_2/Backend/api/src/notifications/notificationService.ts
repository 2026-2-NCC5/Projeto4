import type { Logger } from '../config/logger.js';
import type { DeliveryRepository, PushDeviceRepository } from './repository.js';
import {
  EXPO_PUSH_TOKEN_PATTERN,
  maskPushToken,
  type DeliveryStatus,
  type NotificationRequest,
  type NotificationResult,
  type PushMessage,
  type PushPlatform,
  type PushProvider,
  type PushTicket,
} from './types.js';

export interface NotificationServiceDeps {
  devices: PushDeviceRepository;
  deliveries: DeliveryRepository;
  provider: PushProvider | null;
  logger: Logger;
  now?: () => Date;
  /** tentativas por notificação em falha de transporte (padrão 3) */
  maxAttempts?: number;
  /** espera base entre tentativas (dobra a cada falha) */
  retryBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** atraso até consultar os recibos de entrega do Expo (0 desativa) */
  receiptDelayMs?: number;
}

export interface NotificationMetrics {
  sent: number;
  failed: number;
  duplicates: number;
  skipped: number;
  delivered: number;
  deliveryErrors: number;
}

const DEVICE_GONE = 'DeviceNotRegistered';

/**
 * Envio de notificações push com:
 * - idempotência (a mesma chave nunca gera dois envios, mesmo com o monitor repetindo ciclos);
 * - novas tentativas com backoff em falha de transporte;
 * - desativação de tokens que o serviço informa como não registrados;
 * - logs sem tokens completos e contadores para observabilidade.
 */
export class NotificationService {
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pendingReceipts = new Map<string, string>();
  private receiptTimer: ReturnType<typeof setTimeout> | null = null;
  readonly metrics: NotificationMetrics = { sent: 0, failed: 0, duplicates: 0, skipped: 0, delivered: 0, deliveryErrors: 0 };

  constructor(private readonly deps: NotificationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get enabled(): boolean {
    return this.deps.provider !== null;
  }

  isValidToken(token: string): boolean {
    return EXPO_PUSH_TOKEN_PATTERN.test(token);
  }

  async registerDevice(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.deps.devices.upsert({ userId, token, platform, now: this.now() });
    this.deps.logger.info({ status: 'push_device_registered', platform, token: maskPushToken(token) }, 'push device registered');
  }

  async unregisterDevice(userId: string, token: string): Promise<boolean> {
    const removed = await this.deps.devices.disableForUser(userId, token, this.now());
    if (removed) this.deps.logger.info({ status: 'push_device_unregistered', token: maskPushToken(token) }, 'push device unregistered');
    return removed;
  }

  async sendToUser(request: NotificationRequest): Promise<NotificationResult> {
    const log = this.deps.logger.child({ category: request.category, idempotency_key: request.idempotencyKey });
    const provider = this.deps.provider;
    if (!provider) {
      this.metrics.skipped += 1;
      return { status: 'skipped', devices: 0, error: 'push_disabled' };
    }
    const fresh = await this.deps.deliveries.begin({ userId: request.userId, idempotencyKey: request.idempotencyKey, category: request.category, now: this.now() });
    if (!fresh) {
      this.metrics.duplicates += 1;
      log.debug({ status: 'notification_duplicate' }, 'notification already handled');
      return { status: 'duplicate', devices: 0 };
    }
    log.info({ status: 'notification_queued' }, 'notification queued');

    const devices = await this.deps.devices.listActiveByUser(request.userId);
    if (devices.length === 0) {
      this.metrics.skipped += 1;
      await this.finish(request.idempotencyKey, 'skipped', 0, 0, [], 'no_devices');
      log.info({ status: 'notification_skipped', reason: 'no_devices' }, 'notification skipped');
      return { status: 'skipped', devices: 0, error: 'no_devices' };
    }

    const messages: PushMessage[] = devices.map((device) => ({
      to: device.token,
      title: request.title,
      body: request.body,
      data: request.data ?? {},
      sound: request.sound === false ? null : 'default',
      priority: request.priority === 'high' ? 'high' : 'default',
      ...(request.channelId ? { channelId: request.channelId } : {}),
      ...(request.ttlSeconds ? { ttl: request.ttlSeconds } : {}),
    }));

    const maxAttempts = this.deps.maxAttempts ?? 3;
    let attempts = 0;
    let tickets: PushTicket[] | null = null;
    let lastError: string | null = null;
    while (attempts < maxAttempts && !tickets) {
      attempts += 1;
      try {
        tickets = await provider.send(messages);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'erro desconhecido';
        log.warn({ status: 'notification_retry', attempt: attempts, error_message: lastError }, 'push send failed');
        if (attempts < maxAttempts) await this.sleep((this.deps.retryBaseMs ?? 1_000) * 2 ** (attempts - 1));
      }
    }

    if (!tickets) {
      this.metrics.failed += 1;
      await this.finish(request.idempotencyKey, 'failed', attempts, devices.length, [], lastError);
      log.error({ status: 'notification_failed', attempts, devices: devices.length, error_message: lastError }, 'notification failed');
      return { status: 'failed', devices: devices.length, error: lastError ?? 'send_failed' };
    }

    const ticketIds: string[] = [];
    let ok = 0;
    for (const [index, ticket] of tickets.entries()) {
      const token = messages[index]?.to ?? '';
      if (ticket.status === 'ok') {
        ok += 1;
        ticketIds.push(ticket.id);
        this.pendingReceipts.set(ticket.id, token);
        continue;
      }
      lastError = ticket.details?.error ?? ticket.message;
      if (ticket.details?.error === DEVICE_GONE) await this.deps.devices.disable(token, DEVICE_GONE, this.now());
      log.warn({ status: 'notification_device_error', token: maskPushToken(token), error: ticket.details?.error ?? 'unknown' }, 'push rejected for device');
    }
    const status: DeliveryStatus = ok === messages.length ? 'sent' : ok > 0 ? 'partial' : 'failed';
    if (ok > 0) this.metrics.sent += 1;
    else this.metrics.failed += 1;
    await this.finish(request.idempotencyKey, status, attempts, devices.length, ticketIds, status === 'sent' ? null : lastError);
    log.info({ status: `notification_${status}`, attempts, devices: devices.length, accepted: ok }, 'notification sent');
    this.scheduleReceiptCheck();
    return { status, devices: devices.length, ...(status === 'sent' ? {} : { error: lastError ?? 'device_error' }) };
  }

  private async finish(key: string, status: DeliveryStatus, attempts: number, devices: number, ticketIds: string[], error: string | null) {
    try {
      await this.deps.deliveries.finish(key, { status, attempts, devices, ticketIds, error, now: this.now() });
    } catch (persistError) {
      this.deps.logger.error({ status: 'notification_log_failed', error_type: persistError instanceof Error ? persistError.name : 'unknown' }, 'delivery result not persisted');
    }
  }

  private scheduleReceiptCheck() {
    const delay = this.deps.receiptDelayMs ?? 0;
    if (delay <= 0 || this.receiptTimer || !this.deps.provider?.getReceipts) return;
    this.receiptTimer = setTimeout(() => {
      this.receiptTimer = null;
      void this.checkReceipts();
    }, delay);
    this.receiptTimer.unref?.();
  }

  /** Recibos do Expo: confirma a entrega ao APNs/FCM e desativa aparelhos que deixaram de existir. */
  async checkReceipts(): Promise<void> {
    const provider = this.deps.provider;
    if (!provider?.getReceipts || this.pendingReceipts.size === 0) return;
    const ids = [...this.pendingReceipts.keys()];
    try {
      const receipts = await provider.getReceipts(ids);
      for (const id of ids) {
        const receipt = receipts[id];
        if (!receipt) continue;
        const token = this.pendingReceipts.get(id) ?? '';
        this.pendingReceipts.delete(id);
        if (receipt.status === 'ok') {
          this.metrics.delivered += 1;
          this.deps.logger.debug({ status: 'notification_delivered', token: maskPushToken(token) }, 'push delivered');
        } else {
          this.metrics.deliveryErrors += 1;
          if (receipt.details?.error === DEVICE_GONE) await this.deps.devices.disable(token, DEVICE_GONE, this.now());
          this.deps.logger.warn({ status: 'notification_delivery_failed', token: maskPushToken(token), error: receipt.details?.error ?? 'unknown' }, 'push delivery failed');
        }
      }
    } catch (error) {
      this.deps.logger.warn({ status: 'notification_receipts_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'push receipts unavailable');
    }
  }

  stop(): void {
    if (this.receiptTimer) clearTimeout(this.receiptTimer);
    this.receiptTimer = null;
  }
}
