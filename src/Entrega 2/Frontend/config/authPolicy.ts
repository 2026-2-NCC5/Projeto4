import type { AuthPolicy } from '../types/api';

/**
 * Política de autenticação usada enquanto `GET /api/auth/policy` não responde (ou falha).
 * O BACKEND É A FONTE DE VERDADE: estes valores espelham os padrões de src/Entrega 2/Backend/api e servem apenas
 * para a UI não ficar vazia offline. Toda validação local é só UX — a API revalida tudo.
 */
export const DEFAULT_AUTH_POLICY: AuthPolicy = Object.freeze({
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSymbol: true,
  },
  allowedEmailDomains: ['edu.fecap.br', 'fecap.br', 'demo.asa'],
  registrationNumber: { pattern: '^\\d{8}$', example: '24026962' },
  resetCode: { length: 6, ttlSeconds: 600, resendCooldownSeconds: 60, maxAttempts: 5 },
  session: { rememberMeDays: 30, shortSessionHours: 12 },
  biometric: { enabled: true, credentialTtlDays: 30 },
  legal: { termsUrl: null, privacyUrl: null },
  passwordRecoveryAvailable: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickNumber(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function pickUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

/** Aceita a política recebida campo a campo; valores ausentes ou inválidos caem no padrão. */
export function normalizeAuthPolicy(raw: unknown): AuthPolicy {
  const fallback = DEFAULT_AUTH_POLICY;
  if (!isRecord(raw)) return fallback;
  const password = isRecord(raw.password) ? raw.password : {};
  const registration = isRecord(raw.registrationNumber) ? raw.registrationNumber : {};
  const resetCode = isRecord(raw.resetCode) ? raw.resetCode : {};
  const session = isRecord(raw.session) ? raw.session : {};
  const biometric = isRecord(raw.biometric) ? raw.biometric : {};
  const legal = isRecord(raw.legal) ? raw.legal : {};
  const domains = Array.isArray(raw.allowedEmailDomains)
    ? raw.allowedEmailDomains
        .filter((domain): domain is string => typeof domain === 'string')
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
    : fallback.allowedEmailDomains;

  return {
    password: {
      minLength: pickNumber(password.minLength, fallback.password.minLength, 1),
      maxLength: pickNumber(password.maxLength, fallback.password.maxLength, 1),
      requireUppercase: pickBoolean(password.requireUppercase, fallback.password.requireUppercase),
      requireLowercase: pickBoolean(password.requireLowercase, fallback.password.requireLowercase),
      requireDigit: pickBoolean(password.requireDigit, fallback.password.requireDigit),
      requireSymbol: pickBoolean(password.requireSymbol, fallback.password.requireSymbol),
    },
    allowedEmailDomains: domains,
    registrationNumber: {
      pattern: pickString(registration.pattern, fallback.registrationNumber.pattern),
      example: pickString(registration.example, fallback.registrationNumber.example),
    },
    resetCode: {
      length: pickNumber(resetCode.length, fallback.resetCode.length, 1),
      ttlSeconds: pickNumber(resetCode.ttlSeconds, fallback.resetCode.ttlSeconds),
      resendCooldownSeconds: pickNumber(resetCode.resendCooldownSeconds, fallback.resetCode.resendCooldownSeconds),
      maxAttempts: pickNumber(resetCode.maxAttempts, fallback.resetCode.maxAttempts, 1),
    },
    session: {
      rememberMeDays: pickNumber(session.rememberMeDays, fallback.session.rememberMeDays),
      shortSessionHours: pickNumber(session.shortSessionHours, fallback.session.shortSessionHours),
    },
    biometric: {
      enabled: pickBoolean(biometric.enabled, fallback.biometric.enabled),
      credentialTtlDays: pickNumber(biometric.credentialTtlDays, fallback.biometric.credentialTtlDays),
    },
    legal: { termsUrl: pickUrl(legal.termsUrl), privacyUrl: pickUrl(legal.privacyUrl) },
    passwordRecoveryAvailable: pickBoolean(raw.passwordRecoveryAvailable, fallback.passwordRecoveryAvailable),
  };
}
