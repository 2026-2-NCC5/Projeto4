import { useCallback, useEffect, useEffectEvent, useState } from 'react';

import { ApiClientError } from '../services/apiClient';
import type { ResourceState, ResourceStatus } from '../types/ui';

export interface UseResourceOptions<T> {
  /** Define quando `data` deve ser considerado vazio (padrão: array vazio ou null). */
  isEmpty?: (data: T) => boolean;
  /** Quando false, não dispara o carregamento. */
  enabled?: boolean;
  /** Mudança de chave recarrega o recurso (ex.: id de detalhe). */
  key?: string | number | null;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  return Array.isArray(data) && data.length === 0;
}

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  return new ApiClientError({ kind: 'unknown', message: error instanceof Error ? error.message : 'Erro inesperado.' });
}

interface SettledResource<T> {
  /** Identifica a requisição que produziu este resultado. */
  requestKey: string;
  status: Exclude<ResourceStatus, 'loading'>;
  data: T | null;
  error: ApiClientError | null;
}

/**
 * Carrega um recurso remoto e expõe {status, data, error, reload}.
 * O estado de carregamento é derivado: enquanto a requisição atual (enabled/key/version) não
 * terminar, status = 'loading' (dados anteriores continuam disponíveis). Respostas de chamadas
 * antigas (race) e após desmontagem são ignoradas.
 */
export function useResource<T>(fetcher: () => Promise<T>, options: UseResourceOptions<T> = {}): ResourceState<T> {
  const { enabled = true, key = null, isEmpty } = options;
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<SettledResource<T> | null>(null);
  const requestKey = `${enabled ? 'on' : 'off'}|${key === null ? '' : String(key)}|${version}`;

  // Sempre a versão mais recente do fetcher/isEmpty, sem torná-los dependências do efeito.
  const fetchLatest = useEffectEvent(() => fetcher());
  const isEmptyResult = useEffectEvent((result: T) => (isEmpty ? isEmpty(result) : defaultIsEmpty(result)));

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    fetchLatest()
      .then((result) => {
        if (!active) return;
        setSettled({ requestKey, status: isEmptyResult(result) ? 'empty' : 'success', data: result, error: null });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setSettled({ requestKey, status: 'error', data: null, error: toApiClientError(caught) });
      });

    return () => {
      active = false;
    };
  }, [enabled, requestKey]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  const current = settled !== null && settled.requestKey === requestKey ? settled : null;
  return {
    status: current ? current.status : 'loading',
    data: current ? current.data : (settled?.data ?? null),
    error: current ? current.error : null,
    reload,
  };
}
