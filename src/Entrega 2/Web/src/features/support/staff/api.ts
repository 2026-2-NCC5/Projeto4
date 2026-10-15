import { api, isApiError } from '@/services/api/client';
import { staffSupportApi } from '@/services/api/endpoints';
import type {
  AsaDashboard,
  AuditEventList,
  StudentContext,
  StudentContextList,
  SupportAttachmentLink,
  SupportStaffTicket,
  SupportTicketList,
} from '@/types/api';

const enc = encodeURIComponent;

/** Filtros aceitos pela fila da equipe (GET /api/support/staff/tickets). Valores fora da lista são ignorados pelo servidor. */
export interface StaffTicketQuery {
  /** lista separada por vírgula de SupportTicketStatus */
  status?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  assigned?: 'mine' | 'unassigned';
  team?: string;
  category?: string;
  /** lista separada por vírgula (normal, high, urgent) */
  priority?: string;
  /** at_risk = prazo próximo ou excedido; near_deadline = só prazo próximo (ainda não vencido); overdue = só excedido */
  sla?: 'at_risk' | 'near_deadline' | 'overdue';
  /** só chamados com mensagens do aluno ainda não lidas pela equipe */
  unread?: '1';
  sort?: 'updated' | 'due';
}

/**
 * Chamadas da equipe que o `staffSupportApi` compartilhado ainda não tem (fila com filtros operacionais,
 * confirmação de leitura, link de anexo e descarte de envio). As ações de escrita reaproveitam `staffSupportApi`.
 */
export const staffTicketsApi = {
  ...staffSupportApi,
  list: (query: StaffTicketQuery = {}) => api.get<SupportTicketList>('/api/support/staff/tickets', { query: { ...query } }),
  markRead: (id: string) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/read`),
  attachmentLink: (ticketId: string, attachmentId: string) =>
    api.get<SupportAttachmentLink>(`/api/support/staff/tickets/${enc(ticketId)}/attachments/${enc(attachmentId)}/link`),
  deleteUpload: (id: string) => api.delete<void>(`/api/support/staff/uploads/${enc(id)}`),
};

export interface StudentsQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  /** prefixo da ação (ex.: "ticket.") */
  action?: string;
  /** AAAA-MM-DD */
  from?: string;
  to?: string;
}

/** Operação do ASA: painel, alunos atendidos e a própria trilha de auditoria. */
export const operationsApi = {
  dashboard: () => api.get<AsaDashboard>('/api/asa/dashboard'),
  students: (query: StudentsQuery = {}) => api.get<StudentContextList>('/api/asa/students', { query: { ...query } }),
  /** cada consulta é registrada na auditoria (finalidade: atendimento) */
  student: (studentId: string) => api.get<StudentContext>(`/api/asa/students/${enc(studentId)}`),
  myAudit: (query: AuditQuery = {}) => api.get<AuditEventList>('/api/audit/mine', { query: { ...query } }),
};

export const staffKeys = {
  catalog: ['support', 'catalog'] as const,
  tickets: ['staff', 'tickets'] as const,
  list: (query: StaffTicketQuery) => ['staff', 'tickets', 'list', query] as const,
  ticket: (id: string) => ['staff', 'ticket', id] as const,
  dashboard: ['asa', 'dashboard'] as const,
  students: (query: StudentsQuery) => ['asa', 'students', query] as const,
  student: (id: string) => ['asa', 'student', id] as const,
  audit: (query: AuditQuery) => ['audit', 'mine', query] as const,
};

/** Outra pessoa alterou o chamado entre a leitura e a ação (versão otimista no servidor). */
export const isTicketChanged = (error: unknown): boolean => isApiError(error) && error.kind === 'conflict' && error.reason === 'ticket_changed';
export const isForbidden = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFound = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';
