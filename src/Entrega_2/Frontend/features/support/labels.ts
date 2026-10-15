import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';

import type { SupportSlaStatus, SupportTicketEventType, SupportTicketPriority, SupportTicketStatus } from '../../types/api';
import type { SupportListFilter } from '../../types/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Tons semânticos do Atendimento (sempre combinados com ícone e texto — nunca só cor). */
export type SupportTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface StatusMeta {
  /** texto completo ("Encaminhado para a equipe responsável") */
  label: string;
  /** versão curta para badges e listas */
  short: string;
  /** o que está acontecendo, em linguagem do estudante */
  description: string;
  tone: SupportTone;
  icon: IconName;
}

/** O estudante nunca vê o identificador técnico da situação. */
export const STATUS_META: Record<SupportTicketStatus, StatusMeta> = {
  submitted: { label: 'Enviado', short: 'Enviado', description: 'Sua solicitação foi enviada e está chegando ao ASA.', tone: 'neutral', icon: 'paper-plane-outline' },
  received: { label: 'Recebido pelo ASA', short: 'Recebido', description: 'O ASA recebeu sua solicitação e vai fazer a triagem.', tone: 'info', icon: 'mail-open-outline' },
  triage: { label: 'Em triagem', short: 'Em triagem', description: 'O ASA está verificando qual equipe deve cuidar da sua solicitação.', tone: 'info', icon: 'git-branch-outline' },
  assigned: { label: 'Encaminhado para a equipe responsável', short: 'Encaminhado', description: 'Sua solicitação já está com a equipe que vai cuidar dela.', tone: 'info', icon: 'people-outline' },
  in_analysis: { label: 'Em análise', short: 'Em análise', description: 'Sua solicitação já foi recebida e está sendo verificada pela equipe responsável.', tone: 'info', icon: 'search-outline' },
  in_progress: { label: 'Em atendimento', short: 'Em atendimento', description: 'A equipe já está trabalhando na solução.', tone: 'info', icon: 'construct-outline' },
  waiting_student: { label: 'Aguardando você', short: 'Aguardando você', description: 'O ASA precisa de uma informação sua para continuar.', tone: 'warning', icon: 'hand-left-outline' },
  waiting_department: { label: 'Aguardando setor responsável', short: 'Aguardando setor', description: 'O ASA consultou outro setor e aguarda o retorno.', tone: 'neutral', icon: 'hourglass-outline' },
  waiting_external: { label: 'Aguardando retorno externo', short: 'Aguardando retorno', description: 'A solicitação depende de um retorno de fora da instituição.', tone: 'neutral', icon: 'hourglass-outline' },
  resolved: { label: 'Resolvido', short: 'Resolvido', description: 'Sua solicitação foi concluída.', tone: 'success', icon: 'checkmark-circle-outline' },
  closed: { label: 'Encerrado', short: 'Encerrado', description: 'O atendimento foi finalizado. O histórico continua disponível.', tone: 'neutral', icon: 'lock-closed-outline' },
  cancelled: { label: 'Cancelado', short: 'Cancelado', description: 'Este chamado foi cancelado. O histórico continua disponível.', tone: 'neutral', icon: 'close-circle-outline' },
  reopened: { label: 'Reaberto', short: 'Reaberto', description: 'O chamado voltou para a equipe a partir do seu pedido.', tone: 'info', icon: 'refresh-outline' },
};

export const FINISHED_STATUSES: readonly SupportTicketStatus[] = ['resolved', 'closed', 'cancelled'];
export const isFinished = (status: SupportTicketStatus): boolean => FINISHED_STATUSES.includes(status);

export const ACTIVE_STATUSES: readonly SupportTicketStatus[] = ['submitted', 'received', 'triage', 'assigned', 'in_analysis', 'in_progress', 'waiting_student', 'waiting_department', 'waiting_external', 'reopened'];

/** Filtros de "Meus chamados": os quatro principais viram chips; os detalhados ficam na folha "Filtros". */
export type TicketFilterKey = SupportListFilter | 'open' | 'received' | 'analysis' | 'in_progress' | 'waiting_department' | 'resolved' | 'cancelled';

export interface TicketFilter {
  key: TicketFilterKey;
  label: string;
  /** situações enviadas à API (undefined = todas) */
  statuses?: readonly SupportTicketStatus[];
}

export const PRIMARY_FILTERS: readonly TicketFilter[] = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Em andamento', statuses: ACTIVE_STATUSES },
  { key: 'waiting_student', label: 'Aguardando você', statuses: ['waiting_student'] },
  { key: 'finished', label: 'Concluídos', statuses: FINISHED_STATUSES },
];

export const DETAILED_FILTERS: readonly TicketFilter[] = [
  { key: 'open', label: 'Abertos', statuses: ['submitted', 'received', 'reopened'] },
  { key: 'received', label: 'Recebidos', statuses: ['received'] },
  { key: 'analysis', label: 'Em análise', statuses: ['triage', 'assigned', 'in_analysis'] },
  { key: 'in_progress', label: 'Em atendimento', statuses: ['in_progress'] },
  { key: 'waiting_student', label: 'Aguardando estudante', statuses: ['waiting_student'] },
  { key: 'waiting_department', label: 'Aguardando setor', statuses: ['waiting_department', 'waiting_external'] },
  { key: 'resolved', label: 'Resolvidos', statuses: ['resolved', 'closed'] },
  { key: 'cancelled', label: 'Cancelados', statuses: ['cancelled'] },
];

export function findFilter(key: TicketFilterKey): TicketFilter {
  return PRIMARY_FILTERS.find((filter) => filter.key === key) ?? DETAILED_FILTERS.find((filter) => filter.key === key) ?? (PRIMARY_FILTERS[0] as TicketFilter);
}

export const PRIORITY_LABELS: Record<SupportTicketPriority, string> = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

export interface SlaMeta {
  label: string;
  tone: SupportTone;
  icon: IconName;
}

/** Prazo com transparência, sem alarmismo: só "excedido" usa o tom de erro. */
export const SLA_META: Record<SupportSlaStatus, SlaMeta> = {
  on_track: { label: 'Dentro do prazo', tone: 'neutral', icon: 'time-outline' },
  attention: { label: 'Dentro do prazo', tone: 'neutral', icon: 'time-outline' },
  near_deadline: { label: 'Prazo próximo', tone: 'warning', icon: 'time-outline' },
  overdue: { label: 'Prazo excedido', tone: 'danger', icon: 'alert-circle-outline' },
  paused: { label: 'Prazo pausado enquanto aguardamos você', tone: 'neutral', icon: 'pause-circle-outline' },
  completed: { label: 'Atendimento concluído', tone: 'success', icon: 'checkmark-circle-outline' },
};

export const EVENT_ICONS: Record<SupportTicketEventType, IconName> = {
  ticket_created: 'create-outline',
  ticket_received: 'mail-open-outline',
  ticket_triaged: 'git-branch-outline',
  ticket_assigned: 'people-outline',
  status_changed: 'swap-horizontal-outline',
  message_received: 'chatbubble-ellipses-outline',
  message_sent: 'chatbubble-outline',
  file_uploaded: 'attach-outline',
  student_action_required: 'hand-left-outline',
  student_response_received: 'arrow-undo-outline',
  department_forwarded: 'arrow-forward-circle-outline',
  resolution_proposed: 'bulb-outline',
  ticket_resolved: 'checkmark-circle-outline',
  ticket_closed: 'lock-closed-outline',
  ticket_reopened: 'refresh-outline',
  ticket_cancelled: 'close-circle-outline',
  rating_submitted: 'star-outline',
  priority_changed: 'flag-outline',
  internal_note: 'document-text-outline',
};

/** Eventos que valem destaque (expansíveis e com aviso tátil quando chegam com a tela aberta). */
export const IMPORTANT_EVENTS: ReadonlySet<SupportTicketEventType> = new Set(['student_action_required', 'ticket_resolved', 'department_forwarded', 'ticket_reopened', 'ticket_cancelled']);

/** Ícones das categorias do catálogo (ids estáveis da API). */
export const CATEGORY_ICONS: Record<string, IconName> = {
  academic: 'school-outline',
  enrollment: 'clipboard-outline',
  financial: 'card-outline',
  documents: 'document-text-outline',
  scholarships: 'ribbon-outline',
  internship: 'briefcase-outline',
  infrastructure: 'business-outline',
  systems_access: 'key-outline',
  asa_service: 'chatbubbles-outline',
  other: 'help-circle-outline',
};

export const categoryIcon = (categoryId: string): IconName => CATEGORY_ICONS[categoryId] ?? 'help-circle-outline';

const FILE_ICONS: [RegExp, IconName][] = [
  [/^image\//, 'image-outline'],
  [/pdf$/, 'document-outline'],
  [/word|msword/, 'document-text-outline'],
  [/^text\//, 'reader-outline'],
];

export function fileIcon(mimeType: string): IconName {
  return FILE_ICONS.find(([pattern]) => pattern.test(mimeType))?.[1] ?? 'attach-outline';
}

export function fileKind(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Imagem';
  if (mimeType.includes('word')) return 'Documento';
  if (mimeType === 'text/plain') return 'Texto';
  return 'Arquivo';
}
