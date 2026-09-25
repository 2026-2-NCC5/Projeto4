import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import type { AuthService } from '../services/authService.js';
import type { StudentService } from '../services/studentService.js';
import type { AuthContext, StudentRecord } from '../types/domain.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    student?: StudentRecord;
  }
}

export function authenticate(authService: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw new UnauthorizedError('Token de acesso ausente.', 'missing_token');
      }
      const token = header.slice('Bearer '.length).trim();
      req.auth = await authService.verifyAccessToken(token);
      req.log = req.log.child({ user_id: req.auth.userId });
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Carrega o estudante da sessão; nunca aceita student_id do cliente (TASK-004 §33). */
export function requireStudent(studentService: StudentService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw new UnauthorizedError();
      req.student = await studentService.resolveStudent(req.auth);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: AuthContext['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new UnauthorizedError());
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError());
    next();
  };
}
