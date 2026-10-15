import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isApiError, messageForError } from '@/services/api/client';
import { assistantApi } from '@/services/api/endpoints';
import type { AssistantConversationContext, AssistantResponse } from '@/types/api';

/** Pergunta enviada quando a API sugere uma nova análise (a API interpreta; o portal só envia o texto). */
export const RUN_ANALYSIS_PROMPT = 'Analise minha situação acadêmica';
/** Limite do servidor (assistantMessageSchema: 1–500 caracteres). */
export const MAX_QUESTION_LENGTH = 500;

export type TurnStatus = 'pending' | 'answered' | 'failed';

export interface AssistantTurn {
  id: string;
  question: string;
  askedAt: string;
  status: TurnStatus;
  response: AssistantResponse | null;
  error: unknown;
}

export interface AssistantConversation {
  turns: AssistantTurn[];
  /** contexto mínimo devolvido pela API e reenviado na próxima pergunta (nunca define identidade) */
  context: AssistantConversationContext;
}

const EMPTY: AssistantConversation = { turns: [], context: {} };

/**
 * A conversa fica SÓ na memória (cache do React Query): sobrevive à navegação dentro do portal, some ao recarregar
 * a página, ao sair da conta (o cache é limpo) ou depois de 30 minutos sem abrir o assistente. Nada vai para o
 * localStorage.
 */
export const conversationKey = ['assistant', 'conversation'] as const;
const KEEP_FOR_MS = 30 * 60_000;

/** Só os campos aceitos pelo servidor (o corpo é validado de forma estrita). */
function pickContext(context: AssistantConversationContext | null | undefined): AssistantConversationContext {
  const picked: AssistantConversationContext = {};
  if (!context) return picked;
  if (typeof context.lastIntent === 'string') picked.lastIntent = context.lastIntent;
  if (typeof context.lastSubjectId === 'string') picked.lastSubjectId = context.lastSubjectId;
  if (typeof context.lastRecommendationId === 'string') picked.lastRecommendationId = context.lastRecommendationId;
  if (typeof context.lastRunId === 'string') picked.lastRunId = context.lastRunId;
  return picked;
}

let sequence = 0;
const newTurnId = (): string => `turn-${Date.now().toString(36)}-${(sequence += 1)}`;

/** 404 da rota do assistente = recurso desligado no servidor (VOICE_ASSISTANT_ENABLED=false). */
export const isAssistantDisabledError = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';

/** Mensagem honesta para a falha de uma pergunta (mesmos textos do app quando existem). */
export function assistantErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Não foi possível obter uma resposta agora. Tente novamente.';
  switch (error.kind) {
    case 'not_found':
      return error.message || 'O assistente está desativado neste ambiente.';
    case 'forbidden':
      return error.message || 'Seu perfil não tem acesso ao assistente.';
    case 'dependency':
      return error.reason === 'academic_source_unavailable'
        ? error.message
        : `Um serviço que o assistente usa está indisponível agora. ${error.message || 'Tente novamente em instantes.'}`;
    case 'timeout':
      return 'A resposta está demorando mais que o esperado. Tente novamente.';
    case 'contract':
      return 'O serviço de análise respondeu em um formato incompatível. Tente novamente mais tarde.';
    case 'validation':
      return error.message || 'Revise a pergunta e envie de novo.';
    case 'offline':
    case 'network':
    case 'rate_limited':
    case 'unauthorized':
      return messageForError(error);
    default:
      return 'Não foi possível obter uma resposta agora. Tente novamente.';
  }
}

/** Vale a pena tentar de novo a mesma pergunta (falhas passageiras). */
export const isRetryable = (error: unknown): boolean => !isApiError(error) || ['network', 'offline', 'timeout', 'server', 'dependency', 'contract', 'rate_limited'].includes(error.kind);

export function useAssistantConversation() {
  const queryClient = useQueryClient();
  const read = useCallback(() => queryClient.getQueryData<AssistantConversation>(conversationKey) ?? EMPTY, [queryClient]);
  const query = useQuery({ queryKey: conversationKey, queryFn: read, initialData: EMPTY, staleTime: Infinity, gcTime: KEEP_FOR_MS });
  const conversation = query.data;

  const update = useCallback(
    (change: (current: AssistantConversation) => AssistantConversation) => queryClient.setQueryData<AssistantConversation>(conversationKey, (current) => change(current ?? EMPTY)),
    [queryClient],
  );

  /** Envia uma pergunta (uma por vez). A resposta é gravada mesmo se a pessoa sair da página antes. */
  const ask = useCallback(
    async (raw: string, replaceTurnId?: string) => {
      const text = raw.trim().slice(0, MAX_QUESTION_LENGTH);
      const current = read();
      if (!text || current.turns.some((turn) => turn.status === 'pending')) return;
      const id = newTurnId();
      const turn: AssistantTurn = { id, question: text, askedAt: new Date().toISOString(), status: 'pending', response: null, error: null };
      update((state) => ({ ...state, turns: [...state.turns.filter((item) => item.id !== replaceTurnId), turn] }));
      const context = pickContext(current.context);
      try {
        const response = await assistantApi.message({
          inputType: 'text',
          text,
          currentScreen: 'assistant',
          ...(Object.keys(context).length > 0 ? { conversationContext: context } : {}),
        });
        update((state) =>
          state.turns.some((item) => item.id === id)
            ? { context: pickContext(response.context), turns: state.turns.map((item) => (item.id === id ? { ...item, status: 'answered', response } : item)) }
            : state,
        );
      } catch (error) {
        update((state) => ({ ...state, turns: state.turns.map((item) => (item.id === id ? { ...item, status: 'failed', error } : item)) }));
      }
    },
    [read, update],
  );

  const retry = useCallback(
    (turnId: string) => {
      const turn = read().turns.find((item) => item.id === turnId);
      if (turn) void ask(turn.question, turnId);
    },
    [ask, read],
  );

  const reset = useCallback(() => queryClient.setQueryData<AssistantConversation>(conversationKey, EMPTY), [queryClient]);

  return { conversation, ask, retry, reset, pending: conversation.turns.some((turn) => turn.status === 'pending') };
}
