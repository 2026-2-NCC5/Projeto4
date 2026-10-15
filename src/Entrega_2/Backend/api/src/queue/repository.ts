import { randomUUID } from 'node:crypto';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  type QueueAlertMilestone,
  type QueueCallHistoryRecord,
  type QueuePreferences,
  type QueueSnapshot,
  type QueueSubscriptionRecord,
  type QueueSubscriptionStatus,
  type QueueTimelineEventRecord,
} from './types.js';

export interface CreateSubscriptionInput {
  userId: string;
  ticket: string;
  ticketKey: string;
  serviceDate: string;
  expiresAt: Date;
  preferences: QueuePreferences;
  now: Date;
}

export interface EvaluationPatch {
  status: QueueSubscriptionStatus;
  position: number | null;
  ahead: number | null;
  calledDesk: string | null;
  calledAt: Date | null;
  callSourceId: string | null;
  alreadyCalled: boolean;
  endedAt: Date | null;
  now: Date;
}

export interface QueueMonitorStateRecord {
  snapshot: QueueSnapshot | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  updatedAt: Date;
}

/** Persistência da fila (acompanhamentos, linha do tempo, histórico de chamadas e estado do monitor). */
export interface QueueRepository {
  /** Encerra (cancelled) o acompanhamento ativo anterior do usuário e cria o novo, atomicamente. */
  createSubscription(input: CreateSubscriptionInput): Promise<{ subscription: QueueSubscriptionRecord; replaced: QueueSubscriptionRecord | null }>;
  /** Acompanhamento mais recente do usuário no dia (exceto cancelado). */
  findCurrent(userId: string, serviceDate: string): Promise<QueueSubscriptionRecord | null>;
  findById(id: string): Promise<QueueSubscriptionRecord | null>;
  /** Acompanhamentos ativos de qualquer dia (o tracker expira os antigos). */
  listActive(): Promise<QueueSubscriptionRecord[]>;
  applyEvaluation(id: string, patch: EvaluationPatch): Promise<void>;
  /** Avança `last_alert` de `from` para `to` só se ninguém avançou antes (compare-and-set). */
  advanceAlert(id: string, from: QueueAlertMilestone | null, to: QueueAlertMilestone, now: Date): Promise<boolean>;
  updatePreferences(userId: string, serviceDate: string, preferences: Partial<QueuePreferences>, now: Date): Promise<QueueSubscriptionRecord | null>;
  cancelActive(userId: string, now: Date): Promise<QueueSubscriptionRecord | null>;
  /** false quando o evento já existia (unique por acompanhamento + tipo). */
  addTimelineEvent(event: QueueTimelineEventRecord): Promise<boolean>;
  listTimeline(subscriptionId: string): Promise<QueueTimelineEventRecord[]>;
  /** Insere chamadas ainda não vistas; devolve quantas eram novas. */
  recordCalls(calls: QueueCallHistoryRecord[]): Promise<number>;
  saveState(state: QueueMonitorStateRecord): Promise<void>;
  loadState(): Promise<QueueMonitorStateRecord | null>;
}

const isActive = (status: QueueSubscriptionStatus) => ACTIVE_SUBSCRIPTION_STATUSES.includes(status);

/** Implementação em memória (testes e execução sem banco). */
export class MemoryQueueRepository implements QueueRepository {
  readonly subscriptions: QueueSubscriptionRecord[] = [];
  readonly events: QueueTimelineEventRecord[] = [];
  readonly calls = new Map<string, QueueCallHistoryRecord>();
  state: QueueMonitorStateRecord | null = null;

  async createSubscription(input: CreateSubscriptionInput) {
    const previous = this.subscriptions.find((sub) => sub.userId === input.userId && isActive(sub.status)) ?? null;
    if (previous) Object.assign(previous, { status: 'cancelled', endedAt: input.now, updatedAt: input.now });
    const subscription: QueueSubscriptionRecord = {
      id: randomUUID(),
      userId: input.userId,
      ticket: input.ticket,
      ticketKey: input.ticketKey,
      serviceDate: input.serviceDate,
      status: 'waiting',
      position: null,
      ahead: null,
      calledDesk: null,
      calledAt: null,
      callSourceId: null,
      alreadyCalled: false,
      lastAlert: null,
      ...input.preferences,
      createdAt: input.now,
      updatedAt: input.now,
      expiresAt: input.expiresAt,
      endedAt: null,
    };
    this.subscriptions.push(subscription);
    return { subscription: { ...subscription }, replaced: previous ? { ...previous } : null };
  }

  async findCurrent(userId: string, serviceDate: string) {
    const found = this.subscriptions
      .filter((sub) => sub.userId === userId && sub.serviceDate === serviceDate && sub.status !== 'cancelled')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return found ? { ...found } : null;
  }

  async findById(id: string) {
    const found = this.subscriptions.find((sub) => sub.id === id);
    return found ? { ...found } : null;
  }

  async listActive() {
    return this.subscriptions.filter((sub) => isActive(sub.status)).map((sub) => ({ ...sub }));
  }

  async applyEvaluation(id: string, patch: EvaluationPatch) {
    const sub = this.subscriptions.find((item) => item.id === id);
    if (!sub) return;
    const { now, ...fields } = patch;
    Object.assign(sub, fields, { updatedAt: now });
  }

  async advanceAlert(id: string, from: QueueAlertMilestone | null, to: QueueAlertMilestone, now: Date) {
    const sub = this.subscriptions.find((item) => item.id === id);
    if (!sub || sub.lastAlert !== from) return false;
    sub.lastAlert = to;
    sub.updatedAt = now;
    return true;
  }

  async updatePreferences(userId: string, serviceDate: string, preferences: Partial<QueuePreferences>, now: Date) {
    const current = await this.findCurrent(userId, serviceDate);
    const sub = current ? this.subscriptions.find((item) => item.id === current.id) : undefined;
    if (!sub) return null;
    Object.assign(sub, preferences, { updatedAt: now });
    return { ...sub };
  }

  async cancelActive(userId: string, now: Date) {
    const sub = this.subscriptions.find((item) => item.userId === userId && isActive(item.status));
    if (!sub) return null;
    Object.assign(sub, { status: 'cancelled', endedAt: now, updatedAt: now });
    return { ...sub };
  }

  async addTimelineEvent(event: QueueTimelineEventRecord) {
    if (this.events.some((item) => item.subscriptionId === event.subscriptionId && item.type === event.type)) return false;
    this.events.push({ ...event });
    return true;
  }

  async listTimeline(subscriptionId: string) {
    return this.events.filter((item) => item.subscriptionId === subscriptionId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async recordCalls(calls: QueueCallHistoryRecord[]) {
    let inserted = 0;
    for (const call of calls) {
      if (this.calls.has(call.callKey)) continue;
      this.calls.set(call.callKey, { ...call });
      inserted += 1;
    }
    return inserted;
  }

  async saveState(state: QueueMonitorStateRecord) {
    this.state = { ...state };
  }

  async loadState() {
    return this.state ? { ...this.state } : null;
  }
}
