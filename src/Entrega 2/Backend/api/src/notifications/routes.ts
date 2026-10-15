import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import { RateLimitedError } from '../errors/AppError.js';
import { validateBody } from '../middlewares/validate.js';
import type { NotificationService } from './notificationService.js';
import { EXPO_PUSH_TOKEN_PATTERN } from './types.js';

const tokenSchema = z.string().trim().max(200).regex(EXPO_PUSH_TOKEN_PATTERN, 'Token de notificação inválido.');

export const registerPushTokenSchema = z.object({ token: tokenSchema, platform: z.enum(['ios', 'android', 'web']) }).strict();
export const unregisterPushTokenSchema = z.object({ token: tokenSchema }).strict();

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

/** Limite por usuário autenticado (o token de push nunca define identidade). */
export function rateLimitByUser(name: string, limiter: FixedWindowLimiter, enabled: boolean): RequestHandler {
  return (req, _res, next) => {
    if (!enabled) return next();
    const result = limiter.hit(`${name}:${req.auth?.userId ?? req.ip ?? 'unknown'}`);
    if (!result.allowed) {
      req.log?.warn({ status: 'rate_limited', limiter: name, retry_after_seconds: result.retryAfterSeconds }, 'rate limit exceeded');
      return next(new RateLimitedError(result.retryAfterSeconds));
    }
    next();
  };
}

export interface NotificationRouteDeps {
  service: NotificationService;
  authenticate: RequestHandler;
  rateLimitEnabled: boolean;
  now: () => Date;
}

/** POST/DELETE /api/notifications/push-token — o aparelho do usuário autenticado recebe push. */
export function createNotificationRouter(deps: NotificationRouteDeps): Router {
  const router = Router();
  const limiter = rateLimitByUser('push-token', new FixedWindowLimiter({ windowMs: 10 * 60_000, max: 20 }, () => deps.now().getTime()), deps.rateLimitEnabled);

  router.post('/api/notifications/push-token', deps.authenticate, limiter, validateBody(registerPushTokenSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof registerPushTokenSchema>;
    await deps.service.registerDevice(req.auth!.userId, body.token, body.platform);
    res.status(204).end();
  }));

  router.delete('/api/notifications/push-token', deps.authenticate, limiter, validateBody(unregisterPushTokenSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof unregisterPushTokenSchema>;
    await deps.service.unregisterDevice(req.auth!.userId, body.token);
    res.status(204).end();
  }));

  return router;
}
