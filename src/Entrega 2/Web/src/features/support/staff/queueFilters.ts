import { ACTIVE_STATUSES, FINISHED_STATUSES } from '@/features/support/labels';
import type { SupportTicketPriority, SupportTicketStatus } from '@/types/api';
import type { StaffTicketQuery } from './api';

/**
 * Filtros da fila guardados na URL (compartilháveis e preservados ao voltar do atendimento).
 * Os nomes dos parâmetros são os mesmos da API para que os atalhos do painel apontem direto para a fila filtrada:
 * /asa/chamados?sla=overdue · ?assigned=unassigned · ?unread=1 · ?status=waiting_student …
 */

export type StatusGroup = 'active' | 'triage' | 'waiting_student' | 'finished' | 'all' | 'custom';

const ALL_STATUSES: readonly SupportTicketStatus[] = [...ACTIVE_STATUSES, ...FINISHED_STATUSES];
export const TRIAGE_STATUSES: readonly SupportTicketStatus[] = ['submitted', 'received', 'triage', 'reopened'];

export const STATUS_GROUPS: Record<Exclude<StatusGroup, 'all' | 'custom'>, readonly SupportTicketStatus[]> = {
  active: ACTIVE_STATUSES,
  triage: TRIAGE_STATUSES,
  waiting_student: ['waiting_student'],
  finished: FINISHED_STATUSES,
};

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  active: 'Ativos',
  triage: 'Aguardando triagem',
  waiting_student: 'Aguardando aluno',
  finished: 'Concluídos',
  all: 'Todos',
  custom: 'Seleção do link',
};

export const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'high,urgent', label: 'Alta ou urgente' },
  { value: 'normal', label: 'Normal' },
];

export interface QueueFilters {
  group: StatusGroup;
  /** situações enviadas à API (vazio = todas) */
  statuses: SupportTicketStatus[];
  search: string;
  team: string;
  category: string;
  priority: string;
  assigned: '' | 'mine' | 'unassigned';
  sla: '' | 'at_risk' | 'near_deadline' | 'overdue';
  unread: boolean;
  sort: 'updated' | 'due';
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value) => b.includes(value));

const isStatus = (value: string): value is SupportTicketStatus => (ALL_STATUSES as readonly string[]).includes(value);
const PRIORITY_ORDER: readonly SupportTicketPriority[] = ['normal', 'high', 'urgent'];

export function parseQueueFilters(params: URLSearchParams): QueueFilters {
  const rawStatus = params.get('status')?.trim() ?? '';
  let group: StatusGroup = 'active';
  let statuses: SupportTicketStatus[] = [...ACTIVE_STATUSES];
  if (rawStatus === 'all') {
    group = 'all';
    statuses = [];
  } else if (rawStatus) {
    const parsed = [...new Set(rawStatus.split(',').map((value) => value.trim()).filter(isStatus))];
    if (parsed.length > 0) {
      statuses = parsed;
      const match = (Object.keys(STATUS_GROUPS) as Array<keyof typeof STATUS_GROUPS>).find((key) => sameSet(STATUS_GROUPS[key], parsed));
      group = match ?? 'custom';
    }
  }
  const assigned = params.get('assigned');
  const sla = params.get('sla');
  // ordem canônica (normal, high, urgent) para casar com as opções do filtro
  const requested = (params.get('priority') ?? '').split(',').map((value) => value.trim());
  const priority = PRIORITY_ORDER.filter((value) => requested.includes(value)).join(',');
  return {
    group,
    statuses,
    search: params.get('search')?.trim() ?? '',
    team: params.get('team') ?? '',
    category: params.get('category') ?? '',
    priority,
    assigned: assigned === 'mine' || assigned === 'unassigned' ? assigned : '',
    sla: sla === 'at_risk' || sla === 'near_deadline' || sla === 'overdue' ? sla : '',
    unread: params.get('unread') === '1',
    sort: params.get('sort') === 'due' ? 'due' : 'updated',
  };
}

/** Parâmetros da API para os filtros (sem cursor nem limite). */
export function toStaffQuery(filters: QueueFilters): StaffTicketQuery {
  const query: StaffTicketQuery = {};
  if (filters.statuses.length > 0) query.status = filters.statuses.join(',');
  if (filters.search) query.search = filters.search;
  if (filters.assigned) query.assigned = filters.assigned;
  if (filters.team) query.team = filters.team;
  if (filters.category) query.category = filters.category;
  if (filters.priority) query.priority = filters.priority;
  if (filters.sla) query.sla = filters.sla;
  if (filters.unread) query.unread = '1';
  if (filters.sort === 'due') query.sort = 'due';
  return query;
}

/** Valor do parâmetro `status` na URL para um grupo (Ativos é o padrão e não aparece na URL). */
export function statusParamFor(group: Exclude<StatusGroup, 'custom'>): string | null {
  if (group === 'active') return null;
  if (group === 'all') return 'all';
  return STATUS_GROUPS[group].join(',');
}

/** Algum filtro além do padrão (Ativos, mais recentes)? */
export function hasActiveFilters(filters: QueueFilters): boolean {
  return filters.group !== 'active' || Boolean(filters.search || filters.team || filters.category || filters.priority || filters.assigned || filters.sla || filters.unread) || filters.sort !== 'updated';
}
