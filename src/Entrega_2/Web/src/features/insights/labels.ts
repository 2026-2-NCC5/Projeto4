import { STATUS_META } from '@/features/support/labels';
import type { AgentInsights, AgentRunStatus, AssistantIntent, AssistantResponseStatus, MetricsBreakdown, SupportTicketStatus } from '@/types/api';

/**
 * Rótulos em português para as chaves que a API devolve cruas nos indicadores (tipos de recomendação,
 * intenções e situações do assistente). Chave desconhecida → o rótulo que veio da API (nunca some da lista).
 */

/** Regras do Agent Service (agent-service/app/config/rules.yaml): o tipo da recomendação é o nome da regra. */
export const RECOMMENDATION_TYPE_LABELS: Record<string, string> = {
  pending_activity: 'Atividade pendente',
  attendance_attention: 'Frequência em atenção',
  attendance_critical: 'Frequência abaixo do mínimo',
  performance_attention: 'Desempenho em atenção',
  institutional_validation: 'Dados a confirmar com a instituição',
};

export const RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  recommendation: 'Com recomendação',
  no_action: 'Sem ação necessária',
  abstained: 'Absteve-se (dados insuficientes ou pouca confiança)',
};

export const ASSISTANT_STATUS_LABELS: Record<AssistantResponseStatus, string> = {
  success: 'Respondida',
  empty: 'Sem dados para mostrar',
  not_found: 'Não encontrada',
  needs_clarification: 'Pediu esclarecimento',
  abstained: 'Absteve-se',
  human_validation: 'Encaminhada para validação humana',
  refused: 'Recusada (fora do permitido)',
};

export const INTENT_LABELS: Partial<Record<AssistantIntent, string>> = {
  greeting: 'Saudação',
  help: 'Ajuda sobre o assistente',
  unknown: 'Não entendida',
  get_student_summary: 'Resumo acadêmico',
  get_pending_items: 'Pendências',
  get_subjects: 'Disciplinas',
  get_subject_details: 'Detalhes de disciplina',
  get_assessments: 'Avaliações',
  get_next_assessment: 'Próxima avaliação',
  get_latest_grade: 'Última nota',
  get_attendance: 'Frequência',
  get_subject_attendance: 'Frequência por disciplina',
  run_student_analysis: 'Pedido de análise do Agente',
  get_recommendations: 'Recomendações',
  explain_recommendation: 'Explicação de recomendação',
  get_next_action: 'Próximo passo',
  get_agent_history: 'Histórico de análises',
  request_human_help: 'Pedido de atendimento humano',
  predict_outcome: 'Pedido de previsão de resultado',
  administrative_request: 'Pedido administrativo',
  access_other_student: 'Dados de outro aluno (recusado)',
  repeat_last: 'Repetir resposta',
  stop_speaking: 'Parar de falar',
  go_back: 'Voltar',
  clarify_last: 'Esclarecer a última resposta',
  open_screen: 'Abrir tela',
  get_queue_status: 'Fila presencial: situação',
  get_queue_current_call: 'Fila presencial: senha chamada',
  get_queue_estimate: 'Fila presencial: estimativa',
  knowledge_question: 'Pergunta à base de conhecimento',
};

const pick = (labels: Record<string, string | undefined>, item: MetricsBreakdown): MetricsBreakdown => ({ ...item, label: labels[item.key] ?? item.label });

export const recommendationTypeLabel = (key: string): string => RECOMMENDATION_TYPE_LABELS[key] ?? key;
export const labelRecommendationTypes = (items: MetricsBreakdown[]) => items.map((item) => pick(RECOMMENDATION_TYPE_LABELS, item));
export const labelIntents = (items: MetricsBreakdown[]) => items.map((item) => pick(INTENT_LABELS, item));
/** Situações gravadas pelo assistente; falhas aparecem como "error:CÓDIGO". */
export const labelAssistantStatuses = (items: MetricsBreakdown[]) =>
  items.map((item) => (item.key.startsWith('error:') ? { ...item, label: `Erro ao responder (${item.key.slice(6)})` } : pick(ASSISTANT_STATUS_LABELS, item)));

/** Situação do chamado com as palavras da equipe ("Aguardando aluno", não "Aguardando você"). */
export const labelTicketStatuses = (items: MetricsBreakdown[]) =>
  items.map((item) => (item.key in STATUS_META ? { ...item, label: STATUS_META[item.key as SupportTicketStatus].short } : item));

/** Por que o provedor pedido em AI_PROVIDER não está em uso (o servidor volta para o existente). */
export const FALLBACK_REASON_LABELS: Record<string, string> = {
  jev_disabled: 'O JEV está desligado neste ambiente (JEV_ENABLED=false), então o assistente continua com o provedor existente.',
  jev_not_configured: 'O JEV foi ligado, mas não há contrato técnico nem credenciais definidos, então o assistente continua com o provedor existente.',
};

export const PROVIDER_ID_LABELS: Record<AgentInsights['provider']['requested'], string> = {
  existing: 'Provedor existente (regras + base de conhecimento)',
  jev: 'JEV',
};

/**
 * Situação do JEV para exibição. O JEV é uma integração planejada: o adaptador não faz chamadas de rede e
 * nunca produz resposta, então qualquer situação vira "planejado" com o detalhe informado pela API.
 */
export function jevStatusLabel(status: string): string {
  if (status === 'disabled') return 'Planejado · desligado';
  if (status === 'not_configured') return 'Planejado · não configurado';
  return 'Planejado';
}
