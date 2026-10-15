import { API_ROUTES, HISTORY_LIMIT, TIMEOUTS } from '../config/services';
import type { AgentAnalysis, AgentHistoryItem, AgentRecommendationDetail } from '../types/api';

import { request } from './apiClient';

/**
 * Solicita uma análise ao Agente para o Estudante.
 * O corpo é sempre vazio: a identidade do estudante vem do token (nunca enviar student_id).
 */
export const analyze = (correlationId?: string): Promise<AgentAnalysis> =>
  request<AgentAnalysis>(API_ROUTES.agent.analyze, {
    method: 'POST',
    body: {},
    timeoutMs: TIMEOUTS.ANALYSIS_TIMEOUT_MS,
    ...(correlationId ? { correlationId } : {}),
  });

/** Última análise do estudante (null quando nunca houve análise). */
export const getLatest = (): Promise<AgentAnalysis | null> =>
  request<AgentAnalysis | null>(API_ROUTES.agent.recommendations);

export const getRecommendation = (id: string): Promise<AgentRecommendationDetail> =>
  request<AgentRecommendationDetail>(API_ROUTES.agent.recommendation(id));

export const getHistory = (limit: number = HISTORY_LIMIT): Promise<AgentHistoryItem[]> =>
  request<AgentHistoryItem[]>(API_ROUTES.agent.history(limit));

export const getRun = (runId: string): Promise<AgentAnalysis> => request<AgentAnalysis>(API_ROUTES.agent.run(runId));

export const agentService = { analyze, getLatest, getRecommendation, getHistory, getRun };
