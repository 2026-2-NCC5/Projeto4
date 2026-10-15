import type { Logger } from '../config/logger.js';
import type {
  QueueCallView,
  QueueHealth,
  QueueOverview,
  QueueStatus,
  QueueSubscription,
  QueueSyncInfo,
  QueueDataSource,
} from '../contracts/mobileApi.v1.js';
import { DependencyError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { estimateWait } from './estimate.js';
import type { QueueMetrics } from './metrics.js';
import type { QueueMonitor } from './monitor.js';
import type { QueueRepository } from './repository.js';
import { currentCallsByDesk, locateTicket } from './snapshot.js';
import { isValidTicket, normalizeTicket, ticketKey } from './ticket.js';
import { endOfLocalDay, localDate } from './time.js';
import type { QueueTracker } from './tracker.js';
import { ACTIVE_SUBSCRIPTION_STATUSES, type QueueCall, type QueuePreferences, type QueueSnapshot, type QueueSubscriptionRecord } from './types.js';

export interface QueueServiceOptions {
  enabled: boolean;
  monitor: QueueMonitor;
  repository: QueueRepository;
  tracker: QueueTracker;
  metrics: QueueMetrics;
  logger: Logger;
  timeZone: string;
  /** snapshot mais velho que isto é exibido como "desatualizado" */
  staleAfterMs: number;
  now?: () => Date;
  // ---- platform: origem dos dados (simulador identificado × painel público) e autorização institucional
  source?: QueueDataSource;
}

const DEFAULT_PREFERENCES: QueuePreferences = { pushEnabled: true, voiceEnabled: true, vibrationEnabled: true };

const callView = (call: QueueCall): QueueCallView => ({ ticket: call.ticket, desk: call.desk, calledAt: call.calledAt, serviceStatus: call.serviceStatus });

/**
 * Regras de leitura e escrita da fila para a API. O vínculo aluno ↔ senha só existe aqui dentro:
 * as respostas trazem apenas o acompanhamento do próprio usuário autenticado.
 */
export class QueueService {
  private readonly now: () => Date;

  constructor(private readonly options: QueueServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  private snapshot(): QueueSnapshot | null {
    return this.options.enabled ? this.options.monitor.getSnapshot() : null;
  }

  sync(): QueueSyncInfo {
    const pollIntervalSeconds = Math.round(this.options.monitor.pollIntervalMs / 1000);
    const source = this.options.source ? { source: this.options.source } : {};
    if (!this.options.enabled) return { status: 'disabled', lastSuccessfulSyncAt: null, snapshotAgeSeconds: null, pollIntervalSeconds, ...source };
    const health = this.options.monitor.health();
    const snapshot = this.snapshot();
    const lastSuccess = health.lastSuccessAt ?? (snapshot ? new Date(snapshot.capturedAt) : null);
    const age = lastSuccess ? Math.max(0, Math.round((this.now().getTime() - lastSuccess.getTime()) / 1000)) : null;
    let status: QueueSyncInfo['status'];
    if (health.consecutiveFailures > 0) status = 'unavailable';
    else if (!lastSuccess) status = 'starting';
    else if (age !== null && age * 1000 > this.options.staleAfterMs) status = 'stale';
    else status = 'live';
    return { status, lastSuccessfulSyncAt: lastSuccess?.toISOString() ?? null, snapshotAgeSeconds: age, pollIntervalSeconds, ...source };
  }

  overview(): QueueOverview {
    const snapshot = this.snapshot();
    const sync = this.sync();
    if (!snapshot) {
      return { status: sync.status === 'unavailable' ? 'unavailable' : null, latestCall: null, currentCalls: [], recentCalls: [], upcoming: [], upcomingCount: null, sync };
    }
    return {
      status: snapshot.status,
      latestCall: snapshot.calls[0] ? callView(snapshot.calls[0]) : null,
      currentCalls: currentCallsByDesk(snapshot).map(callView),
      recentCalls: snapshot.calls.slice(0, 8).map(callView),
      upcoming: snapshot.upcoming.slice(0, 10).map((item) => ({ ticket: item.ticket, position: item.position })),
      upcomingCount: snapshot.upcomingComplete ? snapshot.upcoming.length : null,
      sync,
    };
  }

  private async subscriptionView(sub: QueueSubscriptionRecord): Promise<QueueSubscription> {
    const snapshot = this.snapshot();
    const location = snapshot ? locateTicket(snapshot, sub.ticket) : { kind: 'not_found' as const };
    const live = location.kind === 'waiting' && sub.status !== 'called' ? location : null;
    const ahead = live ? live.ahead : sub.ahead;
    const waiting = sub.status === 'waiting' || sub.status === 'approaching' || sub.status === 'next';
    const estimate = waiting && live && snapshot ? estimateWait(snapshot.calls, live.ahead, this.now()) : null;
    const timeline = await this.options.repository.listTimeline(sub.id);
    return {
      id: sub.id,
      ticket: sub.ticket,
      status: sub.status,
      position: live ? live.position : sub.position,
      ahead,
      positionKnown: live !== null,
      calledDesk: sub.calledDesk,
      calledAt: sub.calledAt?.toISOString() ?? null,
      alreadyCalled: sub.alreadyCalled,
      lastAlert: sub.lastAlert,
      estimate: estimate
        ? { minMinutes: estimate.minMinutes, maxMinutes: estimate.maxMinutes, confidence: estimate.confidence, basedOnCalls: estimate.basedOnCalls, activeDesks: estimate.activeDesks }
        : null,
      preferences: { pushEnabled: sub.pushEnabled, voiceEnabled: sub.voiceEnabled, vibrationEnabled: sub.vibrationEnabled },
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
      timeline: timeline.map((event) => ({ type: event.type, at: event.occurredAt.toISOString(), ahead: event.ahead, desk: event.desk })),
    };
  }

  private today(): string {
    return localDate(this.now(), this.options.timeZone);
  }

  async currentRecord(userId: string): Promise<QueueSubscriptionRecord | null> {
    return this.options.repository.findCurrent(userId, this.today());
  }

  /** true quando há uma senha sendo acompanhada agora (contexto para o assistente). */
  async isTracking(userId: string): Promise<boolean> {
    const sub = await this.currentRecord(userId);
    return sub !== null && ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
  }

  async current(userId: string): Promise<QueueSubscription | null> {
    const sub = await this.currentRecord(userId);
    return sub ? this.subscriptionView(sub) : null;
  }

  async status(userId: string): Promise<QueueStatus> {
    return { queue: this.overview(), subscription: await this.current(userId), serverTime: this.now().toISOString() };
  }

  /** Começa a acompanhar uma senha do dia (substitui o acompanhamento ativo anterior). */
  async subscribe(userId: string, input: { ticket: string } & Partial<QueuePreferences>, logger: Logger): Promise<QueueStatus> {
    if (!this.options.enabled) throw new DependencyError('O acompanhamento da fila presencial não está disponível no momento.', undefined, 'queue_disabled');
    const typed = normalizeTicket(input.ticket);
    if (!isValidTicket(typed)) throw new ValidationError('Digite uma senha válida.', [{ field: 'ticket', message: 'Digite uma senha válida.' }], { reason: 'invalid_ticket' });
    // "29" digitado vira "0029" quando a senha já aparece no painel (exibição igual à da fonte).
    const snapshot = this.snapshot();
    const location = snapshot ? locateTicket(snapshot, typed) : { kind: 'not_found' as const };
    const ticket = location.kind === 'called' ? location.call.ticket : location.kind === 'waiting' ? (snapshot?.upcoming[location.ahead]?.ticket ?? typed) : typed;
    const now = this.now();
    const serviceDate = localDate(now, this.options.timeZone);
    const { subscription, replaced } = await this.options.repository.createSubscription({
      userId,
      ticket,
      ticketKey: ticketKey(ticket),
      serviceDate,
      expiresAt: endOfLocalDay(serviceDate, this.options.timeZone),
      preferences: {
        pushEnabled: input.pushEnabled ?? DEFAULT_PREFERENCES.pushEnabled,
        voiceEnabled: input.voiceEnabled ?? DEFAULT_PREFERENCES.voiceEnabled,
        vibrationEnabled: input.vibrationEnabled ?? DEFAULT_PREFERENCES.vibrationEnabled,
      },
      now,
    });
    if (replaced) await this.options.repository.addTimelineEvent({ subscriptionId: replaced.id, type: 'cancelled', ahead: null, desk: null, occurredAt: now });
    await this.options.repository.addTimelineEvent({ subscriptionId: subscription.id, type: 'subscribed', ahead: null, desk: null, occurredAt: now });
    // Posição imediata (sem esperar o próximo ciclo do monitor); marcos já atingidos não viram push.
    await this.options.tracker.evaluateOne(subscription, snapshot, { initial: true });
    logger.info({ status: 'queue_subscription_created', subscription_id: subscription.id, replaced: Boolean(replaced) }, 'queue subscription created');
    return this.status(userId);
  }

  async updatePreferences(userId: string, preferences: Partial<QueuePreferences>): Promise<QueueSubscription> {
    const updated = await this.options.repository.updatePreferences(userId, this.today(), preferences, this.now());
    if (!updated) throw new NotFoundError('Nenhuma senha sendo acompanhada.');
    return this.subscriptionView(updated);
  }

  async cancel(userId: string, logger: Logger): Promise<void> {
    const now = this.now();
    const cancelled = await this.options.repository.cancelActive(userId, now);
    if (!cancelled) return;
    await this.options.repository.addTimelineEvent({ subscriptionId: cancelled.id, type: 'cancelled', ahead: null, desk: null, occurredAt: now });
    logger.info({ status: 'queue_subscription_cancelled', subscription_id: cancelled.id }, 'queue subscription cancelled');
  }

  health(): { body: QueueHealth; httpStatus: number } {
    const monitor = this.options.monitor.health();
    const sync = this.sync();
    let status: QueueHealth['status'];
    if (!this.options.enabled) status = 'disabled';
    else if (sync.status === 'live') status = 'healthy';
    else if (this.snapshot() || sync.status === 'starting') status = 'degraded';
    else status = 'unhealthy';
    return {
      httpStatus: status === 'unhealthy' ? 503 : 200,
      body: {
        status,
        provider: monitor.provider,
        leader: monitor.leader,
        lastSuccessfulSync: sync.lastSuccessfulSyncAt,
        snapshotAgeSeconds: sync.snapshotAgeSeconds,
        consecutiveFailures: monitor.consecutiveFailures,
        circuit: monitor.circuit,
        pollIntervalSeconds: sync.pollIntervalSeconds,
        metrics: this.options.metrics.toJSON(sync.snapshotAgeSeconds),
      },
    };
  }
}
