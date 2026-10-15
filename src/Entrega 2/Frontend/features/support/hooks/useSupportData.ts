import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SupportCatalog, SupportNotificationList, SupportOverview, SupportTicket, SupportTicketList, SupportTicketSummary } from '../../../types/api';
import { getSupportApi } from '../api';
import { SUPPORT } from '../config';
import { supportErrorMessage } from '../errors';
import { findFilter, type TicketFilterKey } from '../labels';

import { useSupportResource, type SupportResource } from './useSupportResource';

/** Categorias, artigos e limites (o catálogo muda raramente: cache longo, sem polling). */
export function useSupportCatalog(): SupportResource<SupportCatalog> {
  return useSupportResource('catalog', () => getSupportApi().getCatalog());
}

/** Resumo para a Home e o hub do Atendimento. */
export function useSupportOverview(options: { enabled?: boolean } = {}): SupportResource<SupportOverview> {
  return useSupportResource('overview', () => getSupportApi().getOverview(), { enabled: options.enabled ?? true });
}

export function useSupportNotifications(options: { enabled?: boolean } = {}): SupportResource<SupportNotificationList> {
  return useSupportResource('notifications', () => getSupportApi().getNotifications(20), { enabled: options.enabled ?? true });
}

export interface TicketsState {
  list: SupportResource<SupportTicketList>;
  /** primeira página + páginas carregadas por rolagem (sem repetidos) */
  items: SupportTicketSummary[];
  /** contagens da última resposta (para os chips), mesmo durante uma nova busca */
  counts: SupportTicketList['counts'] | null;
  /** nova busca em andamento: os resultados anteriores continuam na tela (sem piscar para o esqueleto) */
  searching: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => void;
}

/** "Meus chamados": filtro + busca no servidor, paginação por cursor (infinite scroll). */
export function useTickets(filter: TicketFilterKey, search: string): TicketsState {
  const statuses = findFilter(filter).statuses;
  const term = search.trim();
  const listKey = `tickets:${filter}:${term.toLowerCase()}`;
  const list = useSupportResource(listKey, () => getSupportApi().listTickets({ statuses, search: term, limit: SUPPORT.PAGE_SIZE }), { pollMs: SUPPORT.LIST_POLL_MS });
  const [extra, setExtra] = useState<{ key: string; items: SupportTicketSummary[]; cursor: string | null }>({ key: listKey, items: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [previous, setPrevious] = useState<{ filter: TicketFilterKey; data: SupportTicketList } | null>(null);
  // Guarda a última resposta deste filtro para mostrar enquanto a próxima busca carrega.
  if (list.data && previous?.data !== list.data) setPrevious({ filter, data: list.data });
  const stale = !list.data && previous?.filter === filter ? previous.data : null;

  const pages = extra.key === listKey ? extra : { key: listKey, items: [], cursor: null };
  const firstPage = list.data ?? stale;
  const cursor = pages.items.length > 0 ? pages.cursor : (firstPage?.nextCursor ?? null);

  const items = useMemo(() => {
    const first = firstPage?.items ?? [];
    const seen = new Set(first.map((item) => item.id));
    return [...first, ...pages.items.filter((item) => !seen.has(item.id))];
  }, [firstPage, pages.items]);

  const loadMore = useCallback(() => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    getSupportApi()
      .listTickets({ statuses, search: term, limit: SUPPORT.PAGE_SIZE, cursor })
      .then((page) => {
        setExtra((previous) => {
          const base = previous.key === listKey ? previous.items : [];
          return { key: listKey, items: [...base, ...page.items], cursor: page.nextCursor };
        });
      })
      .catch((error: unknown) => setLoadMoreError(supportErrorMessage(error, 'Não conseguimos carregar mais chamados.')))
      .finally(() => setLoadingMore(false));
  }, [cursor, listKey, loadingMore, statuses, term]);

  return { list, items, counts: firstPage?.counts ?? null, searching: Boolean(stale) && list.status === 'loading', hasMore: Boolean(list.data && cursor), loadingMore, loadMoreError, loadMore };
}

/** Detalhe do chamado, atualizado em segundo plano enquanto a tela está aberta. */
export function useTicket(id: string): SupportResource<SupportTicket> {
  return useSupportResource(`ticket:${id}`, () => getSupportApi().getTicket(id), { pollMs: SUPPORT.DETAIL_POLL_MS });
}

export interface TicketUpdates {
  /** eventos que chegaram depois da primeira carga (realçados na linha do tempo) */
  freshEventIds: ReadonlySet<string>;
  /** aviso "Chamado atualizado" (mudança feita pelo ASA com a tela aberta) */
  notice: string | null;
  dismissNotice: () => void;
}

interface Snapshot {
  ticketId: string;
  eventIds: Set<string>;
  status: SupportTicket['status'];
  fresh: Set<string>;
  notice: string | null;
}

/**
 * Detecta o que mudou desde a última atualização sem recarregar a tela: eventos novos ganham realce e mudanças
 * vindas do ASA mostram "Chamado atualizado" (ações do próprio estudante não disparam o aviso).
 */
export function useTicketUpdates(ticket: SupportTicket | null): TicketUpdates {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  if (ticket && (!snapshot || snapshot.ticketId !== ticket.id)) {
    setSnapshot({ ticketId: ticket.id, eventIds: new Set(ticket.events.map((item) => item.id)), status: ticket.status, fresh: new Set(), notice: null });
  } else if (ticket && snapshot && ticket.events.some((item) => !snapshot.eventIds.has(item.id))) {
    const arrived = ticket.events.filter((item) => !snapshot.eventIds.has(item.id));
    const fromAsa = arrived.some((item) => item.actorType !== 'student');
    setSnapshot({
      ticketId: ticket.id,
      eventIds: new Set(ticket.events.map((item) => item.id)),
      status: ticket.status,
      fresh: new Set(arrived.map((item) => item.id)),
      notice: fromAsa ? (ticket.status !== snapshot.status ? 'Chamado atualizado' : 'Nova atualização do ASA') : snapshot.notice,
    });
  }

  const fresh = snapshot?.fresh;
  const hasFresh = Boolean(fresh && fresh.size > 0);
  // O realce é temporário: some depois de alguns segundos.
  useEffect(() => {
    if (!hasFresh) return undefined;
    const timer = setTimeout(() => setSnapshot((previous) => (previous ? { ...previous, fresh: new Set() } : previous)), SUPPORT.NEW_EVENT_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [hasFresh, fresh]);

  const dismissNotice = useCallback(() => setSnapshot((previous) => (previous ? { ...previous, notice: null } : previous)), []);
  return { freshEventIds: fresh ?? EMPTY, notice: snapshot?.notice ?? null, dismissNotice };
}

const EMPTY: ReadonlySet<string> = new Set();
