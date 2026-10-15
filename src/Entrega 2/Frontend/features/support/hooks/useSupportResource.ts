import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';

import { toApiClientError } from '../../../hooks/useResource';
import { useOptionalSession } from '../../../hooks/useSession';
import type { ApiClientError } from '../../../services/apiClient';
import { peekCache, readCache, writeCache } from '../cache';

export type SupportResourceStatus = 'loading' | 'ready' | 'error';

export interface SupportResource<T> {
  data: T | null;
  /** loading: sem dados ainda · ready: há dados (talvez do cache) · error: falhou e não há o que mostrar */
  status: SupportResourceStatus;
  /** último erro (com dados em tela ele vira aviso discreto, não tela de erro) */
  error: ApiClientError | null;
  /** os dados exibidos vieram do cache e a atualização ainda não chegou (ou falhou) */
  fromCache: boolean;
  updatedAt: number | null;
  /** pull-to-refresh em andamento */
  refreshing: boolean;
  /** busca de novo em segundo plano (sem esqueleto) */
  reload: () => void;
  /** pull-to-refresh: `refreshing` fica true até a resposta chegar */
  refresh: () => void;
  /** substitui os dados (resultado de uma ação) e atualiza o cache */
  mutate: (data: T) => void;
}

interface Entry<T> {
  key: string;
  data: T | null;
  updatedAt: number | null;
  fromCache: boolean;
  error: ApiClientError | null;
}

export interface SupportResourceOptions {
  enabled?: boolean;
  /** atualização periódica, só com o app em primeiro plano (sem polling agressivo) */
  pollMs?: number;
}

/** Usuário dono do cache local (sem sessão — testes isolados — o cache fica em memória com uma chave neutra). */
export function useSupportUserId(): string {
  return useOptionalSession()?.user?.id ?? 'anonymous';
}

function initial<T>(userId: string, key: string): Entry<T> {
  const cached = peekCache<T>(userId, key);
  return { key, data: cached?.data ?? null, updatedAt: cached?.savedAt ?? null, fromCache: Boolean(cached), error: null };
}

/**
 * Recurso remoto com stale-while-revalidate: mostra o cache na hora, busca na rede, guarda o resultado. Falhas
 * com dados em tela mantêm os dados (modo offline); sem dados, viram estado de erro.
 */
export function useSupportResource<T>(key: string, fetcher: () => Promise<T>, options: SupportResourceOptions = {}): SupportResource<T> {
  const { enabled = true, pollMs } = options;
  const userId = useSupportUserId();
  const cacheId = `${userId}|${key}`;
  const [entry, setEntry] = useState<Entry<T>>(() => initial<T>(userId, key));
  const [trackedId, setTrackedId] = useState(cacheId);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== 'background');

  // Outra chave (ex.: outro chamado): recomeça a partir do cache dela, sem efeito.
  if (trackedId !== cacheId) {
    setTrackedId(cacheId);
    setEntry(initial<T>(userId, key));
  }

  const fetchLatest = useEffectEvent(() => fetcher());

  // Cache persistido (primeira abertura do app sem a memória quente).
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    readCache<T>(userId, key)
      .then((cached) => {
        if (!active || !cached) return;
        setEntry((previous) => (previous.key === key && previous.data === null ? { ...previous, data: cached.data, updatedAt: cached.savedAt, fromCache: true } : previous));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled, key, userId]);

  // Única origem das buscas: montagem, troca de chave, reload, pull-to-refresh e polling incrementam `version`.
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    fetchLatest()
      .then((data) => {
        writeCache(userId, key, data);
        if (active) setEntry((previous) => (previous.key === key ? { key, data, updatedAt: Date.now(), fromCache: false, error: null } : previous));
      })
      .catch((caught: unknown) => {
        const error = toApiClientError(caught);
        if (!active || error.kind === 'cancelled') return;
        setEntry((previous) => (previous.key === key ? { ...previous, error, fromCache: previous.data !== null } : previous));
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, key, userId, version]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      // De volta ao app com polling ligado: atualiza na hora em vez de esperar o próximo intervalo.
      if (active && pollMs) setVersion((value) => value + 1);
    });
    return () => subscription.remove();
  }, [pollMs]);

  // Polling controlado: só em primeiro plano; voltar ao app dispara uma atualização.
  useEffect(() => {
    if (!enabled || !pollMs || !appActive) return undefined;
    const timer = setInterval(() => setVersion((value) => value + 1), pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs, appActive]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((value) => value + 1);
  }, []);

  const mutate = useCallback(
    (data: T) => {
      writeCache(userId, key, data);
      setEntry({ key, data, updatedAt: Date.now(), fromCache: false, error: null });
    },
    [key, userId],
  );

  const current = entry.key === key ? entry : initial<T>(userId, key);
  return {
    data: current.data,
    status: current.data !== null ? 'ready' : current.error ? 'error' : 'loading',
    error: current.error,
    fromCache: current.fromCache,
    updatedAt: current.updatedAt,
    refreshing,
    reload,
    refresh,
    mutate,
  };
}
