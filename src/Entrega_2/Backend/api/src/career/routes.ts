import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { ok } from '../controllers/respond.js';
import { NotFoundError } from '../errors/AppError.js';
import { validateBody } from '../middlewares/validate.js';
import { CareerMatchService } from './service.js';

export interface CareerRouteDeps { service: CareerMatchService; authed: RequestHandler; asStudent: RequestHandler; admin: RequestHandler }
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => { handler(req, res).catch(next); };
const uuid = z.uuid();
const skill = z.string().trim().min(1).max(80);
const profileSchema = z.object({
  course: z.string().trim().max(160).nullable().optional(),
  semester: z.number().int().min(1).max(20).nullable().optional(),
  careerObjective: z.string().trim().max(2000).optional(),
  firstInternship: z.boolean().optional(),
  skills: z.array(skill).max(60).optional(),
  interests: z.array(skill).max(30).optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().regex(/^[a-zA-Z]{2}$/).nullable().optional(),
  region: z.string().trim().max(160).nullable().optional(),
  preferredRadiusKm: z.number().int().min(0).max(500).nullable().optional(),
  modalities: z.array(z.enum(['onsite','hybrid','remote'])).max(3).optional(),
  availability: z.record(z.string(), z.unknown()).optional(),
  personalizationEnabled: z.boolean().optional(),
}).strict();
const alertSchema = z.object({ enabled: z.boolean(), minimumMatchScore: z.number().int().min(0).max(100), frequency: z.enum(['immediate','daily','weekly','off']), channels: z.array(z.literal('in_app')).max(1) }).strict();
const applicationSchema = z.object({ opportunityId: uuid, status: z.enum(['interested','saved','plan_to_apply','applied','interview','offer','closed','not_selected']) }).strict();
const feedbackSchema = z.object({ opportunityId: uuid, feedback: z.enum(['interested','not_interested','irrelevant']) }).strict();
const sourceCreateSchema = z.object({
  name: z.string().trim().min(2).max(120), connectorType: z.enum(['greenhouse','lever']), boardSlug: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  authorizationStatus: z.enum(['review_required','approved','rejected']), authorizationReference: z.string().trim().max(500).optional(), enabled: z.boolean().default(false),
  syncIntervalMinutes: z.number().int().min(60).max(10080).default(360),
}).strict().superRefine((value, ctx) => {
  if (value.authorizationStatus === 'approved' && !value.authorizationReference?.trim()) ctx.addIssue({ code: 'custom', path: ['authorizationReference'], message: 'Informe a referência de autorização antes de aprovar a fonte.' });
});
const sourceUpdateSchema = z.object({ name: z.string().trim().min(2).max(120), authorizationStatus: z.enum(['review_required','approved','rejected']).optional(), authorizationReference: z.string().trim().max(500).optional(), enabled: z.boolean().optional(), syncIntervalMinutes: z.number().int().min(60).max(10080).optional() }).strict().superRefine((value, ctx) => {
  if (value.authorizationStatus === 'approved' && !value.authorizationReference?.trim()) ctx.addIssue({ code: 'custom', path: ['authorizationReference'], message: 'Informe a referência de autorização antes de aprovar a fonte.' });
});

export function createCareerRouter(deps: CareerRouteDeps): Router {
  const router = Router();
  const studentId = (req: Request) => req.student!.id;
  const userId = (req: Request) => req.auth!.userId;
  const actorId = (req: Request) => req.auth!.userId;
  const academicCourse = (req: Request) => req.student!.program;

  router.get('/api/v1/career/profile', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.profile(studentId(req), academicCourse(req)))));
  router.patch('/api/v1/career/profile', deps.authed, deps.asStudent, validateBody(profileSchema), wrap(async (req, res) => ok(req, res, await deps.service.updateProfile(studentId(req), req.body as Record<string, unknown>, academicCourse(req)))));

  router.get('/api/v1/career/jobs', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const filters = {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      workMode: typeof req.query.workMode === 'string' ? req.query.workMode : undefined,
      city: typeof req.query.city === 'string' ? req.query.city : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      limit: Number(req.query.limit) || 20,
      offset: Number(req.query.offset) || 0,
    };
    ok(req, res, await deps.service.catalog(filters));
  }));
  router.get('/api/v1/career/jobs/:id', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const job = await deps.service.getJob(uuid.parse(req.params.id));
    if (!job) throw new NotFoundError('Oportunidade não encontrada.');
    ok(req, res, job);
  }));
  router.get('/api/v1/career/recommendations', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.recommendations(studentId(req), academicCourse(req)))));
  router.get('/api/v1/career/saved', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.saved(userId(req)))));
  router.post('/api/v1/career/saved', deps.authed, deps.asStudent, validateBody(z.object({ opportunityId: uuid }).strict()), wrap(async (req, res) => ok(req, res, await deps.service.save(userId(req), (req.body as { opportunityId: string }).opportunityId), 201)));
  router.delete('/api/v1/career/saved/:id', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.unsave(userId(req), uuid.parse(req.params.id)))));
  router.post('/api/v1/career/feedback', deps.authed, deps.asStudent, validateBody(feedbackSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof feedbackSchema>;
    const job = await deps.service.getJob(body.opportunityId);
    if (!job) throw new NotFoundError('Oportunidade não encontrada.');
    ok(req, res, await deps.service.feedback(userId(req), body.opportunityId, body.feedback), 201);
  }));
  router.get('/api/v1/career/applications', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.applications(userId(req)))));
  router.post('/api/v1/career/applications', deps.authed, deps.asStudent, validateBody(applicationSchema), wrap(async (req, res) => {
    const body = req.body as z.infer<typeof applicationSchema>;
    const job = await deps.service.getJob(body.opportunityId);
    if (!job) throw new NotFoundError('Oportunidade não encontrada.');
    ok(req, res, await deps.service.setApplication(userId(req), body.opportunityId, body.status), 201);
  }));
  router.get('/api/v1/career/alerts', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.alerts(userId(req)))));
  router.patch('/api/v1/career/alerts', deps.authed, deps.asStudent, validateBody(alertSchema), wrap(async (req, res) => ok(req, res, await deps.service.updateAlerts(userId(req), req.body as Record<string, unknown>))));
  router.get('/api/v1/career/notifications', deps.authed, deps.asStudent, wrap(async (req, res) => ok(req, res, await deps.service.notifications(userId(req)))));
  router.patch('/api/v1/career/notifications/:id/read', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const result = await deps.service.markNotificationRead(userId(req), uuid.parse(req.params.id));
    if (!result) throw new NotFoundError('Notificação não encontrada.');
    ok(req, res, result);
  }));

  router.get('/api/v1/admin/career/sources', deps.authed, deps.admin, wrap(async (req, res) => ok(req, res, await deps.service.sources())));
  router.post('/api/v1/admin/career/sources', deps.authed, deps.admin, validateBody(sourceCreateSchema), wrap(async (req, res) => ok(req, res, await deps.service.createSource(actorId(req), req.body as Record<string, unknown>), 201)));
  router.patch('/api/v1/admin/career/sources/:id', deps.authed, deps.admin, validateBody(sourceUpdateSchema), wrap(async (req, res) => {
    const result = await deps.service.updateSource(actorId(req), uuid.parse(req.params.id), { ...(req.body as Record<string, unknown>), name: (req.body as { name: string }).name });
    if (!result) throw new NotFoundError('Fonte não encontrada.');
    ok(req, res, result);
  }));
  router.get('/api/v1/admin/career/collection-runs', deps.authed, deps.admin, wrap(async (req, res) => ok(req, res, await deps.service.collectionRuns(Number(req.query.limit) || 50))));
  router.post('/api/v1/admin/career/collect', deps.authed, deps.admin, wrap(async (req, res) => ok(req, res, await deps.service.enqueueEnabledSources(), 202)));
  router.get('/api/v1/admin/career/report', deps.authed, deps.admin, wrap(async (req, res) => ok(req, res, await deps.service.report())));
  return router;
}
