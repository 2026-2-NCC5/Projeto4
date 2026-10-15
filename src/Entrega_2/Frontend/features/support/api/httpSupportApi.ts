import { request } from '../../../services/apiClient';
import type {
  SupportAttachmentLink,
  SupportCatalog,
  SupportNotificationList,
  SupportOverview,
  SupportTicket,
  SupportTicketList,
  SupportUpload,
} from '../../../types/api';
import { SUPPORT, SUPPORT_ROUTES } from '../config';

import type { ListTicketsParams, SupportApi } from './types';

/** Envio de arquivo (até 5 MB em base64) tem tempo limite próprio, maior que o das chamadas comuns. */
const UPLOAD_TIMEOUT_MS = 60_000;

export function ticketsQuery(params: ListTicketsParams): string {
  const query: string[] = [];
  if (params.statuses && params.statuses.length > 0) query.push(`status=${encodeURIComponent(params.statuses.join(','))}`);
  const search = params.search?.trim();
  if (search) query.push(`search=${encodeURIComponent(search)}`);
  query.push(`limit=${params.limit ?? SUPPORT.PAGE_SIZE}`);
  if (params.cursor) query.push(`cursor=${encodeURIComponent(params.cursor)}`);
  return `${SUPPORT_ROUTES.tickets}?${query.join('&')}`;
}

/** Atendimento pela API Node.js (o estudante é sempre o da sessão; nada de studentId no corpo). */
export const httpSupportApi: SupportApi = {
  mode: 'api',
  getCatalog: () => request<SupportCatalog>(SUPPORT_ROUTES.catalog),
  getOverview: () => request<SupportOverview>(SUPPORT_ROUTES.overview),
  listTickets: (params) => request<SupportTicketList>(ticketsQuery(params)),
  getTicket: (id) => request<SupportTicket>(SUPPORT_ROUTES.ticket(id)),
  createTicket: (body) => request<SupportTicket>(SUPPORT_ROUTES.tickets, { method: 'POST', body }),
  sendMessage: (id, body) => request<SupportTicket>(SUPPORT_ROUTES.messages(id), { method: 'POST', body }),
  markRead: (id) => request<SupportTicket>(SUPPORT_ROUTES.read(id), { method: 'POST' }),
  cancelTicket: (id, body) => request<SupportTicket>(SUPPORT_ROUTES.cancel(id), { method: 'POST', body }),
  reopenTicket: (id, body) => request<SupportTicket>(SUPPORT_ROUTES.reopen(id), { method: 'POST', body }),
  rateTicket: (id, body) => request<SupportTicket>(SUPPORT_ROUTES.rating(id), { method: 'POST', body }),
  uploadFile: (body, options) =>
    request<SupportUpload>(SUPPORT_ROUTES.uploads, { method: 'POST', body, timeoutMs: UPLOAD_TIMEOUT_MS, ...(options?.signal ? { signal: options.signal } : {}) }),
  deleteUpload: (id) => request<void>(SUPPORT_ROUTES.upload(id), { method: 'DELETE' }),
  getAttachmentLink: (ticketId, attachmentId) => request<SupportAttachmentLink>(SUPPORT_ROUTES.attachmentLink(ticketId, attachmentId)),
  getNotifications: (limit = 20) => request<SupportNotificationList>(`${SUPPORT_ROUTES.notifications}?limit=${limit}`),
  markNotificationsRead: (ids) => request<SupportNotificationList>(SUPPORT_ROUTES.notificationsRead, { method: 'POST', body: ids && ids.length > 0 ? { ids } : {} }),
};
