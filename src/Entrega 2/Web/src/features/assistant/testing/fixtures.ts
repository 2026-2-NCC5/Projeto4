import type { AssistantResponse } from '@/types/api';

/** Resposta do assistente no formato do contrato (só para os *.test.tsx). */
export function makeAssistantResponse(overrides: Partial<AssistantResponse> = {}): AssistantResponse {
  return {
    interactionId: 'int-1',
    requestId: 'req-1',
    correlationId: 'corr-1',
    inputType: 'text',
    intent: 'get_pending_items',
    intentConfidence: 0.88,
    entities: {},
    status: 'success',
    display: {
      title: 'Atividades pendentes',
      message: 'Você tem 1 atividade pendente.',
      items: [{ id: 'pending-1', title: 'Entrega do trabalho prático', description: 'Banco de Dados', meta: 'Prazo 20/10 (em 5 dias)', badge: null, tone: 'attention', subjectId: 'subject-db' }],
      recommendations: [],
    },
    speech: { text: 'Você tem uma atividade pendente.' },
    nextActions: [{ type: 'navigate', label: 'Ver pendências', target: 'academic.pending' }],
    clientCommand: null,
    navigation: null,
    requiresHumanValidation: false,
    abstained: false,
    abstentionReason: null,
    runId: null,
    context: { lastIntent: 'get_pending_items' },
    createdAt: '2026-10-15T12:00:00.000Z',
    provider: { id: 'existing', label: 'Regras do ASA Conecta e base de conhecimento (sem LLM)' },
    ...overrides,
  };
}
