import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { staffKeys } from '@/features/support/staff/api';
import type { SupportEventEnvelope } from '@/types/api';
import { centralApi, centralKeys } from './api';

/**
 * Estado da ligação do portal com a API: não diz nada sobre o WhatsApp.
 * `connecting` = primeira leitura; `live` = recebendo; `reconnecting` = sem resposta, tentando de novo; `offline` = sem rede.
 */
export type RealtimeState = 'connecting' | 'live' | 'reconnecting' | 'offline';

const WAIT_SECONDS = 25;
const MAX_BACKOFF_MS = 30_000;
const REMEMBERED_EVENTS = 500;
/**
 * Intervalo mínimo entre chamadas. Long polling normal já espera no servidor; isto protege a API quando a resposta
 * volta na hora (proxy que encerra a conexão, servidor com `wait` desligado): sem pausa, o laço martelaria a rota.
 */
const MIN_POLL_INTERVAL_MS = 1000;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/**
 * Long polling por cursor. Cada resposta invalida só o que mudou; ao voltar de uma falha, recarrega tudo, porque
 * eventos podem ter sido perdidos enquanto a ligação estava fora. A chamada passa pela autenticação normal.
 */
export function useSupportRealtime(enabled: boolean): RealtimeState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeState>('connecting');

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const seen = new Set<string>();

    const refreshAll = () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      void queryClient.invalidateQueries({ queryKey: centralKeys.counts });
      void queryClient.invalidateQueries({ queryKey: centralKeys.status });
    };

    const apply = (events: SupportEventEnvelope[]) => {
      const tickets = new Set<string>();
      let channelChanged = false;
      for (const item of events) {
        // o feed entrega "ao menos uma vez": a repetição é descartada pelo id
        if (seen.has(item.eventId)) continue;
        seen.add(item.eventId);
        if (seen.size > REMEMBERED_EVENTS) seen.delete(seen.values().next().value as string);
        if (item.ticketId) tickets.add(item.ticketId);
        if (item.type === 'support.channel.connection_updated') channelChanged = true;
      }
      for (const id of tickets) void queryClient.invalidateQueries({ queryKey: staffKeys.ticket(id) });
      if (tickets.size > 0) {
        void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
        void queryClient.invalidateQueries({ queryKey: centralKeys.counts });
      }
      if (channelChanged) void queryClient.invalidateQueries({ queryKey: centralKeys.status });
    };

    const run = async () => {
      let cursor: string | null = null;
      let backoff = 1000;
      // o cursor inicial vem depois das telas carregarem: um evento nesse intervalo só apareceria na próxima recarga
      let recovering = true;
      while (!signal.aborted) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setState('offline');
          recovering = true;
          await sleep(3000, signal);
          continue;
        }
        const startedAt = Date.now();
        try {
          const feed = await centralApi.events({ since: cursor, wait: cursor ? WAIT_SECONDS : 0, signal });
          if (signal.aborted) return;
          if (recovering || feed.resyncRequired) refreshAll();
          recovering = false;
          apply(feed.events);
          cursor = feed.nextCursor;
          backoff = 1000;
          setState('live');
          const elapsed = Date.now() - startedAt;
          if (elapsed < MIN_POLL_INTERVAL_MS) await sleep(MIN_POLL_INTERVAL_MS - elapsed, signal);
        } catch {
          if (signal.aborted) return;
          setState('reconnecting');
          recovering = true;
          await sleep(backoff + Math.random() * 500, signal);
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [enabled, queryClient]);

  return enabled ? state : 'connecting';
}
