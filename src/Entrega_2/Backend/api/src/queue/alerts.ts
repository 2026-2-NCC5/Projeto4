import type { Logger } from '../config/logger.js';
import type { NotificationService } from '../notifications/notificationService.js';
import type { QueueEventBus, QueueTicketEvent } from './eventBus.js';
import { alertCopy } from './messages.js';
import type { QueueMetrics } from './metrics.js';
import type { QueueRepository } from './repository.js';

/** Deep link aberto ao tocar na notificação (rota interna do app: Atendimento → Fila presencial). */
export const QUEUE_DEEP_LINK = 'asaconecta://atendimento/fila';
/** Canal Android criado pelo app (importância alta, vibração). */
export const QUEUE_ANDROID_CHANNEL = 'queue-alerts';

export interface QueueAlertDispatcherOptions {
  bus: QueueEventBus;
  repository: QueueRepository;
  notifications: NotificationService;
  metrics: QueueMetrics;
  logger: Logger;
  timeZone: string;
}

/**
 * Converte marcos da fila em push (Tracker → Barramento → Notificações). A chave
 * `queue:<acompanhamento>:<marco>` torna o envio idempotente mesmo se o evento se repetir.
 */
export class QueueAlertDispatcher {
  constructor(private readonly options: QueueAlertDispatcherOptions) {}

  attach(): () => void {
    return this.options.bus.on('queue.ticket', async (event) => {
      if (event.notify && event.milestone) await this.dispatch(event);
    });
  }

  async dispatch(event: QueueTicketEvent): Promise<void> {
    const { repository, notifications, metrics, logger, timeZone } = this.options;
    const milestone = event.milestone;
    if (!milestone) return;
    const sub = await repository.findById(event.subscriptionId);
    if (!sub || !sub.pushEnabled || sub.status === 'cancelled' || sub.status === 'expired') return;
    const copy = alertCopy({
      milestone,
      ticket: sub.ticket,
      ahead: event.ahead,
      desk: event.desk,
      calledAt: event.calledAt ? new Date(event.calledAt) : null,
      late: event.late,
      timeZone,
    });
    const result = await notifications.sendToUser({
      userId: sub.userId,
      category: 'queue',
      idempotencyKey: `queue:${sub.id}:${milestone}`,
      title: copy.title,
      body: copy.body,
      data: {
        type: event.type,
        subscriptionId: sub.id,
        ticket: sub.ticket,
        desk: event.desk,
        ahead: event.ahead,
        milestone,
        url: QUEUE_DEEP_LINK,
        screen: 'queue',
      },
      priority: 'high',
      channelId: QUEUE_ANDROID_CHANNEL,
      // um aviso de proximidade de 10 minutos atrás não ajuda ninguém
      ttlSeconds: milestone === 'QUEUE_CALLED' ? 30 * 60 : 10 * 60,
    });
    if (result.status === 'sent' || result.status === 'partial') metrics.queue_notifications_sent_total += 1;
    else if (result.status === 'failed') metrics.queue_notifications_failed_total += 1;
    logger.debug({ status: 'queue_alert_dispatched', subscription_id: sub.id, milestone, result: result.status }, 'queue alert dispatched');
  }
}
