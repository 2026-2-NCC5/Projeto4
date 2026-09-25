import type {
  AgentRunStatus,
  AssessmentType,
  AssistantItemTone,
  AssistantResponseStatus,
  EnrollmentStatus,
  PendingItemStatus,
  UserRole,
} from '../types/api';
import type { PillTone } from '../types/ui';

const EMPTY = '—';

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Datas sem hora (YYYY-MM-DD) são interpretadas como dia local, não UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "16/09/2026" */
export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "16/09/2026 às 21:05" */
export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return `${formatDate(value)} às ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const WEEKDAYS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** "QUINTA-FEIRA, 16 SET" */
export function formatGreetingDate(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()] ?? ''}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()] ?? ''}`;
}

/** Mês abreviado de uma data ISO ("AGO"), usado em badges de prazo. */
export function formatMonthShort(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? (MONTHS_SHORT[date.getMonth()] ?? EMPTY) : EMPTY;
}

export function formatDayOfMonth(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? pad2(date.getDate()) : EMPTY;
}

/** Número com vírgula decimal (pt-BR). */
export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return value.toFixed(digits).replace('.', ',');
}

/** Nota em escala 0-10: "8,2". */
export function formatScore(value: number | null | undefined): string {
  return formatNumber(value, 1);
}

/** Taxa 0-1 → "90%". */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return EMPTY;
  return `${Math.round(ratio * 100)}%`;
}

/** Confiança 0-1 → "90% de confiança" (null quando não informada). */
export function formatConfidence(confidence: number | null | undefined): string | null {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}% de confiança`;
}

export function firstName(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim();
  return name.split(/\s+/)[0] || 'Estudante';
}

export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'E';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ------------------------------------------------------------ recomendações

const RECOMMENDATION_TYPE_LABELS: Record<string, string> = {
  pending_activity: 'Atividade pendente',
  attendance_attention: 'Frequência em atenção',
  attendance_critical: 'Frequência abaixo do mínimo',
  performance_attention: 'Desempenho em atenção',
  institutional_validation: 'Validação institucional',
};

export function recommendationTypeLabel(type: string): string {
  return RECOMMENDATION_TYPE_LABELS[type] ?? humanize(type);
}

export function recommendationTypeTone(type: string): PillTone {
  switch (type) {
    case 'attendance_critical':
      return 'danger';
    case 'institutional_validation':
      return 'info';
    case 'pending_activity':
    case 'attendance_attention':
    case 'performance_attention':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Ícone textual — status nunca é comunicado só por cor. */
export function recommendationTypeIcon(type: string): string {
  switch (type) {
    case 'attendance_critical':
      return '⚠';
    case 'institutional_validation':
      return 'ⓘ';
    case 'pending_activity':
    case 'attendance_attention':
    case 'performance_attention':
      return '⚠';
    default:
      return '•';
  }
}

// ------------------------------------------------------------ status da análise

export function runStatusLabel(status: AgentRunStatus): string {
  switch (status) {
    case 'recommendation':
      return 'Com recomendações';
    case 'no_action':
      return 'Sem ações necessárias';
    case 'abstained':
      return 'Sem recomendação confiável';
    default:
      return humanize(String(status));
  }
}

export function runStatusIcon(status: AgentRunStatus): string {
  switch (status) {
    case 'recommendation':
      return '⚠';
    case 'no_action':
      return '✓';
    case 'abstained':
      return 'ⓘ';
    default:
      return '•';
  }
}

export function runStatusTone(status: AgentRunStatus): PillTone {
  switch (status) {
    case 'recommendation':
      return 'warning';
    case 'no_action':
      return 'success';
    case 'abstained':
      return 'neutral';
    default:
      return 'neutral';
  }
}

// ------------------------------------------------------------ acadêmico

export function assessmentTypeLabel(type: AssessmentType): string {
  switch (type) {
    case 'exam':
      return 'Prova';
    case 'assignment':
      return 'Trabalho';
    case 'project':
      return 'Projeto';
    case 'other':
      return 'Outra avaliação';
    default:
      return humanize(String(type));
  }
}

export function pendingStatusLabel(status: PendingItemStatus): string {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'completed':
      return 'Concluída';
    case 'overdue':
      return 'Atrasada';
    default:
      return humanize(String(status));
  }
}

export function pendingStatusIcon(status: PendingItemStatus): string {
  switch (status) {
    case 'pending':
      return '◷';
    case 'completed':
      return '✓';
    case 'overdue':
      return '⚠';
    default:
      return '•';
  }
}

export function pendingStatusTone(status: PendingItemStatus): PillTone {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'completed':
      return 'success';
    case 'overdue':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function pendingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    activity: 'Atividade',
    assignment: 'Trabalho',
    exam: 'Prova',
    document: 'Documento',
    payment: 'Pagamento',
    enrollment: 'Matrícula',
  };
  return map[type] ?? humanize(type);
}

export function enrollmentStatusLabel(status: EnrollmentStatus): string {
  switch (status) {
    case 'active':
      return 'Em andamento';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    default:
      return humanize(String(status));
  }
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'student':
      return 'Estudante';
    case 'institutional_staff':
      return 'Equipe institucional';
    case 'technical_admin':
      return 'Administração técnica';
    default:
      return humanize(String(role));
  }
}

// ------------------------------------------------------------ assistente

export function assistantStatusLabel(status: AssistantResponseStatus): string {
  switch (status) {
    case 'success':
      return 'Resposta';
    case 'empty':
      return 'Nada encontrado';
    case 'not_found':
      return 'Não encontrado';
    case 'needs_clarification':
      return 'Preciso de mais detalhes';
    case 'abstained':
      return 'Sem resposta confiável';
    case 'human_validation':
      return 'Validação humana';
    case 'refused':
      return 'Fora do que posso fazer';
    default:
      return humanize(String(status));
  }
}

export function assistantStatusIcon(status: AssistantResponseStatus): string {
  switch (status) {
    case 'success':
      return '✓';
    case 'needs_clarification':
      return '?';
    case 'refused':
      return '⊘';
    case 'abstained':
    case 'human_validation':
    case 'not_found':
      return 'ⓘ';
    default:
      return '•';
  }
}

export function assistantStatusTone(status: AssistantResponseStatus): PillTone {
  switch (status) {
    case 'success':
      return 'success';
    case 'needs_clarification':
    case 'human_validation':
      return 'info';
    case 'refused':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function assistantItemTone(tone: AssistantItemTone): PillTone {
  switch (tone) {
    case 'attention':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'success':
      return 'success';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Ícone textual do item — o tom nunca é comunicado só por cor. */
export function assistantItemIcon(tone: AssistantItemTone): string {
  switch (tone) {
    case 'attention':
    case 'danger':
      return '⚠';
    case 'success':
      return '✓';
    case 'info':
      return 'ⓘ';
    default:
      return '•';
  }
}

/** Rótulo textual padrão do tom (usado quando o item não traz badge). */
export function assistantItemToneLabel(tone: AssistantItemTone): string {
  switch (tone) {
    case 'attention':
      return 'Atenção';
    case 'danger':
      return 'Crítico';
    case 'success':
      return 'Em dia';
    case 'info':
      return 'Informação';
    default:
      return 'Item';
  }
}
