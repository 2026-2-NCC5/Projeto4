import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/AppError.js';

/** Valida req.body com Zod e substitui pelo valor tipado/sanitizado. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(
        new ValidationError(
          'Dados inválidos.',
          result.error.issues.map((issue) => ({ field: issue.path.join('.') || 'body', message: issue.message })),
        ),
      );
    }
    req.body = result.data;
    next();
  };
}
