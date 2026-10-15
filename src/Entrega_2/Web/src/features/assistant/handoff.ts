import type { AssistantHandoff } from '@/types/api';

/**
 * Rascunho de chamado levado do Assistente ASA ao formulário "Abrir chamado" pelo estado da navegação
 * (`location.state.ticketDraft`). Nada é criado sem a confirmação do aluno: o formulário só começa preenchido.
 */
export interface TicketDraftPrefill {
  categoryId: string | null;
  subject: string;
  description: string;
  /** motivo da sugestão, mostrado ao aluno ("Pedido de atendimento humano") */
  reason: string | null;
}

export interface TicketDraftState {
  ticketDraft: TicketDraftPrefill;
}

/** Rascunho proposto pela API (`handoff`). */
export function ticketDraftFromHandoff(handoff: AssistantHandoff): TicketDraftState {
  return { ticketDraft: { categoryId: handoff.categoryId || null, subject: handoff.subject, description: handoff.description, reason: handoff.reason || null } };
}

/** Sem proposta da API (resposta sem confiança): a própria pergunta vira assunto e descrição, para o aluno revisar. */
export function ticketDraftFromQuestion(question: string): TicketDraftState {
  const text = question.trim();
  return { ticketDraft: { categoryId: null, subject: text.slice(0, 110), description: text, reason: 'Pergunta sem resposta confiável no Assistente ASA' } };
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Lê o rascunho do estado da navegação, conferindo cada campo (estado inválido ou ausente = sem rascunho). */
export function readTicketDraft(state: unknown): TicketDraftPrefill | null {
  if (!state || typeof state !== 'object' || !('ticketDraft' in state)) return null;
  const draft = (state as { ticketDraft: unknown }).ticketDraft;
  if (!draft || typeof draft !== 'object') return null;
  const record = draft as Record<string, unknown>;
  const subject = text(record.subject).trim();
  const description = text(record.description).trim();
  if (!subject && !description) return null;
  return { categoryId: text(record.categoryId) || null, subject, description, reason: text(record.reason).trim() || null };
}
