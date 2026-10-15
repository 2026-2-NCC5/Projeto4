import { request } from '../../services/apiClient';
import type { InboxNotificationList, InboxReadRequest } from '../../types/api';

/** Central de avisos (contrato v1.5): une avisos de chamados, agendamentos e da plataforma. */
export const NOTIFICATION_ROUTES = { inbox: '/api/notifications' } as const;

/** Quantos avisos a central carrega de uma vez. */
export const INBOX_LIMIT = 50;

/** Atualização em segundo plano da central aberta (e ao voltar para o app). */
export const INBOX_POLL_MS = 60_000;

export interface NotificationsApi {
  list(limit?: number): Promise<InboxNotificationList>;
  /**
   * Sem `ids`: marca todos como lidos. Ler aqui também marca o aviso do chamado como lido (no servidor). A resposta
   * volta no mesmo tamanho da lista da central (`?limit=`, v1.8).
   */
  markRead(ids?: string[], limit?: number): Promise<InboxNotificationList>;
}

export const httpNotificationsApi: NotificationsApi = {
  list: (limit = INBOX_LIMIT) => request<InboxNotificationList>(`${NOTIFICATION_ROUTES.inbox}?limit=${limit}`),
  markRead: (ids, limit = INBOX_LIMIT) => {
    const body: InboxReadRequest = ids && ids.length > 0 ? { read: true, ids } : { read: true };
    return request<InboxNotificationList>(`${NOTIFICATION_ROUTES.inbox}?limit=${limit}`, { method: 'PATCH', body });
  },
};

let current: NotificationsApi | null = null;

export function getNotificationsApi(): NotificationsApi {
  return current ?? httpNotificationsApi;
}

/** Substitui a implementação (testes e previews). `null` volta à API real. */
export function setNotificationsApi(api: NotificationsApi | null): void {
  current = api;
}
