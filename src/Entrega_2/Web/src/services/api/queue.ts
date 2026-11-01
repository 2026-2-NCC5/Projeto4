import { api } from './client';
import type { QueueStatus, QueueSubscription, QueueSubscribeRequest, QueuePreferencesRequest } from '@/types/api';

/** Contrato compartilhado com o app mobile; o estudante vem sempre da sessão ASA autenticada. */
export const queueApi = {
  status: () => api.get<QueueStatus>('/api/queue/status'),
  subscribe: (body: QueueSubscribeRequest) => api.post<QueueStatus>('/api/queue/subscriptions', body),
  updatePreferences: (body: QueuePreferencesRequest) => api.patch<QueueSubscription>('/api/queue/subscriptions/current', body),
  cancel: () => api.delete<void>('/api/queue/subscriptions/current'),
};
