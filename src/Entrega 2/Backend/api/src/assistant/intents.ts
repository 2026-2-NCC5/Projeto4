import type { AssistantIntent } from '../contracts/mobileApi.v1.js';

/**
 * Tipo de cada intenção. Define como ela é atendida:
 * - conversation: resposta fixa, sem dados;
 * - query: consulta objetiva a dados acadêmicos (services);
 * - analysis: passa pelo Agente para o Estudante (recomendação/evidência/abstenção);
 * - policy: pedido que o assistente NUNCA executa (validação humana ou recusa);
 * - control: comando executado apenas no dispositivo.
 */
export type IntentKind = 'conversation' | 'query' | 'analysis' | 'policy' | 'control';

/** Allow-list: o Record garante em tempo de compilação que toda intenção do contrato está aqui. */
export const INTENT_KIND: Record<AssistantIntent, IntentKind> = {
  greeting: 'conversation',
  help: 'conversation',
  unknown: 'conversation',
  request_human_help: 'conversation',
  get_student_summary: 'query',
  get_pending_items: 'query',
  get_subjects: 'query',
  get_subject_details: 'query',
  get_assessments: 'query',
  get_next_assessment: 'query',
  get_latest_grade: 'query',
  get_attendance: 'query',
  get_subject_attendance: 'query',
  get_agent_history: 'query',
  run_student_analysis: 'analysis',
  get_recommendations: 'analysis',
  explain_recommendation: 'analysis',
  get_next_action: 'analysis',
  predict_outcome: 'policy',
  administrative_request: 'policy',
  access_other_student: 'policy',
  repeat_last: 'control',
  stop_speaking: 'control',
  go_back: 'control',
  clarify_last: 'control',
  open_screen: 'control',
};

export const ASSISTANT_INTENTS = Object.keys(INTENT_KIND) as [AssistantIntent, ...AssistantIntent[]];

export function isControlIntent(intent: AssistantIntent): boolean {
  return INTENT_KIND[intent] === 'control';
}

/**
 * Intenções que aceitam troca de disciplina em uma pergunta de continuação
 * ("E em Estruturas de Dados?") e a intenção equivalente com disciplina.
 */
export const SUBJECT_FOLLOW_UP: Partial<Record<AssistantIntent, AssistantIntent>> = {
  get_attendance: 'get_subject_attendance',
  get_subject_attendance: 'get_subject_attendance',
  get_student_summary: 'get_subject_details',
  get_subject_details: 'get_subject_details',
  get_pending_items: 'get_pending_items',
  get_assessments: 'get_assessments',
  get_next_assessment: 'get_next_assessment',
  get_latest_grade: 'get_latest_grade',
};

/** Intenções que usam a disciplina quando informada. */
export const SUBJECT_AWARE_INTENTS = new Set<AssistantIntent>([
  'get_subject_details',
  'get_subject_attendance',
  'get_pending_items',
  'get_assessments',
  'get_next_assessment',
  'get_latest_grade',
]);
