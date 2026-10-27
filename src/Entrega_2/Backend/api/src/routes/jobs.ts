import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ok } from '../controllers/respond.js';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';

/** Uma tarefa periódica: devolve um resumo sem dados pessoais (vai para o log e para a resposta). */
export type JobRunner = () => Promise<Record<string, unknown>>;

export interface JobsRouteDeps {
  /** CRON_SECRET; null desativa as rotas (404) */
  secret: string | null;
  jobs: Record<string, JobRunner>;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compara em tempo constante (o hash iguala os tamanhos). */
function sameSecret(received: string, expected: string): boolean {
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * Tarefas que o processo residente fazia com setInterval, agora acionáveis de fora quando a API roda em funções
 * serverless: Vercel Cron (GET com Authorization: Bearer <CRON_SECRET>) ou qualquer agendador externo.
 * Cada tarefa é idempotente — rodar duas vezes seguidas não duplica efeitos.
 */
export function createJobsRouter(deps: JobsRouteDeps): Router {
  const router = Router();
  const run = (req: Request, res: Response, next: NextFunction) => {
    const name = String(req.params.job);
    const job = Object.hasOwn(deps.jobs, name) ? deps.jobs[name] : undefined;
    if (!deps.secret || !job) return next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.path}`));
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !sameSecret(token, deps.secret)) return next(new UnauthorizedError('Credencial da tarefa inválida.', 'invalid_job_secret'));
    const startedAt = Date.now();
    job()
      .then((result) => {
        const durationMs = Date.now() - startedAt;
        req.log.info({ status: 'job_completed', job: name, duration_ms: durationMs, ...result }, 'scheduled job completed');
        ok(req, res, { job: name, durationMs, ...result });
      })
      .catch(next);
  };
  router.get('/api/internal/jobs/:job', run);
  router.post('/api/internal/jobs/:job', run);
  return router;
}
