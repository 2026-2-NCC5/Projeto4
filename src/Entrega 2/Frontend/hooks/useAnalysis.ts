import { useCallback, useEffect, useRef, useState } from 'react';

import { agentService } from '../services/agentService';
import { ApiClientError, createCorrelationId, type ApiErrorKind } from '../services/apiClient';
import type { AgentAnalysis } from '../types/api';
import type { AnalysisStatus } from '../types/ui';

import { toApiClientError } from './useResource';

export type LatestStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseAnalysisResult {
  /** Estado da análise exibida (última carregada ou recém-solicitada). */
  status: AnalysisStatus;
  analysis: AgentAnalysis | null;
  error: ApiClientError | null;
  errorKind: ApiErrorKind | null;
  /** Correlation id do último fluxo de análise solicitado nesta sessão. */
  correlationId: string | null;
  /** Carregamento da última análise (GET /api/agent/recommendations). */
  latestStatus: LatestStatus;
  latestError: ApiClientError | null;
  /** Solicita uma nova análise; chamadas durante `loading` são ignoradas. */
  requestAnalysis: () => Promise<void>;
  loadLatest: () => Promise<void>;
}

/** Deriva o estado visual a partir de uma análise concluída. */
export function deriveAnalysisStatus(analysis: AgentAnalysis): AnalysisStatus {
  if (analysis.abstained || analysis.status === 'abstained') return 'abstained';
  if (analysis.requiresHumanValidation) return 'human_validation';
  return 'success';
}

export function useAnalysis(options: { autoLoadLatest?: boolean } = {}): UseAnalysisResult {
  const { autoLoadLatest = true } = options;
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  // Com carregamento automático a última análise já nasce "carregando" (sem setState síncrono em efeito).
  const [latestStatus, setLatestStatus] = useState<LatestStatus>(autoLoadLatest ? 'loading' : 'idle');
  const [latestError, setLatestError] = useState<ApiClientError | null>(null);

  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Busca a última análise; o estado só muda nos callbacks da resposta (nunca de forma síncrona). */
  const fetchLatest = useCallback(
    (): Promise<void> =>
      agentService.getLatest().then(
        (latest) => {
          if (!mountedRef.current) return;
          // Não sobrescreve uma análise em andamento ou recém-concluída.
          if (!loadingRef.current) {
            setAnalysis(latest);
            setStatus(latest ? deriveAnalysisStatus(latest) : 'idle');
          }
          setLatestStatus('ready');
        },
        (caught: unknown) => {
          if (!mountedRef.current) return;
          setLatestError(toApiClientError(caught));
          setLatestStatus('error');
        },
      ),
    [],
  );

  const requestAnalysis = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const flowCorrelationId = createCorrelationId();
    setCorrelationId(flowCorrelationId);
    setStatus('loading');
    setError(null);
    try {
      const result = await agentService.analyze(flowCorrelationId);
      if (!mountedRef.current) return;
      setAnalysis(result);
      setStatus(deriveAnalysisStatus(result));
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(toApiClientError(caught));
      setStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const loadLatest = useCallback(async () => {
    setLatestStatus('loading');
    setLatestError(null);
    await fetchLatest();
  }, [fetchLatest]);

  useEffect(() => {
    if (autoLoadLatest) void fetchLatest();
  }, [autoLoadLatest, fetchLatest]);

  return {
    status,
    analysis,
    error,
    errorKind: error?.kind ?? null,
    correlationId,
    latestStatus,
    latestError,
    requestAnalysis,
    loadLatest,
  };
}
