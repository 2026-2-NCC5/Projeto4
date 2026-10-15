import { isApiError, messageForError } from '@/services/api/client';
import type { AdminUser } from '@/types/api';
import { capitalize, fieldErrors, reasonOf } from './api';
import type { AssignableRole } from './labels';

/**
 * Mensagens claras para as recusas da gestão de contas (motivos estáveis do servidor). Quando o servidor
 * explica o caso específico (ex.: `invalid_transition`), a explicação dele é usada.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  switch (reasonOf(error)) {
    case 'self_change':
      return 'Você não pode alterar o próprio papel nem desativar a própria conta. Peça a outra pessoa da administração.';
    case 'last_admin':
      return 'É preciso manter pelo menos uma conta de administração ativa. Dê o papel de Administração a outra pessoa antes de fazer esta mudança.';
    case 'invalid_transition':
      return isApiError(error) && error.message ? error.message : 'Esta mudança não é permitida para esta conta.';
    case 'account_exists':
      return 'Já existe uma conta com este e-mail.';
    case 'already_active':
      return 'Esta pessoa já entrou na plataforma, então o convite não é reenviado. Se ela esqueceu a senha, pode usar "Esqueci minha senha" na tela de entrada.';
    default:
      return messageForError(error, fallback);
  }
}

export interface InviteForm {
  fullName: string;
  email: string;
  role: AssignableRole | '';
}

export type InviteErrors = Partial<Record<keyof InviteForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mesmas regras do servidor (adminUserCreateSchema); o domínio institucional é conferido só no servidor. */
export function validateInvite(form: InviteForm): InviteErrors {
  const errors: InviteErrors = {};
  const name = form.fullName.trim();
  if (name.length < 3) errors.fullName = 'Informe o nome completo (mínimo de 3 caracteres).';
  else if (name.length > 120) errors.fullName = 'Use até 120 caracteres.';
  const email = form.email.trim();
  if (!EMAIL.test(email)) errors.email = 'Informe um e-mail válido.';
  else if (email.length > 160) errors.email = 'Use até 160 caracteres.';
  if (!form.role) errors.role = 'Escolha o papel da pessoa.';
  return errors;
}

/** Erros de campo do convite vindos da API (409 account_exists e 400 com detalhes, ex.: domínio do e-mail). */
export function inviteErrorsFrom(error: unknown): { fields: InviteErrors; message: string } {
  if (reasonOf(error) === 'account_exists') return { fields: { email: 'Já existe uma conta com este e-mail.' }, message: 'Já existe uma conta com este e-mail.' };
  const details = fieldErrors(error);
  const fields: InviteErrors = {};
  for (const key of ['fullName', 'email', 'role'] as const) {
    if (details[key]) fields[key] = capitalize(details[key]);
  }
  const serverMessage = isApiError(error) ? error.message : '';
  // "Dados inválidos." é genérico: com campos apontados, a mensagem útil está em cada campo
  const message = Object.keys(fields).length > 0 && (!serverMessage || serverMessage === 'Dados inválidos.') ? 'Confira os campos destacados.' : userErrorMessage(error, 'Não foi possível convidar agora. Tente novamente.');
  return { fields, message };
}

/** Convite ainda não usado: conta da equipe/administração ativa que nunca entrou. */
export const canResendInvitation = (user: AdminUser): boolean => user.role !== 'student' && user.isActive && !user.lastLoginAt;
