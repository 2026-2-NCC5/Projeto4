import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../config/logger.js';
import type { RequestContext } from '../types/domain.js';

declare module 'express-serve-static-core' {
  interface Request {
    ctx: RequestContext;
    log: Logger;
  }
}

const ID_PATTERN = /^[A-Za-z0-9._-]{4,128}$/;

function readHeaderId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && ID_PATTERN.test(raw) ? raw : null;
}

/**
 * Gera request_id por requisição e preserva/gera correlation_id (TASK-004 §27-31).
 * Ambos voltam nos headers e são logados com duração — nunca com dados sensíveis.
 */
export function requestContext(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = `req-${randomUUID()}`;
    const correlationId = readHeaderId(req.headers['x-correlation-id']) ?? `corr-${randomUUID()}`;
    req.ctx = { requestId, correlationId, startedAt: Date.now() };
    req.log = logger.child({ request_id: requestId, correlation_id: correlationId });
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);
    res.on('finish', () => {
      req.log.info(
        { method: req.method, path: req.path, http_status: res.statusCode, status: res.statusCode < 400 ? 'success' : 'error', duration_ms: Date.now() - req.ctx.startedAt },
        'request completed',
      );
    });
    next();
  };
}
