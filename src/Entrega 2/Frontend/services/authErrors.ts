import { formatCountdown } from '../utils/authValidation';

import { isApiClientError, type ApiClientError } from './apiClient';

/**
 * Normalização dos erros de autenticação em códigos estáveis + mensagens oficiais em pt-BR.
 * Nenhuma mensagem técnica (ECONNREFUSED, AxiosError, SQLSTATE, JWT, stack…) chega à tela.
 */

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_EXISTS'
  | 'EMAIL_DOMAIN_NOT_ALLOWED'
  | 'INVALID_REGISTRATION_NUMBER'
  | 'UNKNOWN_PROGRAM'
  | 'WEAK_PASSWORD'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'CODE_LOCKED'
  | 'RESET_TOKEN_INVALID'
  | 'RECOVERY_UNAVAILABLE'
  | 'BIOMETRIC_CANCELLED'
  | 'BIOMETRIC_FAILED'
  | 'BIOMETRIC_INVALIDATED'
  | 'BIOMETRIC_UNAVAILABLE'
  | 'BIOMETRIC_CREDENTIAL_INVALID'
  | 'VALIDATION'
  | 'UNKNOWN';

export interface NormalizedAuthError {
  code: AuthErrorCode;
  message: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  /** Mensagens por campo do formulário (chaves de RegisterRequest / ResetPasswordRequest). */
  fieldErrors?: Record<string, string>;
}

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: 'Não foi possível entrar. Verifique seu e-mail e sua senha.',
  accountDisabled: 'Sua conta está desativada. Procure a coordenação do seu curso.',
  network: 'Não foi possível conectar ao ASA Conecta. Verifique sua conexão e tente novamente.',
  timeout: 'O ASA Conecta demorou para responder. Tente novamente.',
  server: 'O ASA Conecta está instável no momento. Tente novamente em instantes.',
  sessionExpired: 'Sua sessão expirou. Entre novamente para continuar.',
  accountExists: 'Não foi possível criar a conta com esses dados. Se você já possui conta, entre ou recupere sua senha.',
  emailDomainNotAllowed: 'Use seu e-mail institucional para criar a conta.',
  invalidRegistrationNumber: 'Confira o seu RA e tente novamente.',
  unknownProgram: 'Selecione um curso da lista ou continue sem informar o curso.',
  weakPassword: 'A senha não atende a todos os requisitos de segurança.',
  codeInvalidGeneric: 'Código incorreto. Confira e tente novamente.',
  codeExpired: 'Este código expirou. Solicite um novo código.',
  codeLocked: 'Muitas tentativas com este código. Solicite um novo código.',
  resetTokenInvalid: 'Sua solicitação expirou. Comece a recuperação novamente.',
  recoveryUnavailable: 'A recuperação de senha está indisponível no momento. Procure a coordenação do seu curso.',
  biometricCancelled: 'Autenticação por biometria cancelada.',
  biometricFailed: 'Biometria não reconhecida. Tente novamente ou entre usando sua senha.',
  biometricInvalidated: 'A biometria do aparelho foi alterada. Entre com sua senha para ativá-la novamente.',
  biometricUnavailable: 'O acesso por biometria não está disponível neste aparelho. Entre usando sua senha.',
  biometricCredentialInvalid: 'Seu acesso por biometria expirou. Entre com sua senha para ativá-lo novamente.',
  validation: 'Verifique os dados informados e tente novamente.',
  rateLimitedGeneric: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
  unknown: 'Não foi possível concluir agora. Tente novamente.',
} as const;

/** "Muitas tentativas. Aguarde {mm:ss} e tente novamente." */
export function rateLimitMessage(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return AUTH_ERROR_MESSAGES.rateLimitedGeneric;
  return `Muitas tentativas. Aguarde ${formatCountdown(seconds)} e tente novamente.`;
}

/** "Código incorreto. Você tem {n} tentativa(s)." */
export function codeInvalidMessage(attemptsRemaining: number | undefined): string {
  if (attemptsRemaining === undefined || !Number.isFinite(attemptsRemaining) || attemptsRemaining < 0) return AUTH_ERROR_MESSAGES.codeInvalidGeneric;
  return `Código incorreto. Você tem ${attemptsRemaining} ${attemptsRemaining === 1 ? 'tentativa' : 'tentativas'}.`;
}

export type BiometricErrorCode = 'BIOMETRIC_CANCELLED' | 'BIOMETRIC_FAILED' | 'BIOMETRIC_INVALIDATED' | 'BIOMETRIC_UNAVAILABLE';

/** Erro da camada de biometria (prompt do sistema / armazenamento seguro). Nunca carrega a credencial. */
export class BiometricError extends Error {
  readonly code: BiometricErrorCode;

  constructor(code: BiometricErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BiometricError';
    this.code = code;
  }
}

export function isBiometricError(error: unknown): error is BiometricError {
  return error instanceof BiometricError || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'BiometricError');
}

const BIOMETRIC_MESSAGES: Record<BiometricErrorCode, string> = {
  BIOMETRIC_CANCELLED: AUTH_ERROR_MESSAGES.biometricCancelled,
  BIOMETRIC_FAILED: AUTH_ERROR_MESSAGES.biometricFailed,
  BIOMETRIC_INVALIDATED: AUTH_ERROR_MESSAGES.biometricInvalidated,
  BIOMETRIC_UNAVAILABLE: AUTH_ERROR_MESSAGES.biometricUnavailable,
};

/** Campos conhecidos dos formulários — details de outros campos não são exibidos. */
const KNOWN_FIELDS = new Set(['fullName', 'email', 'password', 'newPassword', 'registrationNumber', 'programCode', 'code', 'confirmPassword']);

/** Heurística defensiva: descarta textos que pareçam técnicos antes de exibi-los. */
const TECHNICAL_TEXT =
  /(econn|enotfound|etimedout|axios|sqlstate|\bsql\b|\bjwt\b|\btoken\b|\bstack\b|exception|\bundefined\b|\bnull\b|\bnan\b|\berror\b|\bat\s+\S+\s*\(|https?:\/\/|[{}[\]<>;=\\]|\bzod\b|\bschema\b|\bregex\b)/i;

export function isSafeUserMessage(message: unknown): message is string {
  return typeof message === 'string' && message.trim().length > 0 && message.length <= 160 && !TECHNICAL_TEXT.test(message);
}

const REASON_FIELD_MESSAGES: Record<string, { field: string; message: string }> = {
  email_domain_not_allowed: { field: 'email', message: AUTH_ERROR_MESSAGES.emailDomainNotAllowed },
  invalid_registration_number: { field: 'registrationNumber', message: AUTH_ERROR_MESSAGES.invalidRegistrationNumber },
  unknown_program: { field: 'programCode', message: AUTH_ERROR_MESSAGES.unknownProgram },
  weak_password: { field: 'password', message: AUTH_ERROR_MESSAGES.weakPassword },
};

function fieldErrorsFrom(error: ApiClientError, reason: string | undefined): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const detail of error.details ?? []) {
    if (!KNOWN_FIELDS.has(detail.field) || result[detail.field]) continue;
    result[detail.field] = isSafeUserMessage(detail.message) ? detail.message : AUTH_ERROR_MESSAGES.validation;
  }
  const byReason = reason ? REASON_FIELD_MESSAGES[reason] : undefined;
  if (byReason && !result[byReason.field]) {
    // weak_password também pode chegar em reset (campo newPassword)
    const alias = byReason.field === 'password' && result.newPassword ? 'newPassword' : byReason.field;
    if (!result[alias]) result[alias] = byReason.message;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function withOptional(base: NormalizedAuthError, error: ApiClientError): NormalizedAuthError {
  const normalized: NormalizedAuthError = { ...base };
  if (error.retryAfterSeconds !== undefined) normalized.retryAfterSeconds = error.retryAfterSeconds;
  if (error.attemptsRemaining !== undefined) normalized.attemptsRemaining = error.attemptsRemaining;
  return normalized;
}

function fromApiClientError(error: ApiClientError): NormalizedAuthError {
  const reason = error.reason;

  if (error.kind === 'rate_limited' || error.code === 'RATE_LIMITED' || reason === 'too_many_attempts' || reason === 'rate_limited') {
    return withOptional({ code: 'RATE_LIMITED', message: rateLimitMessage(error.retryAfterSeconds) }, error);
  }

  switch (reason) {
    case 'invalid_credentials':
      return { code: 'INVALID_CREDENTIALS', message: AUTH_ERROR_MESSAGES.invalidCredentials };
    case 'account_disabled':
      return { code: 'ACCOUNT_DISABLED', message: AUTH_ERROR_MESSAGES.accountDisabled };
    case 'missing_token':
    case 'token_invalid':
    case 'token_expired':
    case 'session_revoked':
    case 'session_expired':
      return { code: 'SESSION_EXPIRED', message: AUTH_ERROR_MESSAGES.sessionExpired };
    case 'account_exists':
      return { code: 'ACCOUNT_EXISTS', message: AUTH_ERROR_MESSAGES.accountExists };
    case 'email_domain_not_allowed':
      return { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: AUTH_ERROR_MESSAGES.emailDomainNotAllowed, fieldErrors: fieldErrorsFrom(error, reason) };
    case 'invalid_registration_number':
      return { code: 'INVALID_REGISTRATION_NUMBER', message: AUTH_ERROR_MESSAGES.invalidRegistrationNumber, fieldErrors: fieldErrorsFrom(error, reason) };
    case 'unknown_program':
      return { code: 'UNKNOWN_PROGRAM', message: AUTH_ERROR_MESSAGES.unknownProgram, fieldErrors: fieldErrorsFrom(error, reason) };
    case 'weak_password':
      return { code: 'WEAK_PASSWORD', message: AUTH_ERROR_MESSAGES.weakPassword, fieldErrors: fieldErrorsFrom(error, reason) };
    case 'code_invalid':
      return withOptional({ code: 'CODE_INVALID', message: codeInvalidMessage(error.attemptsRemaining) }, error);
    case 'code_expired':
      return { code: 'CODE_EXPIRED', message: AUTH_ERROR_MESSAGES.codeExpired };
    case 'code_locked':
      return { code: 'CODE_LOCKED', message: AUTH_ERROR_MESSAGES.codeLocked };
    case 'reset_token_invalid':
      return { code: 'RESET_TOKEN_INVALID', message: AUTH_ERROR_MESSAGES.resetTokenInvalid };
    case 'recovery_unavailable':
      return { code: 'RECOVERY_UNAVAILABLE', message: AUTH_ERROR_MESSAGES.recoveryUnavailable };
    case 'biometric_credential_invalid':
      return { code: 'BIOMETRIC_CREDENTIAL_INVALID', message: AUTH_ERROR_MESSAGES.biometricCredentialInvalid };
    default:
      break;
  }

  switch (error.kind) {
    case 'offline':
      return { code: 'OFFLINE', message: AUTH_ERROR_MESSAGES.network };
    case 'network':
      return { code: 'NETWORK_ERROR', message: AUTH_ERROR_MESSAGES.network };
    case 'timeout':
      return { code: 'TIMEOUT', message: AUTH_ERROR_MESSAGES.timeout };
    case 'server':
    case 'dependency':
    case 'contract':
      return { code: 'SERVER_ERROR', message: AUTH_ERROR_MESSAGES.server };
    case 'unauthorized':
      // Rotas públicas de autenticação só respondem 401 para credenciais inválidas.
      return { code: 'INVALID_CREDENTIALS', message: AUTH_ERROR_MESSAGES.invalidCredentials };
    case 'validation':
      return { code: 'VALIDATION', message: AUTH_ERROR_MESSAGES.validation, fieldErrors: fieldErrorsFrom(error, reason) };
    default:
      break;
  }

  if (error.code === 'CONFLICT' || error.status === 409) {
    return { code: 'ACCOUNT_EXISTS', message: AUTH_ERROR_MESSAGES.accountExists };
  }
  if (error.status !== undefined && error.status >= 500) {
    return { code: 'SERVER_ERROR', message: AUTH_ERROR_MESSAGES.server };
  }
  return { code: 'UNKNOWN', message: AUTH_ERROR_MESSAGES.unknown };
}

/** Converte qualquer erro (ApiClientError, BiometricError, desconhecido) em código + mensagem oficial. */
export function normalizeAuthError(error: unknown): NormalizedAuthError {
  if (isBiometricError(error)) {
    return { code: error.code, message: BIOMETRIC_MESSAGES[error.code] };
  }
  if (isApiClientError(error)) {
    const normalized = fromApiClientError(error);
    if (normalized.fieldErrors === undefined) delete normalized.fieldErrors;
    return normalized;
  }
  return { code: 'UNKNOWN', message: AUTH_ERROR_MESSAGES.unknown };
}
