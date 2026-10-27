import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import { ok } from '../controllers/respond.js';
import { NotFoundError } from '../errors/AppError.js';
import { validateBody } from '../middlewares/validate.js';
import { rateLimitByUser } from '../notifications/routes.js';
import { MOCK_SCENARIOS, type MockQueueProvider } from './providers/mockProvider.js';
import type { QueueRealtimeHub } from './realtime.js';
import type { QueueService } from './service.js';
import { isValidTicket } from './ticket.js';

const ticketSchema = z
  .string({ error: 'Digite uma senha válida.' })
  .trim()
  .min(1, 'Digite uma senha válida.')
  .max(12, 'Digite uma senha válida.')
  .refine(isValidTicket, 'Digite uma senha válida.');

/** Corpo estrito: userId/studentId nunca são aceitos (o usuário vem do token). */
export const subscribeSchema = z
  .object({
    ticket: ticketSchema,
    pushEnabled: z.boolean().optional(),
    voiceEnabled: z.boolean().optional(),
    vibrationEnabled: z.boolean().optional(),
  })
  .strict();

export const preferencesSchema = z
  .object({ pushEnabled: z.boolean().optional(), voiceEnabled: z.boolean().optional(), vibrationEnabled: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma preferência.');

export const mockControlSchema = z.object({ scenario: z.enum(MOCK_SCENARIOS).optional(), advance: z.boolean().optional() }).strict();

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

export interface QueueRouteDeps {
  service: QueueService;
  hub: QueueRealtimeHub;
  authenticate: RequestHandler;
  rateLimitEnabled: boolean;
  /** cadastros de senha por usuário a cada 10 minutos */
  subscriptionRateLimit: number;
  now: () => Date;
  /** presente só com ASA_QUEUE_PROVIDER=mock fora de produção */
  mock: MockQueueProvider | null;
}

export function createQueueRouter(deps: QueueRouteDeps): Router {
  const router = Router();
  const clock = () => deps.now().getTime();
  const authed = deps.authenticate;
  const subscribeLimit = rateLimitByUser('queue-subscribe', new FixedWindowLimiter({ windowMs: 10 * 60_000, max: deps.subscriptionRateLimit }, clock), deps.rateLimitEnabled);
  const writeLimit = rateLimitByUser('queue-write', new FixedWindowLimiter({ windowMs: 10 * 60_000, max: 60 }, clock), deps.rateLimitEnabled);
  const streamLimit = rateLimitByUser('queue-stream', new FixedWindowLimiter({ windowMs: 10 * 60_000, max: 120 }, clock), deps.rateLimitEnabled);
  // Sem processo residente (serverless), cada leitura atualiza o estado antes (depois da autenticação);
  // com o laço residente não faz nada.
  const fresh: RequestHandler = (_req, _res, next) => {
    deps.service.refresh().then(() => next(), next);
  };

  // Saúde do monitor (sem dados de estudantes).
  router.get('/health/queue', fresh, (req, res) => {
    const { body, httpStatus } = deps.service.health();
    ok(req, res, body, httpStatus);
  });

  router.get('/api/queue', authed, fresh, (req, res) => ok(req, res, deps.service.overview()));
  router.get('/api/queue/status', authed, fresh, wrap(async (req, res) => ok(req, res, await deps.service.status(req.auth!.userId))));
  router.get('/api/queue/stream', authed, streamLimit, fresh, wrap((req, res) => deps.hub.handle(req, res)));

  router.post('/api/queue/subscriptions', authed, subscribeLimit, validateBody(subscribeSchema), fresh, wrap(async (req, res) => {
    const body = req.body as z.infer<typeof subscribeSchema>;
    ok(req, res, await deps.service.subscribe(req.auth!.userId, body, req.log), 201);
  }));
  router.get('/api/queue/subscriptions/current', authed, fresh, wrap(async (req, res) => ok(req, res, await deps.service.current(req.auth!.userId))));
  router.patch('/api/queue/subscriptions/current', authed, writeLimit, validateBody(preferencesSchema), fresh, wrap(async (req, res) => {
    ok(req, res, await deps.service.updatePreferences(req.auth!.userId, req.body as z.infer<typeof preferencesSchema>));
  }));
  router.delete('/api/queue/subscriptions/current', authed, writeLimit, wrap(async (req, res) => {
    await deps.service.cancel(req.auth!.userId, req.log);
    res.status(204).end();
  }));

  // Simulação (desenvolvimento): troca o cenário ou chama a próxima senha. Inexistente em produção.
  router.post('/api/queue/dev/mock', authed, validateBody(mockControlSchema), (req, res, next) => {
    const mock = deps.mock;
    if (!mock) return next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.path}`));
    const body = req.body as z.infer<typeof mockControlSchema>;
    if (body.scenario) mock.setScenario(body.scenario);
    if (body.advance) mock.advance();
    ok(req, res, { scenario: mock.currentScenario });
  });

  return router;
}
