import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool.js';
import { ok } from '../controllers/respond.js';
import { validateBody } from '../middlewares/validate.js';
import { InternshipService } from './service.js';

export interface InternshipRouteDeps { pool: DbPool; authed: RequestHandler; asStudent: RequestHandler; dataMode: string }
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => { handler(req, res).catch(next); };
const id = z.uuid();
const requestType = z.enum(['first_contract','mandatory','non_mandatory','extension','amendment','supervisor_change','hours_change','benefits_change','company_change','termination','closure','semester_report','regularization']);
const payload = z.record(z.string(), z.unknown());
const createSchema = z.object({ clientRequestId: z.string().min(8).max(128), requestType, data: payload }).strict();
const updateSchema = z.object({ data: payload }).strict();
const generateSchema = z.object({ omitFields: z.array(z.string().max(100)).max(20).optional() }).strict();
const appealSchema = z.object({ reason: z.string().trim().min(10).max(2000) }).strict();

export function createInternshipRouter(deps: InternshipRouteDeps): Router {
  const router = Router();
  const service = new InternshipService(deps.pool, deps.dataMode);
  const studentId = (req: Request) => req.student!.id;
  const actorId = (req: Request) => req.auth!.userId;

  router.get('/api/v1/internships', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await service.list(studentId(req)))));
  router.post('/api/v1/internships', deps.authed, deps.asStudent, validateBody(createSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    ok(req, res, await service.create(studentId(req), actorId(req), body.requestType, body.data, body.clientRequestId), 201);
  }));
  router.get('/api/v1/internships/:id', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await service.get(studentId(req), id.parse(req.params.id)))));
  router.patch('/api/v1/internships/:id', deps.authed, deps.asStudent, validateBody(updateSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    ok(req, res, await service.update(studentId(req), actorId(req), id.parse(req.params.id), body.data));
  }));
  router.post('/api/v1/internships/:id/validate', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await service.validate(studentId(req), id.parse(req.params.id)))));
  router.post('/api/v1/internships/:id/documents/generate', deps.authed, deps.asStudent, validateBody(generateSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof generateSchema>;
    ok(req, res, await service.generate(studentId(req), actorId(req), id.parse(req.params.id), body.omitFields ?? []), 201);
  }));
  router.get('/api/v1/internships/:id/documents', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await service.documents(studentId(req), id.parse(req.params.id)))));
  router.post('/api/v1/internships/:id/submit', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await service.submit(studentId(req), actorId(req), id.parse(req.params.id)))));
  router.post('/api/v1/internships/:id/appeals', deps.authed, deps.asStudent, validateBody(appealSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof appealSchema>;
    ok(req, res, await service.appeal(studentId(req), actorId(req), id.parse(req.params.id), body.reason), 201);
  }));
  router.get('/api/v1/internships/:id/timeline', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const caseId = id.parse(req.params.id);
    await service.get(studentId(req), caseId);
    const { rows } = await deps.pool.query('select event_type as "eventType",detail,created_at as "createdAt" from internship_events where internship_id=$1 order by created_at asc', [caseId]);
    ok(req, res, rows);
  }));
  return router;
}
