import { useCallback, useState } from 'react';

import { isApiClientError } from '../../services/apiClient';
import type { InboxNotification, InboxNotificationList } from '../../types/api';
import { useSupportResource, type SupportResource } from '../support/hooks/useSupportResource';

import { getNotificationsApi, INBOX_LIMIT, INBOX_POLL_MS } from './api';

/** Chave do cache local (por usuário) compartilhada pelo sino do Início e pela central de avisos. */
export const INBOX_CACHE_KEY = 'inbox';

export interface InboxController {
  resource: SupportResource<InboxNotificationList>;
  items: InboxNotification[];
  /** não lidos segundo o servidor (null enquanto não houver resposta nem cache) */
  unreadCount: number | null;
  /** marcação em andamento ("Marcar todas como lidas") */
  busy: boolean;
  /** Marca como lidos; devolve null em caso de sucesso ou a mensagem amigável do erro. */
  markRead: (ids: string[]) => Promise<string | null>;
  markAllRead: () => Promise<string | null>;
}

/** Mensagens da central — nunca "Error 500" nem "Network request failed". */
export function inboxErrorMessage(error: unknown, fallback = 'Não conseguimos atualizar seus avisos agora. Tente novamente.'): string {
  if (!isApiClientError(error)) return fallback;
  switch (error.kind) {
    case 'offline':
      return 'Você está offline. Tente de novo quando a conexão voltar.';
    case 'network':
      return 'Não conseguimos falar com o ASA agora. Verifique sua conexão e tente novamente.';
    case 'timeout':
      return 'A conexão está lenta e a resposta demorou demais. Tente novamente.';
    case 'rate_limited':
      return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
    default:
      return fallback;
  }
}

/** Aplica a leitura localmente (resposta otimista): `ids` null = todos. */
export function markListRead(list: InboxNotificationList, ids: ReadonlySet<string> | null, readAt: string): InboxNotificationList {
  let changed = 0;
  const items = list.items.map((item) => {
    if (item.readAt || (ids && !ids.has(item.id))) return item;
    changed += 1;
    return { ...item, readAt };
  });
  return { items, unreadCount: ids ? Math.max(0, list.unreadCount - changed) : 0 };
}

/**
 * Central de avisos com cache local (aparece na hora, inclusive offline) e leitura otimista. `poll` liga a
 * atualização periódica com o app em primeiro plano (e uma atualização ao voltar para o app).
 */
export function useInbox(options: { enabled?: boolean; poll?: boolean } = {}): InboxController {
  const { enabled = true, poll = false } = options;
  const resource = useSupportResource<InboxNotificationList>(INBOX_CACHE_KEY, () => getNotificationsApi().list(INBOX_LIMIT), { enabled, ...(poll ? { pollMs: INBOX_POLL_MS } : {}) });
  const { data, mutate, reload } = resource;
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    async (ids: string[] | null): Promise<string | null> => {
      const optimistic = data ? markListRead(data, ids ? new Set(ids) : null, new Date().toISOString()) : null;
      if (optimistic) mutate(optimistic);
      try {
        // a resposta tem o mesmo tamanho da lista da central (inclusive avisos que chegaram nesse meio-tempo)
        mutate(await getNotificationsApi().markRead(ids ?? undefined, INBOX_LIMIT));
        return null;
      } catch (error) {
        // a verdade volta do servidor (o aviso pode continuar como não lido)
        reload();
        return inboxErrorMessage(error, 'Não conseguimos marcar como lido agora. Tente novamente.');
      }
    },
    [data, mutate, reload],
  );

  const markRead = useCallback(
    (ids: string[]) => {
      const unread = ids.filter((id) => data?.items.some((item) => item.id === id && !item.readAt) ?? true);
      return unread.length > 0 ? apply(unread) : Promise.resolve(null);
    },
    [apply, data],
  );

  const markAllRead = useCallback(async () => {
    if (busy) return null;
    setBusy(true);
    try {
      return await apply(null);
    } finally {
      setBusy(false);
    }
  }, [apply, busy]);

  return { resource, items: data?.items ?? [], unreadCount: data ? data.unreadCount : null, busy, markRead, markAllRead };
}
