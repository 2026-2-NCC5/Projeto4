import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '../contracts/mobileApi.v1.js';
import { AppError, NotFoundError } from '../errors/AppError.js';

/** 404 para rotas desconhecidas, no mesmo formato de erro. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.path}`));
}

/**
 * Converte qualquer erro em resposta padronizada (TASK-004 §36, §39).
 * Stack traces e mensagens internas nunca chegam ao cliente.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const ctx = req.ctx ?? { requestId: 'req-unknown', correlationId: 'corr-unknown', startedAt: Date.now() };
  const log = req.log;

  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
    appError = new AppError(400, 'VALIDATION_ERROR', 'JSON inválido no corpo da requisição.');
  } else {
    appError = new AppError(500, 'INTERNAL_ERROR', 'Erro interno. Tente novamente mais tarde.', { cause: err });
  }

  if (appError.status >= 500) {
    log?.error({ code: appError.code, http_status: appError.status, error_type: err instanceof Error ? err.name : typeof err, error_message: err instanceof Error ? err.message : undefined }, 'request failed');
  } else if (appError.status === 401 || appError.status === 403 || appError.status === 429) {
    log?.warn({ code: appError.code, http_status: appError.status, reason: appError.reason }, 'request rejected');
  }

  const body: ApiError = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.reason ? { reason: appError.reason } : {}),
      ...(appError.details ? { details: appError.details } : {}),
      ...(appError.retryAfterSeconds !== undefined ? { retryAfterSeconds: appError.retryAfterSeconds } : {}),
      ...(appError.attemptsRemaining !== undefined ? { attemptsRemaining: appError.attemptsRemaining } : {}),
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
    },
  };
  if (appError.retryAfterSeconds !== undefined) res.setHeader('Retry-After', String(appError.retryAfterSeconds));
  res.status(appError.status).json(body);
}
