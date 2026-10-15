import { readBoolean } from '../../config/services';

/**
 * Atendimento ASA (chamados). Variáveis EXPO_PUBLIC_* são lidas estaticamente (inlining do babel-preset-expo).
 */
export const SUPPORT = {
  /** true → usa os chamados de demonstração em memória (features/support/api/mockSupportApi.ts), sem API. */
  USE_MOCK: readBoolean(process.env.EXPO_PUBLIC_USE_MOCK_TICKETS, false),
  /** Atualização em segundo plano do detalhe aberto (só com o app em primeiro plano). */
  DETAIL_POLL_MS: 30_000,
  /** Atualização em segundo plano de "Meus chamados". */
  LIST_POLL_MS: 60_000,
  /** Itens por página em "Meus chamados". */
  PAGE_SIZE: 20,
  /** Busca só dispara depois que o aluno para de digitar. */
  SEARCH_DEBOUNCE_MS: 350,
  /** Quanto tempo o destaque de um evento novo fica visível na linha do tempo. */
  NEW_EVENT_HIGHLIGHT_MS: 2_400,
  /** Chaves do armazenamento local (cache offline e rascunho), sempre com o id do usuário. */
  CACHE_KEY_PREFIX: 'asa.support.cache.v1',
  DRAFT_KEY_PREFIX: 'asa.support.draft.v1',
} as const;

/** Rotas da API do Atendimento (contrato mobile v1.3). */
export const SUPPORT_ROUTES = {
  catalog: '/api/support/catalog',
  overview: '/api/support/overview',
  tickets: '/api/support/tickets',
  ticket: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}`,
  events: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/events`,
  messages: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/messages`,
  read: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/read`,
  cancel: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/cancel`,
  reopen: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/reopen`,
  rating: (id: string) => `/api/support/tickets/${encodeURIComponent(id)}/rating`,
  attachmentLink: (ticketId: string, attachmentId: string) => `/api/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}/link`,
  uploads: '/api/support/uploads',
  upload: (id: string) => `/api/support/uploads/${encodeURIComponent(id)}`,
  notifications: '/api/support/notifications',
  notificationsRead: '/api/support/notifications/read',
} as const;
