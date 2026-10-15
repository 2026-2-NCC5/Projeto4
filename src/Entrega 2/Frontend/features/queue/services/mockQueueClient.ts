import type {
  QueueAlertMilestone,
  QueueCallView,
  QueueDataSource,
  QueueStatus,
  QueueSubscription,
  QueueSubscriptionStatus,
  QueueTimelineEntry,
} from '../../../types/api';
import { QUEUE } from '../config';
import { milestoneRank } from '../state/alerts';

import type { MockScenario, QueueClient, QueueStreamListener } from './queueClient';

const FIRST = 15;
const LAST = 36;
/** Última senha chamada em cada cenário (a senha de referência 0029 fica com N senhas à frente). */
const LAST_CALLED: Record<Exclude<MockScenario, 'offline' | 'progression'>, number | null> = {
  empty: null,
  waiting: 21,
  '5_ahead': 23,
  '3_ahead': 25,
  next: 27,
  called: 29,
  completed: 31,
};

const pad = (value: number) => String(value).padStart(4, '0');
const deskOf = (value: number) => (value % 2 === 0 ? 'Mesa 01' : 'Mesa 03');

interface MockSubscription {
  id: string;
  ticket: string;
  createdAt: number;
  preferences: QueueSubscription['preferences'];
  lastAlert: QueueAlertMilestone | null;
  calledAt: number | null;
  timeline: QueueTimelineEntry[];
  cancelled: boolean;
}

function milestoneFor(ahead: number): QueueAlertMilestone | null {
  if (ahead <= 1) return 'QUEUE_NEXT';
  if (ahead <= 3) return 'QUEUE_3_AHEAD';
  if (ahead <= 5) return 'QUEUE_5_AHEAD';
  return null;
}

/**
 * Fila simulada no aparelho (EXPO_PUBLIC_USE_MOCK_QUEUE=true). Mesmas regras do backend: posição pela
 * lista de próximas senhas, marcos que só avançam e duas mesas em paralelo. `progression` chama uma
 * senha a cada QUEUE.MOCK_STEP_MS enquanto a tela está conectada (0026 → 0027 → 0028 → 0029).
 */
export function createMockQueueClient(options: { now?: () => number; stepMs?: number; source?: QueueDataSource | null } = {}): QueueClient {
  const now = options.now ?? Date.now;
  // a simulação local é sempre DEMONSTRAÇÃO (dados fictícios), como o simulador do backend
  const source: QueueDataSource | null = options.source === undefined ? { kind: 'demo', label: 'Simulação local — dados fictícios de demonstração', authorized: true } : options.source;
  let scenario: MockScenario = 'progression';
  let lastCalled: number | null = LAST_CALLED.waiting;
  let sourceOffline = false;
  let lastSync = now();
  let subscription: MockSubscription | null = null;
  const listeners = new Set<QueueStreamListener>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let counter = 0;

  const calls = (): QueueCallView[] => {
    if (lastCalled === null) return [];
    const list: QueueCallView[] = [];
    for (let n = lastCalled; n >= FIRST; n -= 1) {
      list.push({ ticket: pad(n), desk: deskOf(n), calledAt: new Date(now() - ((lastCalled - n) * 3 + 1) * 60_000).toISOString(), serviceStatus: n >= lastCalled - 1 ? 'in_service' : 'completed' });
    }
    return list;
  };
  const upcoming = () => (lastCalled === null ? [] : Array.from({ length: LAST - lastCalled }, (_, index) => ({ ticket: pad(lastCalled! + 1 + index), position: index + 1 })));

  const addEvent = (sub: MockSubscription, type: QueueTimelineEntry['type'], ahead: number | null, desk: string | null) => {
    if (!sub.timeline.some((entry) => entry.type === type)) sub.timeline.push({ type, at: new Date(now()).toISOString(), ahead, desk });
  };

  const subscriptionView = (): QueueSubscription | null => {
    const sub = subscription;
    if (!sub || sub.cancelled) return null;
    const number = Number(sub.ticket);
    const waitingIndex = upcoming().findIndex((item) => item.ticket === sub.ticket);
    let status: QueueSubscriptionStatus = 'waiting';
    let ahead: number | null = null;
    let position: number | null = null;
    let desk: string | null = null;
    if (lastCalled !== null && Number.isFinite(number) && calls().some((call) => call.ticket === sub.ticket)) {
      sub.calledAt ??= now();
      status = scenario === 'completed' ? 'completed' : 'called';
      desk = deskOf(number);
      if (milestoneRank('QUEUE_CALLED') > milestoneRank(sub.lastAlert)) {
        sub.lastAlert = 'QUEUE_CALLED';
        addEvent(sub, 'QUEUE_CALLED', null, desk);
      }
      if (status === 'completed') addEvent(sub, 'completed', null, desk);
    } else if (waitingIndex >= 0) {
      ahead = waitingIndex;
      position = waitingIndex + 1;
      status = ahead <= 1 ? 'next' : ahead <= 5 ? 'approaching' : 'waiting';
      const milestone = milestoneFor(ahead);
      if (milestone && milestoneRank(milestone) > milestoneRank(sub.lastAlert)) {
        sub.lastAlert = milestone;
        addEvent(sub, milestone, ahead, null);
      }
    }
    const span = calls().slice(0, 10);
    const estimate =
      ahead !== null && span.length >= 4
        ? { minMinutes: Math.max(1, Math.floor((ahead + 1) * 3 * 0.75)), maxMinutes: Math.ceil((ahead + 1) * 3 * 1.3) + 1, confidence: 'low' as const, basedOnCalls: span.length, activeDesks: 2 }
        : null;
    return {
      id: sub.id,
      ticket: sub.ticket,
      status,
      position,
      ahead,
      positionKnown: waitingIndex >= 0,
      calledDesk: desk,
      calledAt: sub.calledAt ? new Date(sub.calledAt).toISOString() : null,
      alreadyCalled: false,
      lastAlert: sub.lastAlert,
      estimate: sourceOffline ? null : estimate,
      preferences: sub.preferences,
      createdAt: new Date(sub.createdAt).toISOString(),
      updatedAt: new Date(now()).toISOString(),
      expiresAt: new Date(now() + 6 * 3600_000).toISOString(),
      timeline: [...sub.timeline],
    };
  };

  const status = (): QueueStatus => {
    const list = calls();
    const byDesk = ['Mesa 03', 'Mesa 01'].map((desk) => list.find((call) => call.desk === desk)).filter((call): call is QueueCallView => Boolean(call));
    if (!sourceOffline) lastSync = now();
    const age = Math.round((now() - lastSync) / 1000);
    return {
      queue: {
        status: list.length > 0 ? 'open' : 'empty',
        latestCall: list[0] ?? null,
        currentCalls: byDesk.sort((a, b) => Date.parse(b.calledAt ?? '') - Date.parse(a.calledAt ?? '')),
        recentCalls: list.slice(0, 8),
        upcoming: upcoming().slice(0, 10),
        upcomingCount: upcoming().length,
        sync: { status: sourceOffline ? 'unavailable' : 'live', lastSuccessfulSyncAt: new Date(lastSync).toISOString(), snapshotAgeSeconds: age, pollIntervalSeconds: 10, ...(source ? { source } : {}) },
      },
      subscription: subscriptionView(),
      serverTime: new Date(now()).toISOString(),
    };
  };

  const broadcast = () => {
    const snapshot = status();
    for (const listener of listeners) listener.onEvent({ type: 'queue.status', status: snapshot });
  };

  const step = () => {
    if (scenario !== 'progression' || sourceOffline || lastCalled === null) return;
    lastCalled = Math.min(lastCalled + 1, LAST);
    broadcast();
  };

  const ensureTimer = () => {
    if (listeners.size > 0 && !timer) timer = setInterval(step, options.stepMs ?? QUEUE.MOCK_STEP_MS);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    kind: 'mock',
    getStatus: async () => status(),
    async subscribe(body) {
      counter += 1;
      const ticket = /^\d{1,3}$/.test(body.ticket.trim()) ? body.ticket.trim().padStart(4, '0') : body.ticket.trim().toUpperCase();
      subscription = {
        id: `mock-sub-${counter}`,
        ticket,
        createdAt: now(),
        preferences: { pushEnabled: body.pushEnabled ?? true, voiceEnabled: body.voiceEnabled ?? true, vibrationEnabled: body.vibrationEnabled ?? true },
        lastAlert: null,
        calledAt: null,
        timeline: [{ type: 'subscribed', at: new Date(now()).toISOString(), ahead: null, desk: null }],
        cancelled: false,
      };
      return status();
    },
    async cancel() {
      if (subscription) subscription.cancelled = true;
      broadcast();
    },
    async updatePreferences(body) {
      if (!subscription || subscription.cancelled) throw new Error('Nenhuma senha sendo acompanhada.');
      subscription.preferences = { ...subscription.preferences, ...body };
      return subscriptionView()!;
    },
    openStream(listener) {
      listeners.add(listener);
      ensureTimer();
      setTimeout(() => {
        listener.onOpen();
        listener.onEvent({ type: 'queue.status', status: status() });
      }, 0);
      return {
        close() {
          listeners.delete(listener);
          ensureTimer();
        },
      };
    },
    registerPushToken: async () => undefined,
    unregisterPushToken: async () => undefined,
    async simulate(control) {
      if (control.scenario) {
        scenario = control.scenario;
        sourceOffline = scenario === 'offline';
        if (scenario !== 'offline' && scenario !== 'progression') lastCalled = LAST_CALLED[scenario];
        if (scenario === 'progression') lastCalled = LAST_CALLED.waiting;
      }
      if (control.advance && lastCalled !== null) {
        scenario = 'progression';
        sourceOffline = false;
        lastCalled = Math.min(lastCalled + 1, LAST);
      }
      broadcast();
      return { scenario };
    },
  };
}
