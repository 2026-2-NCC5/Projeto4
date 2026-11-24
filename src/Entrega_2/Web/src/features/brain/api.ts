import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api/client';
import type { AssistantBrainOverview, AssistantKnowledgeGap, AssistantKnowledgeGapStatus, AssistantKnowledgeGapUpdate } from '@/types/api';

/**
 * Cérebro do assistente: as notas do vault do Obsidian (Backend/cerebro, compiladas na API) e as perguntas
 * que o assistente não soube responder. Ler exige `kb:read:all`; mudar a situação de uma pergunta, `kb:write`.
 */
export const brainKeys = {
  all: ['assistant-brain'] as const,
  overview: (status: AssistantKnowledgeGapStatus) => ['assistant-brain', status] as const,
};

export function useBrainOverview(status: AssistantKnowledgeGapStatus, enabled = true) {
  return useQuery({
    queryKey: brainKeys.overview(status),
    queryFn: () => api.get<AssistantBrainOverview>('/api/assistant-brain', { query: { status, limit: 100 } }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUpdateGap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AssistantKnowledgeGapUpdate & { id: string }) => api.patch<AssistantKnowledgeGap>(`/api/assistant-brain/gaps/${encodeURIComponent(id)}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: brainKeys.all }),
  });
}
