import { isApiError } from '@/services/api/client';
import type { SupportTicketStatus } from '@/types/api';
import { ACTIVE_STATUSES, FINISHED_STATUSES } from '../labels';
import type { TicketFilter } from './keys';

/**
 * Chave de idempotência aceita pela API ([A-Za-z0-9._:-], 8–128 caracteres). Gerada uma vez por rascunho
 * (abertura) ou por mensagem: reenviar após falha de rede devolve o mesmo registro em vez de duplicar.
 */
export function newClientId(prefix: 'req' | 'msg'): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

/** Situações enviadas em `status` para cada filtro de "Meus chamados". */
export function statusesFor(filter: TicketFilter): readonly SupportTicketStatus[] | undefined {
  if (filter === 'active') return ACTIVE_STATUSES;
  if (filter === 'waiting') return ['waiting_student'];
  if (filter === 'finished') return FINISHED_STATUSES;
  return undefined;
}

export const statusParam = (filter: TicketFilter): string | undefined => statusesFor(filter)?.join(',');

/** Minúsculas e sem acentos ("Matrícula" encontra "matricula"), como a busca do servidor. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todos os termos da busca precisam aparecer em algum dos textos. */
export function matchesSearch(query: string, texts: Array<string | null | undefined>): boolean {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeText(texts.filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

/** Erros de campo devolvidos pela API (details[].field → mensagem). */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    const field = detail.field.split('.')[0] ?? detail.field;
    if (!result[field]) result[field] = detail.message;
  }
  return result;
}

/** Falha em que o servidor pode ter recebido o pedido (repetir com a mesma chave é seguro). */
export const isTransientError = (error: unknown): boolean => isApiError(error) && ['network', 'offline', 'timeout', 'server', 'dependency', 'contract'].includes(error.kind);

export const isForbidden = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFound = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';

/** Chamado cancelado não tem prazo a cumprir: o selo "Atendimento concluído" do SLA enganaria o aluno. */
export const slaApplies = (status: SupportTicketStatus): boolean => status !== 'cancelled';

export const businessDays = (days: number): string => `${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`;

export const channelLabel = (channel: 'app' | 'web'): string => (channel === 'web' ? 'Portal web' : 'Aplicativo');
