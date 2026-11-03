import { api } from '@/services/api/client';
import type {
  SupportAttachmentReviewRequest,
  SupportChannelConnectResult,
  SupportChannelCreateRequest,
  SupportChannelList,
  SupportChannelPatchRequest,
  SupportChannelView,
  SupportContactReviewDecisionRequest,
  SupportContactReviewList,
  SupportEventFeed,
  SupportInboxCounts,
  SupportPresenceView,
  SupportProviderHealth,
  SupportSavedReply,
  SupportSavedReplyList,
  SupportSavedReplyRequest,
  SupportSimulatorConnectionRequest,
  SupportSimulatorDeliveryRequest,
  SupportSimulatorInboundRequest,
  SupportSimulatorNextSendRequest,
  SupportStaffReopenRequest,
  SupportStaffTicket,
  SupportTagList,
  SupportTicketTransferRequest,
  SupportWhatsAppMetrics,
  SupportWhatsAppStatus,
} from '@/types/api';

const enc = encodeURIComponent;
/** Maior que a espera do servidor (25 s): quem encerra a chamada longa é ele, não o cliente. */
const LONG_POLL_TIMEOUT_MS = 40_000;

/** Central de Atendimento (equipe). O portal nunca fala com o provedor: só com esta API. */
export const centralApi = {
  events: (input: { since?: string | null; wait?: number; signal?: AbortSignal }) =>
    api.get<SupportEventFeed>('/api/support/staff/events', { query: { since: input.since ?? undefined, wait: input.wait ?? 0 }, timeoutMs: LONG_POLL_TIMEOUT_MS, ...(input.signal ? { signal: input.signal } : {}) }),
  status: () => api.get<SupportWhatsAppStatus>('/api/support/staff/whatsapp/status'),
  counts: () => api.get<SupportInboxCounts>('/api/support/staff/inbox/counts'),
  metrics: () => api.get<SupportWhatsAppMetrics>('/api/support/staff/whatsapp/metrics'),
  presence: (ticketId: string, composing: boolean) => api.post<SupportPresenceView>(`/api/support/staff/tickets/${enc(ticketId)}/presence`, { composing }),
  retry: (ticketId: string, messageId: string, confirmDuplicateRisk: boolean) => api.post<{ messageId: string; deliveryState: string }>(`/api/support/staff/tickets/${enc(ticketId)}/messages/${enc(messageId)}/retry`, confirmDuplicateRisk ? { confirmDuplicateRisk } : {}),
  transfer: (ticketId: string, body: SupportTicketTransferRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(ticketId)}/transfer`, body),
  reopen: (ticketId: string, body: SupportStaffReopenRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(ticketId)}/reopen`, body),
  reviewAttachment: (ticketId: string, attachmentId: string, body: SupportAttachmentReviewRequest) => api.patch<SupportStaffTicket>(`/api/support/staff/tickets/${enc(ticketId)}/attachments/${enc(attachmentId)}`, body),
  setTags: (ticketId: string, tags: string[]) => api.put<{ tags: string[] }>(`/api/support/staff/tickets/${enc(ticketId)}/tags`, { tags }),
  tags: () => api.get<SupportTagList>('/api/support/staff/tags'),
  savedReplies: () => api.get<SupportSavedReplyList>('/api/support/staff/saved-replies'),
  createSavedReply: (body: SupportSavedReplyRequest) => api.post<SupportSavedReply>('/api/support/staff/saved-replies', body),
};

/** Administração do canal: conexão, QR e saúde. Nada aqui lê conversas. */
export const channelAdminApi = {
  list: () => api.get<SupportChannelList>('/api/admin/support/channels'),
  create: (body: SupportChannelCreateRequest) => api.post<SupportChannelView>('/api/admin/support/channels', body),
  patch: (id: string, body: SupportChannelPatchRequest) => api.patch<SupportChannelView>(`/api/admin/support/channels/${enc(id)}`, body),
  status: (id: string) => api.get<SupportChannelView>(`/api/admin/support/channels/${enc(id)}/status`),
  connect: (id: string) => api.post<SupportChannelConnectResult>(`/api/admin/support/channels/${enc(id)}/connect`),
  disconnect: (id: string) => api.delete<SupportChannelView>(`/api/admin/support/channels/${enc(id)}/connection`),
  health: () => api.get<SupportProviderHealth>('/api/admin/support/provider-health'),
  replayInbox: () => api.post<{ replayed: number }>('/api/admin/support/inbox/replay'),
  reviews: () => api.get<SupportContactReviewList>('/api/admin/support/contact-reviews'),
  decideReview: (id: string, body: SupportContactReviewDecisionRequest) => api.post<{ decided: boolean }>(`/api/admin/support/contact-reviews/${enc(id)}/decision`, body),
  simulateInbound: (body: SupportSimulatorInboundRequest) => api.post<{ received: number; duplicates: number }>('/api/admin/support/simulator/inbound', body),
  simulateDelivery: (body: SupportSimulatorDeliveryRequest) => api.post<{ received: number }>('/api/admin/support/simulator/delivery', body),
  simulateConnection: (body: SupportSimulatorConnectionRequest) => api.post<{ received: number }>('/api/admin/support/simulator/connection', body),
  simulateNextSend: (body: SupportSimulatorNextSendRequest) => api.post<{ mode: string | null }>('/api/admin/support/simulator/next-send', body),
};

export const centralKeys = {
  status: ['central', 'status'] as const,
  counts: ['central', 'counts'] as const,
  metrics: ['central', 'metrics'] as const,
  savedReplies: ['central', 'saved-replies'] as const,
  tags: ['central', 'tags'] as const,
  channels: ['admin', 'support-channels'] as const,
  health: ['admin', 'support-health'] as const,
  reviews: ['admin', 'support-reviews'] as const,
};
