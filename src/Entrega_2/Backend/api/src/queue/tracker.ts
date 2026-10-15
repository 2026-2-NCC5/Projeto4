import type { Logger } from '../config/logger.js';
import { evaluateSubscription, isNewerMilestone, type Evaluation } from './evaluation.js';
import type { QueueEventBus, QueueTicketEvent, QueueTicketEventType } from './eventBus.js';
import type { QueueRepository } from './repository.js';
import type { QueueAlertMilestone, QueueSnapshot, QueueSubscriptionRecord } from './types.js';

export interface QueueTrackerOptions {
  repository: QueueRepository;
  bus: QueueEventBus;
  logger: Logger;
  timeZone: string;
  now?: () => Date;
  completionGraceMs?: number;
  /** chamada detectada mais de X ms depois de acontecer → push no passado ("foi chamada às 20:53") */
  lateCallMs?: number;
}

const MILESTONE_EVENT: Record<QueueAlertMilestone, QueueTicketEventType> = {
  QUEUE_5_AHEAD: 'queue.ticket.approaching',
  QUEUE_3_AHEAD: 'queue.ticket.approaching',
  QUEUE_NEXT: 'queue.ticket.next',
  QUEUE_CALLED: 'queue.ticket.called',
};

function sameEvaluation(sub: QueueSubscriptionRecord, ev: Evaluation): boolean {
  return (
    sub.status === ev.status &&
    sub.position === ev.position &&
    sub.ahead === ev.ahead &&
    sub.calledDesk === ev.calledDesk &&
    (sub.calledAt?.getTime() ?? null) === (ev.calledAt?.getTime() ?? null) &&
    sub.callSourceId === ev.callSourceId &&
    sub.alreadyCalled === ev.alreadyCalled
  );
}

/**
 * Reavalia cada acompanhamento ativo contra o snapshot (somente na instância líder).
 *
 * Idempotência dos alertas: o marco só avança para um mais urgente via compare-and-set no banco
 * (`advanceAlert`), e cada marco vira no máximo um evento na linha do tempo. Repetir o snapshot,
 * reiniciar o monitor ou ter duas instâncias nunca gera "É a sua vez!" duas vezes. Saltos
 * (7 → 1 à frente) disparam só o alerta mais urgente.
 */
export class QueueTracker {
  private readonly now: () => Date;
  private evaluating: Promise<void> | null = null;

  constructor(private readonly options: QueueTrackerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  attach(): () => void {
    return this.options.bus.on('queue.updated', async ({ snapshot, source }) => {
      if (source !== 'leader') return;
      await this.evaluateAll(snapshot);
    });
  }

  /** Avalia todos os acompanhamentos ativos (um ciclo por vez; ciclos sobrepostos aguardam). */
  async evaluateAll(snapshot: QueueSnapshot | null): Promise<void> {
    if (this.evaluating) await this.evaluating.catch(() => undefined);
    this.evaluating = (async () => {
      const active = await this.options.repository.listActive();
      for (const sub of active) {
        try {
          await this.evaluateOne(sub, snapshot);
        } catch (error) {
          this.options.logger.error({ status: 'queue_evaluation_failed', subscription_id: sub.id, error_message: error instanceof Error ? error.message : 'unknown' }, 'queue subscription evaluation failed');
        }
      }
    })();
    try {
      await this.evaluating;
    } finally {
      this.evaluating = null;
    }
  }

  /**
   * Avalia um acompanhamento. `initial`: avaliação no cadastro — o estudante está olhando a tela,
   * então marcos de proximidade são registrados sem push; só uma chamada recente notifica.
   */
  async evaluateOne(sub: QueueSubscriptionRecord, snapshot: QueueSnapshot | null, options: { initial?: boolean } = {}): Promise<QueueSubscriptionRecord> {
    const { repository, bus, logger, timeZone } = this.options;
    const now = this.now();
    const ev = evaluateSubscription(sub, snapshot, { now, timeZone, completionGraceMs: this.options.completionGraceMs });
    const ended = ev.status === 'completed' || ev.status === 'expired';
    const patch = {
      status: ev.status,
      position: ev.position,
      ahead: ev.ahead,
      calledDesk: ev.calledDesk,
      calledAt: ev.calledAt,
      callSourceId: ev.callSourceId,
      alreadyCalled: ev.alreadyCalled,
      endedAt: ended ? (sub.endedAt ?? now) : sub.endedAt,
    };
    if (!sameEvaluation(sub, ev)) await repository.applyEvaluation(sub.id, { ...patch, now });
    const updated: QueueSubscriptionRecord = { ...sub, ...patch, updatedAt: now };
    const event = (type: QueueTicketEventType, extra: Partial<QueueTicketEvent> = {}): QueueTicketEvent => ({
      type,
      userId: sub.userId,
      subscriptionId: sub.id,
      ticket: sub.ticket,
      status: updated.status,
      position: updated.position,
      ahead: updated.ahead,
      desk: updated.calledDesk,
      calledAt: updated.calledAt?.toISOString() ?? null,
      milestone: null,
      notify: false,
      late: false,
      occurredAt: now.toISOString(),
      ...extra,
    });

    if (ev.status === 'expired' && sub.status !== 'expired') {
      await repository.addTimelineEvent({ subscriptionId: sub.id, type: 'expired', ahead: null, desk: null, occurredAt: now });
      logger.info({ status: 'queue_subscription_expired', subscription_id: sub.id }, 'queue subscription expired');
      bus.emit('queue.ticket', event('queue.ticket.expired'));
      return updated;
    }

    if (isNewerMilestone(ev.milestone, sub.lastAlert)) {
      const milestone = ev.milestone;
      if (await repository.advanceAlert(sub.id, sub.lastAlert, milestone, now)) {
        updated.lastAlert = milestone;
        const isCall = milestone === 'QUEUE_CALLED';
        await repository.addTimelineEvent({ subscriptionId: sub.id, type: milestone, ahead: isCall ? null : ev.ahead, desk: isCall ? ev.calledDesk : null, occurredAt: now });
        const late = isCall && !ev.alreadyCalled && ev.calledAt !== null && now.getTime() - ev.calledAt.getTime() > (this.options.lateCallMs ?? 10 * 60_000);
        const notify = isCall ? !ev.alreadyCalled : !options.initial;
        logger.info({ status: 'queue_alert_reached', subscription_id: sub.id, milestone, ahead: ev.ahead, notify, late }, 'queue alert milestone reached');
        bus.emit('queue.ticket', event(MILESTONE_EVENT[milestone], { milestone, notify, late }));
      }
    } else if (ev.positionKnown && ev.ahead !== sub.ahead) {
      bus.emit('queue.ticket', event('queue.ticket.position_changed'));
    }

    if (ev.status === 'completed' && sub.status !== 'completed') {
      await repository.addTimelineEvent({ subscriptionId: sub.id, type: 'completed', ahead: null, desk: ev.calledDesk, occurredAt: now });
      logger.info({ status: 'queue_subscription_completed', subscription_id: sub.id }, 'queue subscription completed');
      bus.emit('queue.ticket', event('queue.ticket.completed'));
    }
    return updated;
  }
}
