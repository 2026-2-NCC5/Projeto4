import { api, apiRequest, isApiError } from '@/services/api/client';
import { staffKeys } from '@/features/support/staff/api';
import type { AgentInsights, SupportTicketList, TicketMetrics } from '@/types/api';
import type { PeriodQuery } from './period';

/**
 * Indicadores da Operação ASA e da Administração (mesmas rotas para as duas áreas; o servidor confere
 * `metrics:read`, `reports:export` e `agent:insights:read`).
 */

export const TICKETS_CSV_PATH = '/api/asa/reports/tickets.csv';
/** limite do servidor por arquivo (EXPORT_MAX_ROWS); acima disso a API responde 422 export_too_large */
export const CSV_MAX_ROWS = 5000;

/** Filas de prazo da equipe: `near_deadline` traz só prazos próximos; `overdue`, só os excedidos. */
export type SlaQueueKind = 'near_deadline' | 'overdue';
export const SLA_QUEUE_PAGE_SIZE = 20;

const withPeriod = (period: PeriodQuery) => new URLSearchParams({ from: period.from, to: period.to }).toString();

/** Endereço do CSV (o mesmo que o botão baixa): sessão por cookie, então funciona como link comum. */
export const ticketsCsvHref = (period: PeriodQuery) => `${TICKETS_CSV_PATH}?${withPeriod(period)}`;
/** Mesmo nome que o servidor envia em Content-Disposition. */
export const ticketsCsvFilename = (period: PeriodQuery) => `chamados_${period.from}_a_${period.to}.csv`;

export const insightsApi = {
  metrics: (period: PeriodQuery) => api.get<TicketMetrics>('/api/asa/metrics', { query: { from: period.from, to: period.to } }),
  agentInsights: (period: PeriodQuery) => api.get<AgentInsights>('/api/asa/agent-insights', { query: { from: period.from, to: period.to } }),
  /** texto do CSV (o cliente renova a sessão e traduz erros como 422 export_too_large) */
  ticketsCsv: (period: PeriodQuery) => apiRequest<string>(TICKETS_CSV_PATH, { query: { from: period.from, to: period.to }, raw: true, timeoutMs: 30_000 }),
  slaQueue: (sla: SlaQueueKind, cursor?: string | null) =>
    api.get<SupportTicketList>('/api/support/staff/tickets', { query: { sla, sort: 'due', limit: SLA_QUEUE_PAGE_SIZE, ...(cursor ? { cursor } : {}) } }),
};

export const insightsKeys = {
  metrics: (period: PeriodQuery) => ['insights', 'metrics', period.from, period.to] as const,
  agent: (period: PeriodQuery) => ['insights', 'agent', period.from, period.to] as const,
  /** dentro de ['staff', 'tickets']: ações da equipe sobre chamados também atualizam estas filas */
  slaQueue: (sla: SlaQueueKind) => [...staffKeys.tickets, 'sla-queue', sla] as const,
};

/** 403 `feature_disabled`: recurso desligado pela administração neste ambiente. */
export const isFeatureDisabled = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden' && error.reason === 'feature_disabled';
/** 503 `database_required`: indicadores e base de conhecimento dependem do PostgreSQL. */
export const isDatabaseRequired = (error: unknown): boolean => isApiError(error) && error.status === 503 && error.reason === 'database_required';
export const isForbiddenError = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFoundError = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';

const BOM = '\uFEFF';

/**
 * Salva um texto como arquivo no computador de quem clicou. `Response.text()` remove o BOM do UTF-8 que o
 * servidor envia; ele volta aqui para o Excel abrir os acentos corretamente.
 */
export function saveCsvFile(content: string, filename: string): void {
  const blob = new Blob([content.startsWith(BOM) ? content : `${BOM}${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
