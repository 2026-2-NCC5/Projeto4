import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/services/api/client';
import { agentApi, studentApi } from '@/services/api/endpoints';
import type { AgentAnalysis, AgentFeedbackRequest, AgentRecommendationDetail, AgentRecommendationFeedback } from '@/types/api';

/**
 * Vida acadêmica e Agente para o Estudante no Portal do Aluno. O estudante vem sempre da sessão: nenhuma
 * rota recebe o id do aluno. Sem fonte acadêmica, a API responde 503 `academic_source_unavailable` e o portal
 * mostra a mensagem do servidor (nunca dados de exemplo no lugar).
 */
export const academicKeys = {
  all: ['student'] as const,
  profile: ['student', 'me'] as const,
  summary: ['student', 'summary'] as const,
  subjects: ['student', 'subjects'] as const,
  assessments: ['student', 'assessments'] as const,
  attendance: ['student', 'attendance'] as const,
  pending: ['student', 'pending'] as const,
};

export const agentKeys = {
  all: ['agent'] as const,
  latest: ['agent', 'latest'] as const,
  history: ['agent', 'history'] as const,
  run: (runId: string) => ['agent', 'run', runId] as const,
  recommendation: (id: string) => ['agent', 'recommendation', id] as const,
};

/** v1.7: avaliação da recomendação pelo próprio aluno (uma por recomendação; 409 `already_rated` na segunda). */
export const agentFeedbackApi = {
  send: (recommendationId: string, body: AgentFeedbackRequest) =>
    api.post<AgentRecommendationFeedback>(`/api/agent/recommendations/${encodeURIComponent(recommendationId)}/feedback`, body),
};

/** 503 da plataforma: modo demonstração desligado e nenhuma fonte institucional configurada. */
export const isAcademicUnavailable = (error: unknown): boolean => isApiError(error) && error.status === 503 && error.reason === 'academic_source_unavailable';

export const isForbiddenError = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFoundError = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';

/**
 * Repetição automática só para falhas passageiras (como o padrão do portal), nunca para a fonte acadêmica
 * indisponível: a resposta não muda em segundos e a pessoa veria um carregamento mais longo à toa.
 */
export function retryTransient(failureCount: number, error: Error): boolean {
  if (isAcademicUnavailable(error)) return false;
  if (isApiError(error) && (error.reason === 'database_required' || !['network', 'timeout', 'server', 'dependency'].includes(error.kind))) return false;
  return failureCount < 2;
}

export function useStudentProfile() {
  return useQuery({ queryKey: academicKeys.profile, queryFn: studentApi.me, staleTime: 5 * 60_000, retry: retryTransient });
}

export function useStudentSummary() {
  return useQuery({ queryKey: academicKeys.summary, queryFn: studentApi.summary, retry: retryTransient });
}

export function useSubjects() {
  return useQuery({ queryKey: academicKeys.subjects, queryFn: studentApi.subjects, retry: retryTransient });
}

export function useAssessments() {
  return useQuery({ queryKey: academicKeys.assessments, queryFn: studentApi.assessments, retry: retryTransient });
}

export function useAttendance() {
  return useQuery({ queryKey: academicKeys.attendance, queryFn: studentApi.attendance, retry: retryTransient });
}

export function usePendingItems() {
  return useQuery({ queryKey: academicKeys.pending, queryFn: studentApi.pendingItems, retry: retryTransient });
}

/** Última análise (null = o aluno nunca pediu uma). */
export function useLatestAnalysis() {
  return useQuery({ queryKey: agentKeys.latest, queryFn: agentApi.latest, retry: retryTransient });
}

export function useAgentHistory() {
  return useQuery({ queryKey: agentKeys.history, queryFn: () => agentApi.history(20), retry: retryTransient });
}

export function useAgentRun(runId: string | null) {
  return useQuery({ queryKey: agentKeys.run(runId ?? ''), queryFn: () => agentApi.run(runId ?? ''), enabled: Boolean(runId), retry: retryTransient });
}

export function useRecommendation(id: string | null) {
  return useQuery({ queryKey: agentKeys.recommendation(id ?? ''), queryFn: () => agentApi.recommendation(id ?? ''), enabled: Boolean(id), retry: retryTransient });
}

/**
 * POST /api/agent/analyze: nova execução do Agente. Sem repetição automática (cada chamada é uma nova
 * execução registrada); resumo, disciplinas em atenção e histórico voltam a buscar depois.
 */
export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => agentApi.analyze(),
    onSuccess: (analysis: AgentAnalysis) => {
      queryClient.setQueryData(agentKeys.latest, analysis);
      queryClient.setQueryData(agentKeys.run(analysis.runId), analysis);
      void queryClient.invalidateQueries({ queryKey: agentKeys.history });
      void queryClient.invalidateQueries({ queryKey: academicKeys.summary });
      void queryClient.invalidateQueries({ queryKey: academicKeys.subjects });
    },
  });
}

/** Grava a avaliação no detalhe em cache (a tela mostra o "obrigado" sem nova consulta). */
export function useRecommendationFeedback(recommendationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentFeedbackRequest) => agentFeedbackApi.send(recommendationId, body),
    onSuccess: (feedback) => {
      queryClient.setQueryData<AgentRecommendationDetail>(agentKeys.recommendation(recommendationId), (current) => (current ? { ...current, feedback } : current));
    },
    onError: (error) => {
      // já avaliada (outra aba ou o app): busca o detalhe para mostrar a avaliação registrada
      if (isApiError(error) && error.kind === 'conflict') void queryClient.invalidateQueries({ queryKey: agentKeys.recommendation(recommendationId) });
    },
  });
}

/** Mensagem honesta para a falha ao pedir uma análise (serviço do agente fora, demora, contrato, fonte acadêmica). */
export function analysisFailure(error: unknown): { title: string; message: string } {
  if (isAcademicUnavailable(error) && isApiError(error)) return { title: 'Dados acadêmicos indisponíveis', message: error.message };
  if (isApiError(error)) {
    if (error.kind === 'dependency') return { title: 'Serviço de análise indisponível', message: `O Agente para o Estudante não está respondendo agora. ${error.message || 'Tente novamente em instantes.'}` };
    if (error.kind === 'timeout') return { title: 'A análise demorou demais', message: 'A análise está demorando mais que o esperado. Tente novamente.' };
    if (error.kind === 'contract') return { title: 'Resposta incompatível', message: 'O serviço de análise respondeu em um formato incompatível. Tente novamente mais tarde.' };
    if (error.kind === 'forbidden') return { title: 'Acesso não permitido', message: error.message || 'Seu perfil não pode pedir análises.' };
    if (error.kind === 'rate_limited') return { title: 'Muitas solicitações', message: 'Aguarde um pouco antes de pedir outra análise.' };
  }
  return { title: 'Não foi possível concluir a análise', message: 'Não foi possível concluir a análise. Tente novamente.' };
}
