import type { PasswordPolicy } from '../types/api';

/**
 * Validações locais das telas de autenticação. São apenas UX (feedback imediato): a API revalida
 * tudo e continua sendo a fonte de verdade. Funções puras — sem React, sem rede.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FALLBACK_REGISTRATION_PATTERN = '^\\d{8}$';

export const AUTH_VALIDATION_MESSAGES = {
  emailRequired: 'Informe seu e-mail.',
  emailInvalid: 'Informe um e-mail válido.',
  passwordRequired: 'Informe sua senha.',
  fullNameRequired: 'Informe seu nome completo.',
  fullNameInvalid: 'Informe seu nome e sobrenome.',
  registrationRequired: 'Informe seu RA.',
  confirmationRequired: 'Confirme sua senha.',
  confirmationMismatch: 'As senhas não coincidem.',
  passwordTooLong: (max: number) => `A senha deve ter no máximo ${max} caracteres.`,
  registrationInvalid: (example?: string) => (example ? `Informe um RA válido (ex.: ${example}).` : 'Informe um RA válido.'),
  emailDomainNotAllowed: (domains: readonly string[]) =>
    domains.length === 1 ? `Use seu e-mail institucional (@${domains[0]}).` : `Use um e-mail institucional (${domains.map((domain) => `@${domain}`).join(', ')}).`,
} as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mensagem de erro do e-mail ou null quando válido. */
export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return AUTH_VALIDATION_MESSAGES.emailRequired;
  if (!EMAIL_PATTERN.test(value)) return AUTH_VALIDATION_MESSAGES.emailInvalid;
  return null;
}

/** true quando o domínio do e-mail está na lista (lista vazia = qualquer domínio). */
export function isAllowedEmailDomain(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const at = email.trim().lastIndexOf('@');
  if (at < 0) return false;
  const domain = email
    .trim()
    .slice(at + 1)
    .toLowerCase();
  return domains.some((allowed) => allowed.trim().toLowerCase().replace(/^@/, '') === domain);
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    return new RegExp(FALLBACK_REGISTRATION_PATTERN);
  }
}

/** Valida o RA (matrícula) contra o padrão da política. */
export function validateRegistrationNumber(value: string, pattern: string, example?: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return AUTH_VALIDATION_MESSAGES.registrationRequired;
  return compilePattern(pattern).test(trimmed) ? null : AUTH_VALIDATION_MESSAGES.registrationInvalid(example);
}

const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;

/** Nome completo: ao menos duas palavras e cinco letras no total. */
export function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return AUTH_VALIDATION_MESSAGES.fullNameRequired;
  const words = trimmed.split(/\s+/).filter((word) => (word.match(LETTER) ?? []).length > 0);
  const letters = (trimmed.match(LETTER) ?? []).length;
  return words.length >= 2 && letters >= 5 ? null : AUTH_VALIDATION_MESSAGES.fullNameInvalid;
}

export type PasswordRequirementKey = 'minLength' | 'uppercase' | 'lowercase' | 'digit' | 'symbol';

export interface PasswordRequirement {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
}

export interface PasswordEvaluation {
  requirements: PasswordRequirement[];
  /** true quando excede `maxLength`. */
  tooLong: boolean;
  valid: boolean;
}

/**
 * Classes de caractere alinhadas ao backend (src/Entrega 2/Backend/api/src/auth/passwordPolicy.ts, que usa
 * \p{Lu}, \p{Ll}, \p{Nd}). Se o motor JS não suportar escapes Unicode, cai em faixas latinas.
 */
function unicodeClass(source: string, fallback: RegExp): RegExp {
  try {
    return new RegExp(source, 'u');
  } catch {
    return fallback;
  }
}

const UPPERCASE = unicodeClass('\\p{Lu}', /[A-ZÀ-ÖØ-Þ]/);
const LOWERCASE = unicodeClass('\\p{Ll}', /[a-zß-öø-ÿ]/);
const DIGIT = unicodeClass('\\p{Nd}', /[0-9]/);
const SYMBOL = unicodeClass('[^\\p{L}\\p{Nd}\\s]', /[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/);

function characterCount(value: string): number {
  return Array.from(value).length;
}

/** Requisitos dinâmicos (somente os exigidos pela política), na ordem exibida ao aluno. */
export function evaluatePassword(password: string, policy: PasswordPolicy): PasswordEvaluation {
  const length = characterCount(password);
  const requirements: PasswordRequirement[] = [
    { key: 'minLength', label: `Pelo menos ${policy.minLength} caracteres`, met: length >= policy.minLength },
  ];
  if (policy.requireUppercase) requirements.push({ key: 'uppercase', label: 'Uma letra maiúscula', met: UPPERCASE.test(password) });
  if (policy.requireLowercase) requirements.push({ key: 'lowercase', label: 'Uma letra minúscula', met: LOWERCASE.test(password) });
  if (policy.requireDigit) requirements.push({ key: 'digit', label: 'Um número', met: DIGIT.test(password) });
  if (policy.requireSymbol) requirements.push({ key: 'symbol', label: 'Um caractere especial', met: SYMBOL.test(password) });
  const tooLong = length > policy.maxLength;
  return { requirements, tooLong, valid: !tooLong && requirements.every((requirement) => requirement.met) };
}

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  weak: 'Fraca',
  medium: 'Média',
  strong: 'Forte',
};

/**
 * Força percebida — apenas UX. Não atende à política → fraca; atende → média; atende com folga
 * (12+ caracteres e ao menos 4 tipos de caractere) → forte.
 */
export function passwordStrength(password: string, policy: PasswordPolicy): PasswordStrength {
  const evaluation = evaluatePassword(password, policy);
  if (!evaluation.valid) return 'weak';
  const classes = [UPPERCASE, LOWERCASE, DIGIT, SYMBOL].filter((pattern) => pattern.test(password)).length;
  const length = characterCount(password);
  return length >= Math.max(12, policy.minLength + 4) && classes >= 4 ? 'strong' : 'medium';
}

/** Mensagem de erro da confirmação de senha ou null quando confere. */
export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return AUTH_VALIDATION_MESSAGES.confirmationRequired;
  return password === confirmation ? null : AUTH_VALIDATION_MESSAGES.confirmationMismatch;
}

/** "estudante.exemplo@demo.asa" → "es***@demo.asa". Nunca revela o e-mail completo na tela. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed ? `${trimmed.slice(0, 1)}***` : '';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** Formata segundos como mm:ss (ex.: 42 → "00:42", 125 → "02:05"). */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Primeiro nome para saudações ("Maria Silva Souza" → "Maria"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
