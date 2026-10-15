import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { request } from '../../services/apiClient';
import type { PlatformInfo } from '../../types/api';

/** GET /api/platform/info — público (sem token): modo de dados, recursos ativos e fonte acadêmica. */
export const PLATFORM_ROUTES = { info: '/api/platform/info' } as const;

/** Rótulo exibido sempre que os dados são fictícios (contrato: `dataModeLabel` do modo `demo`). */
export const DEMO_DATA_LABEL = 'DEMONSTRAÇÃO — Dados fictícios';

/** As informações públicas mudam raramente: revalidadas no máximo a cada 5 minutos (ou no pull-to-refresh). */
const STALE_MS = 5 * 60_000;

export type PlatformInfoStatus = 'loading' | 'ready' | 'error';

export interface PlatformInfoSnapshot {
  info: PlatformInfo | null;
  /** loading: primeira leitura · ready: há dados · error: falhou e não há dados (os recursos seguem visíveis) */
  status: PlatformInfoStatus;
  fetchedAt: number;
}

const INITIAL: PlatformInfoSnapshot = { info: null, status: 'loading', fetchedAt: 0 };

let snapshot: PlatformInfoSnapshot = INITIAL;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: PlatformInfoSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): PlatformInfoSnapshot => snapshot;

/**
 * Busca (uma requisição por vez) as informações públicas da plataforma. Falhas nunca derrubam a tela: sem dados,
 * o app segue como antes (sem rótulo e com todos os recursos visíveis); com dados, mantém a última leitura.
 */
export function loadPlatformInfo(options: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  const fresh = snapshot.info !== null && Date.now() - snapshot.fetchedAt < STALE_MS;
  if (fresh && !options.force) return Promise.resolve();
  inFlight = request<PlatformInfo>(PLATFORM_ROUTES.info, { auth: false })
    .then((info) => emit({ info, status: 'ready', fetchedAt: Date.now() }))
    .catch(() => emit({ ...snapshot, status: snapshot.info ? 'ready' : 'error' }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export interface PlatformInfoState extends PlatformInfoSnapshot {
  /** força uma nova leitura (pull-to-refresh) */
  reload: () => void;
}

/** Informações públicas compartilhadas por todas as telas (cache em memória, sem depender da sessão). */
export function usePlatformInfo(): PlatformInfoState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void loadPlatformInfo();
  }, []);
  const reload = useCallback(() => {
    void loadPlatformInfo({ force: true });
  }, []);
  return { ...current, reload };
}

/** Dados fictícios de demonstração: as telas mostram o rótulo DEMONSTRAÇÃO. */
export function isDemoMode(info: PlatformInfo | null | undefined): boolean {
  return info?.dataMode === 'demo';
}

/** Agendamentos ficam visíveis enquanto a plataforma não disser explicitamente que estão desligados. */
export function appointmentsEnabled(info: PlatformInfo | null | undefined): boolean {
  return info?.features.appointments !== false;
}

/** Mensagem da fonte acadêmica quando ela está indisponível (null quando há dados acadêmicos). */
export function academicUnavailableMessage(info: PlatformInfo | null | undefined): string | null {
  return info?.academicSource.status === 'unavailable' ? info.academicSource.message || 'Dados acadêmicos indisponíveis no momento.' : null;
}

/** Apenas para testes: estado inicial (nenhuma leitura feita). */
export function resetPlatformInfoForTests(): void {
  inFlight = null;
  emit(INITIAL);
}

/** Apenas para testes: informações já carregadas (sem requisição). */
export function setPlatformInfoForTests(info: PlatformInfo | null): void {
  inFlight = null;
  emit(info ? { info, status: 'ready', fetchedAt: Date.now() } : INITIAL);
}
