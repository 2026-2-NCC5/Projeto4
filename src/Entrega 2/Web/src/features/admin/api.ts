import { api, isApiError } from '@/services/api/client';
import type {
  AdminHealth,
  AdminOverview,
  AdminSetting,
  AdminTicketList,
  AdminUser,
  AdminUserCreateRequest,
  AdminUserCreateResult,
  AdminUserList,
  AdminUserUpdateRequest,
  AuditEventList,
  AutomationList,
  AutomationRuleInput,
  AutomationRuleView,
  AutomationRunView,
  IntegrationView,
  PermissionMatrix,
  RevokeSessionsResult,
  SlaPolicyUpdate,
  SlaPolicyView,
} from '@/types/api';

const enc = encodeURIComponent;

/** Filtros de GET /api/admin/users (valores fora da lista são ignorados pelo servidor). */
export interface AdminUsersQuery {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive';
  /** false esconde as contas de demonstração (em modo institucional o servidor já as esconde) */
  includeDemo?: boolean;
  page?: number;
  pageSize?: number;
}

/** Filtros de GET /api/admin/tickets: só metadados, nunca conteúdo nem identificação de alunos. */
export interface AdminTicketsQuery {
  /** lista separada por vírgula de SupportTicketStatus */
  status?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

/** Filtros de GET /api/admin/audit-events (`action` é prefixo; datas AAAA-MM-DD no fuso da instituição). */
export interface AdminAuditQuery {
  action?: string;
  outcome?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface InvitationResult {
  sent: boolean;
  message: string;
}

/** Administração da plataforma (/api/admin/*). A autorização é sempre do servidor (matriz de permissões). */
export const adminApi = {
  overview: () => api.get<AdminOverview>('/api/admin/overview'),
  health: () => api.get<AdminHealth>('/api/admin/health'),
  users: (query: AdminUsersQuery = {}) => api.get<AdminUserList>('/api/admin/users', { query: { ...query } }),
  user: (id: string) => api.get<AdminUser>(`/api/admin/users/${enc(id)}`),
  inviteUser: (body: AdminUserCreateRequest) => api.post<AdminUserCreateResult>('/api/admin/users', body),
  updateUser: (id: string, body: AdminUserUpdateRequest) => api.patch<AdminUser>(`/api/admin/users/${enc(id)}`, body),
  revokeSessions: (id: string) => api.post<RevokeSessionsResult>(`/api/admin/users/${enc(id)}/revoke-sessions`),
  resendInvitation: (id: string) => api.post<InvitationResult>(`/api/admin/users/${enc(id)}/invite`),
  permissions: () => api.get<PermissionMatrix>('/api/admin/permissions'),
  slaPolicies: () => api.get<SlaPolicyView[]>('/api/admin/sla-policies'),
  updateSlaPolicy: (categoryId: string, body: SlaPolicyUpdate) => api.put<SlaPolicyView[]>(`/api/admin/sla-policies/${enc(categoryId)}`, body),
  automations: () => api.get<AutomationList>('/api/admin/automations'),
  createAutomation: (body: AutomationRuleInput) => api.post<AutomationRuleView>('/api/admin/automations', body),
  updateAutomation: (id: string, body: Partial<AutomationRuleInput>) => api.patch<AutomationRuleView>(`/api/admin/automations/${enc(id)}`, body),
  automationRuns: (id: string) => api.get<AutomationRunView[]>(`/api/admin/automations/${enc(id)}/runs`),
  integrations: () => api.get<IntegrationView[]>('/api/admin/integrations'),
  settings: () => api.get<AdminSetting[]>('/api/admin/settings'),
  updateSetting: (key: string, value: unknown) => api.put<AdminSetting[]>(`/api/admin/settings/${enc(key)}`, { value }),
  tickets: (query: AdminTicketsQuery = {}) => api.get<AdminTicketList>('/api/admin/tickets', { query: { ...query } }),
  auditEvents: (query: AdminAuditQuery = {}) => api.get<AuditEventList>('/api/admin/audit-events', { query: { ...query } }),
};

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  health: ['admin', 'health'] as const,
  users: ['admin', 'users'] as const,
  userList: (query: AdminUsersQuery) => ['admin', 'users', 'list', query] as const,
  user: (id: string) => ['admin', 'users', 'detail', id] as const,
  permissions: ['admin', 'permissions'] as const,
  sla: ['admin', 'sla'] as const,
  automations: ['admin', 'automations'] as const,
  automationRuns: (id: string) => ['admin', 'automations', 'runs', id] as const,
  integrations: ['admin', 'integrations'] as const,
  settings: ['admin', 'settings'] as const,
  tickets: (query: AdminTicketsQuery) => ['admin', 'tickets', query] as const,
  audit: (query: AdminAuditQuery) => ['admin', 'audit', query] as const,
};

export const reasonOf = (error: unknown): string | null => (isApiError(error) ? error.reason : null);
export const isForbidden = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFound = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';
/** 503 `database_required`: a administração depende do PostgreSQL. */
export const isDatabaseRequired = (error: unknown): boolean => isApiError(error) && error.status === 503 && error.reason === 'database_required';

/**
 * Mensagens padrão do validador do servidor (zod) chegam em inglês quando o esquema não define texto próprio
 * (ex.: limites numéricos). Traduz as formas conhecidas; o resto passa como veio.
 */
export function friendlyMessage(message: string): string {
  const rules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^Too big: expected number to be <=?\s*(-?[\d.]+)$/i, (match) => `Use no máximo ${match[1]}.`],
    [/^Too small: expected number to be >=?\s*(-?[\d.]+)$/i, (match) => `Use no mínimo ${match[1]}.`],
    [/^Too big: expected string to have <=?\s*(\d+) characters?$/i, (match) => `Use até ${match[1]} caracteres.`],
    [/^Too small: expected string to have >=?\s*(\d+) characters?$/i, (match) => `Use pelo menos ${match[1]} caracteres.`],
    [/^Too big: expected array to have <=?\s*(\d+) items?$/i, (match) => `Use no máximo ${match[1]} itens.`],
    [/^Invalid input: expected int, received number$/i, () => 'Use um número inteiro.'],
    [/^Invalid input: expected (\w+), received (\w+)$/i, () => 'Formato inválido.'],
    [/^Invalid (url|URL)$/, () => 'Endereço inválido.'],
    [/^Invalid email( address)?$/i, () => 'E-mail inválido.'],
  ];
  for (const [pattern, render] of rules) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return message;
}

/** Erros de campo devolvidos pela API (details[].field → primeira mensagem), com o caminho completo do campo. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    if (!result[detail.field]) result[detail.field] = friendlyMessage(detail.message);
  }
  return result;
}

/** Primeira letra maiúscula (mensagens de campo do servidor às vezes vêm em minúsculas). */
export const capitalize = (text: string): string => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text);
