import { getApiClientConfig, request } from '../../../services/apiClient';
import type {
  PushPlatform,
  QueuePreferencesRequest,
  QueueStatus,
  QueueSubscribeRequest,
  QueueSubscription,
  QueueSyncEvent,
  QueueTicketRealtimeEvent,
} from '../../../types/api';
import { QUEUE, QUEUE_ROUTES } from '../config';

import { createMockQueueClient } from './mockQueueClient';
import { openQueueStream } from './queueRealtime';

export type QueueRealtimeEvent =
  | { type: 'queue.status'; status: QueueStatus }
  | { type: 'queue.sync'; sync: QueueSyncEvent }
  | { type: 'queue.ticket'; event: QueueTicketRealtimeEvent };

export interface QueueStreamListener {
  onOpen: () => void;
  onEvent: (event: QueueRealtimeEvent) => void;
  onClose: (error: boolean) => void;
}

export type MockScenario = 'empty' | 'waiting' | '5_ahead' | '3_ahead' | 'next' | 'called' | 'completed' | 'offline' | 'progression';

/** Comunicação com o backend da fila (ou a simulação local). */
export interface QueueClient {
  readonly kind: 'api' | 'mock';
  getStatus(): Promise<QueueStatus>;
  subscribe(body: QueueSubscribeRequest): Promise<QueueStatus>;
  cancel(): Promise<void>;
  updatePreferences(body: QueuePreferencesRequest): Promise<QueueSubscription>;
  /** null quando não há como abrir o canal agora (ex.: sem token) */
  openStream(listener: QueueStreamListener): { close(): void } | null;
  registerPushToken(token: string, platform: PushPlatform): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;
  /** controle da simulação (fila local ou provider mock do backend em desenvolvimento) */
  simulate(control: { scenario?: MockScenario; advance?: boolean }): Promise<{ scenario: string }>;
}

function parseEvent(event: string, data: string): QueueRealtimeEvent | null {
  try {
    const payload = JSON.parse(data) as unknown;
    if (event === 'queue.status') return { type: 'queue.status', status: payload as QueueStatus };
    if (event === 'queue.sync') return { type: 'queue.sync', sync: payload as QueueSyncEvent };
    if (event.startsWith('queue.ticket.')) return { type: 'queue.ticket', event: payload as QueueTicketRealtimeEvent };
  } catch {
    // mensagem malformada: ignorada (o próximo queue.status corrige o estado)
  }
  return null;
}

export const apiQueueClient: QueueClient = {
  kind: 'api',
  getStatus: () => request<QueueStatus>(QUEUE_ROUTES.status),
  subscribe: (body) => request<QueueStatus>(QUEUE_ROUTES.subscriptions, { method: 'POST', body }),
  cancel: () => request<void>(QUEUE_ROUTES.current, { method: 'DELETE' }),
  updatePreferences: (body) => request<QueueSubscription>(QUEUE_ROUTES.current, { method: 'PATCH', body }),
  openStream(listener) {
    const config = getApiClientConfig();
    const token = config?.getAccessToken();
    if (!config || !token) return null;
    return openQueueStream(`${config.baseUrl}${QUEUE_ROUTES.stream}`, token, {
      onOpen: listener.onOpen,
      onMessage: (message) => {
        const event = parseEvent(message.event, message.data);
        if (event) listener.onEvent(event);
      },
      onClose: ({ error }) => listener.onClose(error),
    });
  },
  registerPushToken: (token, platform) => request<void>(QUEUE_ROUTES.pushToken, { method: 'POST', body: { token, platform } }),
  unregisterPushToken: (token) => request<void>(QUEUE_ROUTES.pushToken, { method: 'DELETE', body: { token } }),
  simulate: (control) => request<{ scenario: string }>(QUEUE_ROUTES.devMock, { method: 'POST', body: control }),
};

let mockClient: QueueClient | null = null;

/** Cliente real por padrão; a simulação local só com EXPO_PUBLIC_USE_MOCK_QUEUE=true. */
export function getQueueClient(): QueueClient {
  if (!QUEUE.USE_MOCK) return apiQueueClient;
  mockClient ??= createMockQueueClient();
  return mockClient;
}
