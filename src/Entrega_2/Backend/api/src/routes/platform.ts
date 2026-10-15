import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  ACCESS_COOKIE,
  assertCsrf,
  clearSessionCookies,
  deviceLabelFrom,
  ensureCsrfToken,
  readCookie,
  REFRESH_COOKIE,
  setSessionCookies,
  type WebCookieConfig,
} from '../auth/webSession.js';
import type { AuthSession, NotificationPreferencesUpdate, RegisterRequest, WebSession, WebSessionState } from '../contracts/mobileApi.v1.js';
import { loginSchema, registerSchema } from '../controllers/authController.js';
import { ok } from '../controllers/respond.js';
import { AppError, UnauthorizedError } from '../errors/AppError.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { InboxService } from '../platform/inboxService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { AuthService } from '../services/authService.js';

export interface PlatformRouteDeps {
  authService: AuthService;
  platform: PlatformService;
  inbox: InboxService;
  audit: AuditService;
  authed: RequestHandler;
  /** limites por IP já usados nas rotas de autenticação do app */
  limit: (name: 'login' | 'register' | 'refresh' | 'session') => RequestHandler;
  web: WebCookieConfig & { origins: readonly string[] };
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

const CATEGORIES = ['support', 'appointment', 'agent', 'account', 'system', 'knowledge'] as const;

export const inboxReadSchema = z.object({ read: z.literal(true), ids: z.array(z.string().uuid()).min(1).max(100).optional() }).strict();
export const preferencesSchema = z
  .object({ items: z.array(z.object({ category: z.enum(CATEGORIES), pushEnabled: z.boolean() }).strict()).min(1).max(CATEGORIES.length) })
  .strict();

const queryInt = (value: unknown, fallback: number): number => {
  const parsed = Number(typeof value === 'string' ? value : NaN);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

/** Rotas da plataforma: informações públicas, perfil unificado, sessões, sessão web por cookie e central de avisos. */
export function createPlatformRouter(deps: PlatformRouteDeps): Router {
  const router = Router();
  const { authService, audit, authed } = deps;

  /** Verificação de origem + "double submit" nas rotas web sem sessão (login/cadastro/renovação). */
  const webCsrf: RequestHandler = (req, _res, next) => {
    try {
      assertCsrf(req, deps.web.origins);
      next();
    } catch (error) {
      next(error);
    }
  };

  const toWebSession = (res: Response, session: AuthSession): WebSession => {
    const csrfToken = setSessionCookies(res, session, deps.web);
    return {
      user: session.user,
      student: session.student,
      rememberMe: session.rememberMe,
      expiresIn: session.expiresIn,
      refreshExpiresIn: session.refreshExpiresIn,
      csrfToken,
    };
  };

  // ---------------------------------------------------------------- pública

  router.get('/api/platform/info', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    ok(req, res, await deps.platform.info());
  }));

  // ----------------------------------------------------- perfil e sessões

  router.get('/api/auth/me', authed, wrap(async (req, res) => {
    ok(req, res, await authService.me(req.auth!));
  }));

  router.get('/api/auth/sessions', authed, wrap(async (req, res) => {
    ok(req, res, await authService.listSessions(req.auth!));
  }));

  router.delete('/api/auth/sessions/:id', authed, wrap(async (req, res) => {
    const familyId = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(familyId)) throw new AppError(404, 'NOT_FOUND', 'Sessão não encontrada.');
    const result = await authService.revokeSession(req.auth!, familyId);
    await audit.recordFor(req, { action: 'auth.session_revoked', resourceType: 'session', resourceId: familyId, metadata: { current: result.revokedCurrent } });
    if (result.revokedCurrent && req.auth!.channel === 'web') clearSessionCookies(res, deps.web);
    res.status(204).end();
  }));

  router.post('/api/auth/sessions/revoke-others', authed, wrap(async (req, res) => {
    const revoked = await authService.revokeOtherSessions(req.auth!);
    await audit.recordFor(req, { action: 'auth.sessions_revoked', resourceType: 'user', resourceId: req.auth!.userId, metadata: { scope: 'others', families: revoked } });
    ok(req, res, { revoked });
  }));

  router.post('/api/auth/logout-all', authed, wrap(async (req, res) => {
    const revoked = await authService.logoutAll(req.auth!);
    await audit.recordFor(req, { action: 'auth.logout_all', resourceType: 'user', resourceId: req.auth!.userId, metadata: { families: revoked } });
    if (req.auth!.channel === 'web') clearSessionCookies(res, deps.web);
    res.status(204).end();
  }));

  // -------------------------------------------- sessão do portal (cookies)

  router.get('/api/web/auth/csrf', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    ok(req, res, { csrfToken: ensureCsrfToken(req, res, deps.web) });
  });

  /**
   * Abertura do portal: cookie de acesso válido → perfil; expirado → renova pelo cookie de renovação;
   * sem sessão → `authenticated: false` (200, sem ruído de 401 no navegador de quem não entrou).
   */
  router.post('/api/web/auth/session', deps.limit('session'), webCsrf, wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const access = readCookie(req, ACCESS_COOKIE);
    if (access) {
      try {
        const auth = await authService.verifyAccessToken(access);
        auth.channel = 'web';
        const body: WebSessionState = { authenticated: true, me: await authService.me(auth), csrfToken: ensureCsrfToken(req, res, deps.web) };
        ok(req, res, body);
        return;
      } catch {
        // acesso expirado/revogado: tenta a renovação abaixo
      }
    }
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
      try {
        const session = await authService.refresh(refreshToken, 'web');
        const csrfToken = setSessionCookies(res, session, deps.web);
        const auth = await authService.verifyAccessToken(session.accessToken);
        auth.channel = 'web';
        const body: WebSessionState = { authenticated: true, me: await authService.me(auth), csrfToken };
        ok(req, res, body);
        return;
      } catch {
        // renovação recusada (expirada, revogada, conta desativada): segue como visitante
      }
    }
    clearSessionCookies(res, deps.web);
    const body: WebSessionState = { authenticated: false, me: null, csrfToken: ensureCsrfToken(req, res, deps.web) };
    ok(req, res, body);
  }));

  router.post('/api/web/auth/login', deps.limit('login'), webCsrf, validateBody(loginSchema), wrap(async (req, res) => {
    const { email, password, rememberMe } = req.body as z.infer<typeof loginSchema>;
    let session: AuthSession;
    try {
      session = await authService.login(email, password, rememberMe ?? false, { channel: 'web', deviceLabel: deviceLabelFrom(req.headers['user-agent'], 'web') });
    } catch (error) {
      await audit.record(
        { ...audit.actorFrom(req), channel: 'web' },
        { action: 'auth.login_failed', outcome: 'failure', metadata: { reason: error instanceof AppError ? (error.reason ?? error.code) : 'error', account: audit.pseudonymize(email.trim().toLowerCase()) } },
      );
      throw error;
    }
    await audit.record(
      { ...audit.actorFrom(req), userId: session.user.id, role: session.user.role, channel: 'web' },
      { action: 'auth.login', resourceType: 'user', resourceId: session.user.id, metadata: { rememberMe: session.rememberMe } },
    );
    res.setHeader('Cache-Control', 'no-store');
    ok(req, res, toWebSession(res, session));
  }));

  router.post('/api/web/auth/register', deps.limit('register'), webCsrf, validateBody(registerSchema), wrap(async (req, res) => {
    const session = await authService.register(req.body as RegisterRequest, { channel: 'web', deviceLabel: deviceLabelFrom(req.headers['user-agent'], 'web') });
    await audit.record(
      { ...audit.actorFrom(req), userId: session.user.id, role: session.user.role, channel: 'web' },
      { action: 'auth.account_created', resourceType: 'user', resourceId: session.user.id },
    );
    res.setHeader('Cache-Control', 'no-store');
    ok(req, res, toWebSession(res, session), 201);
  }));

  router.post('/api/web/auth/refresh', deps.limit('refresh'), webCsrf, wrap(async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (!refreshToken) {
      clearSessionCookies(res, deps.web);
      throw new UnauthorizedError('Sessão expirada. Faça login novamente.', 'session_expired');
    }
    try {
      const session = await authService.refresh(refreshToken, 'web');
      res.setHeader('Cache-Control', 'no-store');
      ok(req, res, toWebSession(res, session));
    } catch (error) {
      clearSessionCookies(res, deps.web);
      throw error;
    }
  }));

  router.post('/api/web/auth/logout', webCsrf, wrap(async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
      const session = await authService.findSessionByRefreshToken(refreshToken);
      if (session && session.channel === 'web' && !session.revokedAt) {
        await authService.logout(null, refreshToken);
        await audit.record(
          { ...audit.actorFrom(req), userId: session.userId, role: await authService.roleOf(session.userId), channel: 'web' },
          { action: 'auth.logout', resourceType: 'session', resourceId: session.familyId ?? session.id },
        );
      }
    }
    clearSessionCookies(res, deps.web);
    res.status(204).end();
  }));

  // ------------------------------------------------------ central de avisos

  router.get('/api/notifications', authed, wrap(async (req, res) => {
    ok(req, res, await deps.inbox.list(req.auth!.userId, queryInt(req.query.limit, 30)));
  }));

  router.patch('/api/notifications', authed, validateBody(inboxReadSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof inboxReadSchema>;
    ok(req, res, await deps.inbox.markRead(req.auth!.userId, body.ids ?? null, queryInt(req.query.limit, 30)));
  }));

  router.get('/api/notifications/preferences', authed, wrap(async (req, res) => {
    ok(req, res, await deps.inbox.preferences(req.auth!.userId));
  }));

  router.patch('/api/notifications/preferences', authed, validateBody(preferencesSchema), wrap(async (req, res) => {
    ok(req, res, await deps.inbox.updatePreferences(req.auth!.userId, req.body as NotificationPreferencesUpdate));
  }));

  return router;
}
