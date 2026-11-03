import type {
  SupportAttachmentLink,
  SupportCancelRequest,
  SupportCatalog,
  SupportContactVerificationConfirmRequest,
  SupportContactVerificationCreateRequest,
  SupportContactVerificationView,
  SupportEventFeed,
  SupportMessageCreateRequest,
  SupportNotificationList,
  SupportOverview,
  SupportRatingRequest,
  SupportReopenRequest,
  SupportTicket,
  SupportTicketCreateRequest,
  SupportTicketList,
  SupportTicketStatus,
  SupportUpload,
  SupportUploadRequest,
  SupportWhatsAppLinkState,
} from '../../../types/api';

export interface ListTicketsParams {
  statuses?: readonly SupportTicketStatus[] | undefined;
  search?: string | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface SupportEventsParams {
  /** cursor salvo; sem ele o servidor devolve só o cursor atual, sem eventos */
  since?: string | null | undefined;
  /** segundos que o servidor pode segurar a resposta (long polling, até 25) */
  wait: number;
}

/**
 * Operações do Atendimento usadas pelo app. Implementadas pela API real (httpSupportApi) e pelos dados de
 * demonstração (mockSupportApi) — as telas nunca sabem qual está em uso.
 */
export interface SupportApi {
  readonly mode: 'api' | 'mock';
  getCatalog(): Promise<SupportCatalog>;
  getOverview(): Promise<SupportOverview>;
  listTickets(params: ListTicketsParams): Promise<SupportTicketList>;
  getTicket(id: string): Promise<SupportTicket>;
  createTicket(body: SupportTicketCreateRequest): Promise<SupportTicket>;
  sendMessage(ticketId: string, body: SupportMessageCreateRequest): Promise<SupportTicket>;
  markRead(ticketId: string): Promise<SupportTicket>;
  cancelTicket(ticketId: string, body: SupportCancelRequest): Promise<SupportTicket>;
  reopenTicket(ticketId: string, body: SupportReopenRequest): Promise<SupportTicket>;
  rateTicket(ticketId: string, body: SupportRatingRequest): Promise<SupportTicket>;
  uploadFile(body: SupportUploadRequest, options?: { signal?: AbortSignal }): Promise<SupportUpload>;
  deleteUpload(uploadId: string): Promise<void>;
  /** Link temporário para abrir o arquivo; null quando não há arquivo real (modo demonstração). */
  getAttachmentLink(ticketId: string, attachmentId: string): Promise<SupportAttachmentLink | null>;
  getNotifications(limit?: number): Promise<SupportNotificationList>;
  markNotificationsRead(ids?: string[]): Promise<SupportNotificationList>;
  // ---- support-whatsapp
  /** Feed de mudanças dos chamados do estudante. A entrega é "ao menos uma vez" e `data` traz só ids e rótulos públicos. */
  getEvents(params: SupportEventsParams, options?: { signal?: AbortSignal }): Promise<SupportEventFeed>;
  getWhatsAppLink(): Promise<SupportWhatsAppLinkState>;
  /** O `code` só existe nesta resposta: fica no estado do componente, nunca em cache ou log. */
  createWhatsAppVerification(body: SupportContactVerificationCreateRequest): Promise<SupportContactVerificationView>;
  getWhatsAppVerification(id: string): Promise<SupportContactVerificationView>;
  confirmWhatsAppVerification(id: string, body: SupportContactVerificationConfirmRequest): Promise<SupportWhatsAppLinkState>;
  revokeWhatsAppLink(linkId: string): Promise<SupportWhatsAppLinkState>;
}
