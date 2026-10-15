import type { SupportCatalog, SupportLimits, SupportTicket } from '../../../types/api';

/** Abertura em etapas: nunca dezenas de campos numa página só. */
export type CreateStep = 'category' | 'details' | 'attachments' | 'review';
export const CREATE_STEPS: readonly CreateStep[] = ['category', 'details', 'attachments', 'review'];
export const CREATE_STEP_LABELS: Record<CreateStep, string> = { category: 'Solicitação', details: 'Detalhes', attachments: 'Anexos', review: 'Revisão' };

export interface CreateTicketState {
  step: CreateStep;
  categoryId: string | null;
  subcategoryId: string | null;
  subject: string;
  description: string;
  touched: { subject: boolean; description: boolean };
  /** chave de idempotência: reenviar após falha de rede nunca cria dois chamados */
  clientRequestId: string;
  submitting: boolean;
  submitError: string | null;
  created: SupportTicket | null;
  /** o formulário veio de um rascunho salvo */
  restored: boolean;
}

/** O que fica salvo no aparelho entre aberturas da tela (anexos não: os envios pendentes expiram). */
export interface CreateTicketDraft {
  categoryId: string | null;
  subcategoryId: string | null;
  subject: string;
  description: string;
  step: CreateStep;
  savedAt: number;
}

export type CreateTicketAction =
  | { type: 'SELECT_CATEGORY'; categoryId: string }
  | { type: 'SELECT_SUBCATEGORY'; subcategoryId: string }
  | { type: 'SET_SUBJECT'; value: string }
  | { type: 'SET_DESCRIPTION'; value: string }
  | { type: 'TOUCH_ALL' }
  | { type: 'GO_TO'; step: CreateStep }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; ticket: SupportTicket }
  | { type: 'SUBMIT_FAILURE'; message: string }
  | { type: 'RESTORE'; draft: CreateTicketDraft }
  | { type: 'RESET'; clientRequestId: string };

export function initialCreateState(clientRequestId: string, categoryId: string | null = null): CreateTicketState {
  return {
    step: 'category',
    categoryId,
    subcategoryId: null,
    subject: '',
    description: '',
    touched: { subject: false, description: false },
    clientRequestId,
    submitting: false,
    submitError: null,
    created: null,
    restored: false,
  };
}

export function createTicketReducer(state: CreateTicketState, action: CreateTicketAction): CreateTicketState {
  // Depois de enviado, o formulário fica congelado (sem duplo envio nem edição do que já foi).
  if (state.created && action.type !== 'RESET') return state;
  switch (action.type) {
    case 'SELECT_CATEGORY':
      return action.categoryId === state.categoryId ? state : { ...state, categoryId: action.categoryId, subcategoryId: null, submitError: null };
    case 'SELECT_SUBCATEGORY':
      return { ...state, subcategoryId: action.subcategoryId, submitError: null };
    case 'SET_SUBJECT':
      return { ...state, subject: action.value, submitError: null };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.value, submitError: null };
    case 'TOUCH_ALL':
      return { ...state, touched: { subject: true, description: true } };
    case 'GO_TO':
      return state.submitting ? state : { ...state, step: action.step, submitError: null };
    case 'SUBMIT_START':
      return state.submitting ? state : { ...state, submitting: true, submitError: null };
    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, created: action.ticket };
    case 'SUBMIT_FAILURE':
      return { ...state, submitting: false, submitError: action.message };
    case 'RESTORE':
      // O estudante já começou a digitar: o que está na tela vale mais que o rascunho.
      if (state.subject.trim() || state.description.trim()) return state;
      return {
        ...state,
        categoryId: action.draft.categoryId,
        subcategoryId: action.draft.subcategoryId,
        subject: action.draft.subject,
        description: action.draft.description,
        // Volta no máximo até "Detalhes": anexos não são restaurados (envios pendentes expiram).
        step: action.draft.step === 'category' ? 'category' : 'details',
        restored: true,
      };
    case 'RESET':
      return initialCreateState(action.clientRequestId);
    default:
      return state;
  }
}

export interface DetailErrors {
  subject?: string;
  description?: string;
}

/** Erros amigáveis (nunca técnicos) dos campos de "Detalhes". */
export function validateDetails(state: Pick<CreateTicketState, 'subject' | 'description'>, limits: Pick<SupportLimits, 'subjectMinLength' | 'descriptionMinLength'>): DetailErrors {
  const errors: DetailErrors = {};
  const subject = state.subject.trim();
  const description = state.description.trim();
  if (!subject) errors.subject = 'Descreva o assunto em poucas palavras.';
  else if (subject.length < limits.subjectMinLength) errors.subject = `Use pelo menos ${limits.subjectMinLength} caracteres no assunto.`;
  if (!description) errors.description = 'Conte um pouco mais sobre sua solicitação.';
  else if (description.length < limits.descriptionMinLength) errors.description = 'Conte um pouco mais sobre sua solicitação.';
  return errors;
}

/** A etapa atual permite avançar? */
export function canAdvance(state: CreateTicketState, catalog: SupportCatalog | null): boolean {
  if (!catalog) return false;
  switch (state.step) {
    case 'category': {
      const category = catalog.categories.find((item) => item.id === state.categoryId);
      if (!category) return false;
      return category.subcategories.length === 0 || Boolean(state.subcategoryId);
    }
    case 'details':
      return Object.keys(validateDetails(state, catalog.limits)).length === 0;
    default:
      return !state.submitting;
  }
}

export function toDraft(state: CreateTicketState, savedAt: number): CreateTicketDraft {
  return { categoryId: state.categoryId, subcategoryId: state.subcategoryId, subject: state.subject, description: state.description, step: state.step, savedAt };
}

/** Rascunho só vale a pena quando há algo além da categoria. */
export function draftHasContent(draft: Pick<CreateTicketDraft, 'subject' | 'description'>): boolean {
  return draft.subject.trim().length > 0 || draft.description.trim().length > 0;
}
