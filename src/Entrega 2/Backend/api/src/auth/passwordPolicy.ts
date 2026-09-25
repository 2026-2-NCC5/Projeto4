import type { PasswordPolicy } from '../contracts/mobileApi.v1.js';
import type { ErrorDetail } from '../errors/AppError.js';

/** Política de senha única do backend; exposta ao app por GET /api/auth/policy. */
export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
};

export type PasswordRequirement = 'min_length' | 'max_length' | 'uppercase' | 'lowercase' | 'digit' | 'symbol';

const MESSAGES: Record<PasswordRequirement, (policy: PasswordPolicy) => string> = {
  min_length: (policy) => `A senha deve ter pelo menos ${policy.minLength} caracteres.`,
  max_length: (policy) => `A senha deve ter no máximo ${policy.maxLength} caracteres.`,
  uppercase: () => 'A senha deve ter uma letra maiúscula.',
  lowercase: () => 'A senha deve ter uma letra minúscula.',
  digit: () => 'A senha deve ter um número.',
  symbol: () => 'A senha deve ter um caractere especial.',
};

export function unmetPasswordRequirements(password: string, policy: PasswordPolicy = PASSWORD_POLICY): PasswordRequirement[] {
  const unmet: PasswordRequirement[] = [];
  const length = [...password].length;
  if (length < policy.minLength) unmet.push('min_length');
  if (length > policy.maxLength) unmet.push('max_length');
  if (policy.requireUppercase && !/\p{Lu}/u.test(password)) unmet.push('uppercase');
  if (policy.requireLowercase && !/\p{Ll}/u.test(password)) unmet.push('lowercase');
  if (policy.requireDigit && !/\p{Nd}/u.test(password)) unmet.push('digit');
  if (policy.requireSymbol && !/[^\p{L}\p{Nd}\s]/u.test(password)) unmet.push('symbol');
  return unmet;
}

export function passwordErrorDetails(field: string, unmet: PasswordRequirement[], policy: PasswordPolicy = PASSWORD_POLICY): ErrorDetail[] {
  return unmet.map((requirement) => ({ field, message: MESSAGES[requirement](policy) }));
}
