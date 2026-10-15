import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { supportApi } from '@/services/api/endpoints';
import type { SupportTicket } from '@/types/api';
import { notificationsPrefix, supportKeys } from './keys';

/** Catálogo (categorias, artigos e limites): muda só com deploy, então fica em cache por 10 minutos. */
export function useSupportCatalog() {
  return useQuery({ queryKey: supportKeys.catalog, queryFn: supportApi.catalog, staleTime: 10 * 60_000 });
}

/** Relógio para textos relativos ("atualizado há 2 min") sem depender de nova renderização. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Depois de uma alteração: listas, resumo da página inicial e avisos voltam a buscar. */
export function refreshSupportViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: supportKeys.lists });
  void queryClient.invalidateQueries({ queryKey: supportKeys.overview });
  void queryClient.invalidateQueries({ queryKey: notificationsPrefix });
}

/** Grava o chamado devolvido por uma ação e atualiza as demais telas. */
export function applyTicketUpdate(queryClient: QueryClient, ticket: SupportTicket): void {
  queryClient.setQueryData(supportKeys.ticket(ticket.id), ticket);
  refreshSupportViews(queryClient);
}

/**
 * Marca o chamado como lido ao abrir e de novo quando chega mensagem nova da equipe (refetch a cada 30 s).
 * Falha aqui não atrapalha a leitura: o aviso continua não lido e a próxima abertura tenta de novo.
 */
export function useMarkTicketRead(ticketId: string, ticket: SupportTicket | undefined): void {
  const queryClient = useQueryClient();
  const marked = useRef<string | null>(null);
  const latestFromTeam = ticket ? ([...ticket.messages].reverse().find((message) => message.senderType === 'agent')?.id ?? 'none') : null;
  const key = ticket && latestFromTeam ? `${ticket.id}:${latestFromTeam}` : null;
  useEffect(() => {
    if (!key || marked.current === key) return;
    marked.current = key;
    supportApi
      .markRead(ticketId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: notificationsPrefix });
        void queryClient.invalidateQueries({ queryKey: supportKeys.overview });
        void queryClient.invalidateQueries({ queryKey: supportKeys.lists });
      })
      .catch(() => {
        marked.current = null;
      });
  }, [key, ticketId, queryClient]);
}
