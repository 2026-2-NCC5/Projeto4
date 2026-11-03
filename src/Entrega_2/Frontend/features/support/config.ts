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
  /** Long polling de GET /api/support/me/events: quanto o servidor segura a resposta (máximo aceito: 25 s). */
  EVENTS_WAIT_SECONDS: 25,
  /** Tempo limite do cliente no long polling (sempre acima da espera no servidor). */
  EVENTS_TIMEOUT_MS: 40_000,
  /** Intervalo mínimo entre duas chamadas, mesmo quando o servidor responde na hora. */
  EVENTS_MIN_INTERVAL_MS: 1_000,
  /** Espera entre tentativas depois de uma falha: dobra a cada falha, com variação aleatória, até o limite. */
  EVENTS_BASE_BACKOFF_MS: 2_000,
  EVENTS_MAX_BACKOFF_MS: 30_000,
  /** Quanto respeitar, no máximo, o Retry-After de um 429 no long polling. */
  EVENTS_MAX_RETRY_AFTER_MS: 120_000,
  /** Consulta do pedido de vinculação do WhatsApp enquanto o código não chega. */
  WHATSAPP_POLL_MS: 3_000,
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
  // ---- support-whatsapp (o estudante vem sempre da sessão)
  myEvents: '/api/support/me/events',
  whatsapp: '/api/support/me/whatsapp',
  whatsappVerifications: '/api/support/me/whatsapp/verifications',
  whatsappVerification: (id: string) => `/api/support/me/whatsapp/verifications/${encodeURIComponent(id)}`,
  whatsappVerificationConfirm: (id: string) => `/api/support/me/whatsapp/verifications/${encodeURIComponent(id)}/confirm`,
  whatsappLink: (id: string) => `/api/support/me/whatsapp/links/${encodeURIComponent(id)}`,
} as const;
