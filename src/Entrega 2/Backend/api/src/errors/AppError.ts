/**
 * Erros de aplicação com código estável e status HTTP (TASK-004 §35-36, §39).
 * Nunca carregam stack trace para o cliente.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DEPENDENCY_ERROR'
  | 'CONTRACT_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;
  readonly reason: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly attemptsRemaining: number | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; reason?: string; cause?: unknown; retryAfterSeconds?: number; attemptsRemaining?: number } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.reason = options.reason;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.attemptsRemaining = options.attemptsRemaining;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos.', details?: ErrorDetail[], options: { reason?: string; attemptsRemaining?: number } = {}) {
    super(400, 'VALIDATION_ERROR', message, { details, ...options });
  }
}

/** Limite de requisições/tentativas excedido (429 + Retry-After). */
export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds: number, reason: 'rate_limited' | 'too_many_attempts' = 'rate_limited') {
    super(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde e tente novamente.', { reason, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado.', reason?: string) {
    super(401, 'UNAUTHORIZED', message, { reason });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso não autorizado a este recurso.', reason?: string) {
    super(403, 'FORBIDDEN', message, { reason });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de estado.', reason?: string) {
    super(409, 'CONFLICT', message, { reason });
  }
}

/** Agent Service indisponível ou respondeu com erro (TASK-004 §43-44). */
export class DependencyError extends AppError {
  constructor(message = 'Não foi possível concluir a análise. Tente novamente.', cause?: unknown, reason?: string) {
    super(503, 'DEPENDENCY_ERROR', message, { cause, reason });
  }
}

/** Agent Service não respondeu dentro do timeout configurado (TASK-004 §45). */
export class TimeoutError extends AppError {
  constructor(message = 'A análise está demorando mais que o esperado. Tente novamente.', cause?: unknown) {
    super(504, 'TIMEOUT', message, { cause });
  }
}

/** Resposta do Agent Service incompatível com o contrato 1.x (TASK-004 §46-47). */
export class ContractError extends AppError {
  constructor(message = 'A resposta do serviço de análise é incompatível com a versão suportada.', details?: ErrorDetail[]) {
    super(502, 'CONTRACT_ERROR', message, { details });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Erro interno. Tente novamente mais tarde.', cause?: unknown) {
    super(500, 'INTERNAL_ERROR', message, { cause });
  }
}
