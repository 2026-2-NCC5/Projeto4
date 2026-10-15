import { API_ROUTES, VOICE } from '../config/services';
import type { SendAssistantMessageOptions } from '../types/assistant';
import type { AssistantMessageRequest, AssistantResponse } from '../types/api';

import { request } from './apiClient';

/**
 * Envia uma mensagem (fala transcrita ou texto) ao assistente.
 * Toda a interpretação de intenção acontece na API — o app só envia o texto e o contexto recebido.
 * A identidade do estudante vem do token: nunca enviar studentId.
 */
export const sendMessage = (body: AssistantMessageRequest, { correlationId, signal }: SendAssistantMessageOptions): Promise<AssistantResponse> =>
  request<AssistantResponse>(API_ROUTES.assistant.message, {
    method: 'POST',
    body,
    timeoutMs: VOICE.ASSISTANT_TIMEOUT_MS,
    correlationId,
    signal,
  });

export const assistantService = { sendMessage };
