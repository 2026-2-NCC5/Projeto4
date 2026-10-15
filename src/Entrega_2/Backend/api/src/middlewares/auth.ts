import type { NextFunction, Request, Response } from 'express';
import { hasPermission } from '../auth/permissions.js';
import { ACCESS_COOKIE, assertCsrf, isSafeMethod, parseCookies } from '../auth/webSession.js';
import type { Permission } from '../contracts/mobileApi.v1.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import type { AuthService } from '../services/authService.js';
import type { StudentService } from '../services/studentService.js';
import type { AuthContext, StudentRecord } from '../types/domain.js';

/** Sessão do portal por cookie: origens aceitas na verificação de CSRF. Sem ela, só Bearer é aceito. */
export interface WebAuthOptions {
  allowedOrigins: readonly string[];
}

/** Registro de acessos negados (auditoria); opcional para não acoplar o middleware ao banco. */
export type DeniedAccessRecorder = (req: Request, permission: Permission) => void;

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    student?: StudentRecord;
  }
}

/**
 * Autentica pelo cabeçalho Bearer (app) ou, com `web`, pelo cookie HttpOnly do portal. Requisições por
 * cookie que alteram dados exigem CSRF (cabeçalho X-CSRF-Token + origem permitida). Bearer não exige CSRF:
 * o navegador nunca o envia sozinho.
 */
export function authenticate(authService: AuthService, web?: WebAuthOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      let token: string | undefined;
      let viaCookie = false;
      if (header && header.startsWith('Bearer ')) {
        token = header.slice('Bearer '.length).trim();
      } else if (web && !header) {
        token = parseCookies(req.headers.cookie)[ACCESS_COOKIE];
        viaCookie = Boolean(token);
      }
      if (!token) throw new UnauthorizedError('Token de acesso ausente.', 'missing_token');
      if (viaCookie && web && !isSafeMethod(req.method)) assertCsrf(req, web.allowedOrigins);
      req.auth = await authService.verifyAccessToken(token);
      if (viaCookie) req.auth.channel = 'web';
      req.log = req.log.child({ user_id: req.auth.userId });
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Autorização por permissão da matriz (auth/permissions.ts). Qualquer uma das permissões basta. */
export function requirePermission(permissions: Permission | Permission[], onDenied?: DeniedAccessRecorder) {
  const required = Array.isArray(permissions) ? permissions : [permissions];
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new UnauthorizedError());
    const role = req.auth.role;
    if (required.some((permission) => hasPermission(role, permission))) return next();
    onDenied?.(req, required[0]!);
    next(new ForbiddenError('Seu perfil não tem permissão para esta ação.', 'permission_denied'));
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
