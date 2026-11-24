import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import type { NotificationBroadcastInput } from '../contracts/mobileApi.v1.js';
import { ok } from '../controllers/respond.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { InboxService } from '../platform/inboxService.js';
import { rateLimitByUser } from '../notifications/routes.js';

/** Limites do aviso: cabe numa notificação do celular sem ser cortado. */
export const broadcastSchema = z.object({
  title: z.string().trim().min(3).max(65),
  body: z.string().trim().min(3).max(240),
}).strict();

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

/**
 * Avisos e push:
 * - POST /api/notifications/broadcast — a equipe envia um aviso para todos os alunos (central + push);
 * - POST /api/notifications/push-test — qualquer conta testa o push nos próprios aparelhos.
 */
export function createBroadcastRouter(deps: { inbox: InboxService; audit: AuditService; authed: RequestHandler; onDenied: DeniedAccessRecorder; includeDemo: boolean; rateLimitEnabled: boolean; now: () => Date }): Router {
  const router = Router();
  const clock = () => deps.now().getTime();
  const broadcastLimit = rateLimitByUser('notifications-broadcast', new FixedWindowLimiter({ windowMs: 60 * 60_000, max: 10 }, clock), deps.rateLimitEnabled);
  const testLimit = rateLimitByUser('push-test', new FixedWindowLimiter({ windowMs: 10 * 60_000, max: 5 }, clock), deps.rateLimitEnabled);

  router.post('/api/notifications/broadcast', deps.authed, requirePermission('notifications:broadcast', deps.onDenied), broadcastLimit, validateBody(broadcastSchema), wrap(async (req, res) => {
    const body = req.body as NotificationBroadcastInput;
    const result = await deps.inbox.broadcast(body, deps.includeDemo);
    // a auditoria guarda quem enviou e o alcance, não o texto
    await deps.audit.recordFor(req, { action: 'notifications.broadcast_sent', resourceType: 'notification', metadata: { recipients: result.recipients, push_sent: result.pushSent, title_length: body.title.length } });
    ok(req, res, result, 201);
  }));

  router.post('/api/notifications/push-test', deps.authed, testLimit, wrap(async (req, res) => {
    ok(req, res, await deps.inbox.testPush(req.auth!.userId));
  }));

  return router;
}
