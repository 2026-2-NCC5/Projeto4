import type { Tone } from '@/components/ui/Display';
import type { AgentRunStatus, AssessmentType, EnrollmentStatus, PendingItemStatus } from '@/types/api';

/**
 * Textos da vida acadêmica e do Agente para o Estudante. Mesmas palavras do aplicativo
 * (Frontend/utils/format.ts) para os mesmos estados.
 */

/** Situação de uma execução do Agente para o Estudante. */
export const RUN_STATUS_META: Record<AgentRunStatus, { label: string; tone: Tone }> = {
  recommendation: { label: 'Com recomendações', tone: 'warning' },
  no_action: { label: 'Sem ações necessárias', tone: 'success' },
  abstained: { label: 'Sem recomendação confiável', tone: 'neutral' },
};

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  exam: 'Prova',
  assignment: 'Trabalho',
  project: 'Projeto',
  other: 'Outra avaliação',
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

/** Só o atraso usa cor de alerta; pendência no prazo é neutra (evita amarelo na lista toda). */
export const PENDING_STATUS_META: Record<PendingItemStatus, { label: string; group: string; tone: Tone }> = {
  overdue: { label: 'Atrasada', group: 'Atrasadas', tone: 'danger' },
  pending: { label: 'Pendente', group: 'Pendentes', tone: 'neutral' },
  completed: { label: 'Concluída', group: 'Concluídas', tone: 'success' },
};

const PENDING_TYPE_LABELS: Record<string, string> = {
  activity: 'Atividade',
  assignment: 'Trabalho',
  exam: 'Prova',
  document: 'Documento',
  payment: 'Pagamento',
  enrollment: 'Matrícula',
};

const RECOMMENDATION_TYPE_META: Record<string, { label: string; tone: Tone }> = {
  pending_activity: { label: 'Atividade pendente', tone: 'warning' },
  attendance_attention: { label: 'Frequência em atenção', tone: 'warning' },
  attendance_critical: { label: 'Frequência abaixo do mínimo', tone: 'danger' },
  performance_attention: { label: 'Desempenho em atenção', tone: 'warning' },
  institutional_validation: { label: 'Validação institucional', tone: 'info' },
};

/** "pending_activity" → "Pending activity" (tipos novos do servidor nunca quebram a tela). */
function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—';
}

export const pendingTypeLabel = (type: string): string => PENDING_TYPE_LABELS[type] ?? humanize(type);

export const recommendationTypeMeta = (type: string): { label: string; tone: Tone } => RECOMMENDATION_TYPE_META[type] ?? { label: humanize(type), tone: 'neutral' };

/**
 * Frequência mínima exibida ("Mínimo exigido: 75%") e faixa de atenção logo acima dela, os mesmos limiares do
 * Agente (agent-service/app/config/thresholds.yaml: critical_rate 0,75 e attention_rate 0,80). Só cor e selo:
 * a regra oficial é da instituição.
 */
export const ATTENDANCE_MINIMUM_RATE = 0.75;
export const ATTENDANCE_ATTENTION_RATE = 0.8;

export type AttendanceLevel = 'ok' | 'attention' | 'critical' | 'unknown';

export function attendanceLevel(rate: number | null | undefined): AttendanceLevel {
  if (rate === null || rate === undefined) return 'unknown';
  if (rate < ATTENDANCE_MINIMUM_RATE) return 'critical';
  if (rate < ATTENDANCE_ATTENTION_RATE) return 'attention';
  return 'ok';
}

export const ATTENDANCE_LEVEL_META: Record<Exclude<AttendanceLevel, 'ok' | 'unknown'>, { label: string; tone: Tone }> = {
  attention: { label: 'Atenção', tone: 'warning' },
  critical: { label: 'Abaixo do mínimo', tone: 'danger' },
};

/** Abaixo desta fração da nota máxima a nota é destacada (apenas visual; mesmo limiar de desempenho do Agente). */
export const LOW_SCORE_RATIO = 0.6;

export const isLowScore = (score: number | null, maxScore: number): boolean => score !== null && maxScore > 0 && score / maxScore < LOW_SCORE_RATIO;

/** 0.9 → "90% de confiança" (null quando o agente não informou). */
export function formatConfidence(confidence: number | null | undefined): string | null {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}% de confiança`;
}

export const pluralize = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;
