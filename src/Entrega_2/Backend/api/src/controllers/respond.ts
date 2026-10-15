import type { Request, Response } from 'express';
import type { ApiSuccess } from '../contracts/mobileApi.v1.js';

/** Envelope de sucesso com identificadores de rastreabilidade. */
export function ok<T>(req: Request, res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { data, meta: { requestId: req.ctx.requestId, correlationId: req.ctx.correlationId } };
  res.status(status).json(body);
}
