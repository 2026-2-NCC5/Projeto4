/**
 * Chaves de consulta do Atendimento no Portal do Aluno. Prefixo ['support'] compartilhado com o painel
 * inicial (['support', 'overview']) para que uma única invalidação atualize as telas que mostram chamados.
 */
export type TicketFilter = 'all' | 'active' | 'waiting' | 'finished';

export const supportKeys = {
  all: ['support'] as const,
  catalog: ['support', 'catalog'] as const,
  overview: ['support', 'overview'] as const,
  /** todas as listas de chamados (Meus chamados, Documentos) */
  lists: ['support', 'tickets'] as const,
  list: (filter: TicketFilter, search: string) => ['support', 'tickets', 'list', filter, search] as const,
  documents: ['support', 'tickets', 'documents'] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
};

/** Avisos (sino e página de notificações) usam o prefixo ['notifications']. */
export const notificationsPrefix = ['notifications'] as const;
