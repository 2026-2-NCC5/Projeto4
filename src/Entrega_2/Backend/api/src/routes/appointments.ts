import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AppointmentCreateRequest, AppointmentRescheduleRequest, AvailabilityRuleInput, AvailabilityRuleUpdate, StaffAppointmentUpdateRequest } from '../contracts/mobileApi.v1.js';
import { ok } from '../controllers/respond.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { AppointmentService } from '../appointments/service.js';

export interface AppointmentRouteDeps {
  appointments: AppointmentService;
  audit: AuditService;
  authed: RequestHandler;
  asStudent: RequestHandler;
  onDenied: DeniedAccessRecorder;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

const clientKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/, 'Identificador de requisição inválido.');
const mode = z.enum(['presencial', 'online']);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.');

export const appointmentCreateSchema = z
  .object({
    clientRequestId: clientKey,
    topicId: z.string().trim().min(1).max(40),
    startsAt: z.iso.datetime({ offset: true }),
    mode,
    notes: z.string().trim().max(500).nullable().optional(),
    ticketId: z.string().trim().min(1).max(80).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
  })
  .strict();
export const appointmentRescheduleSchema = z
  .object({ clientRequestId: clientKey, startsAt: z.iso.datetime({ offset: true }), mode: mode.optional(), location: z.string().max(120).nullable().optional() })
  .strict();
export const appointmentCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const staffAppointmentUpdateSchema = z
  .object({ status: z.enum(['confirmed', 'completed', 'no_show', 'cancelled']).optional(), reason: z.string().trim().max(500).optional(), staffNotes: z.string().trim().max(1000).nullable().optional() })
  .strict();
export const availabilityCreateSchema = z
  .object({
    attendantUserId: z.uuid().optional(),
    weekday: z.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    slotMinutes: z.number().int().min(10).max(120),
    mode,
    location: z.string().trim().max(120).nullable().optional(),
    validFrom: date.optional(),
    validUntil: date.nullable().optional(),
  })
  .strict();
export const availabilityUpdateSchema = z
  .object({
    startTime: time.optional(),
    endTime: time.optional(),
    slotMinutes: z.number().int().min(10).max(120).optional(),
    mode: mode.optional(),
    location: z.string().trim().max(120).nullable().optional(),
    validUntil: date.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const channelOf = (req: Request): 'app' | 'web' => (req.auth?.channel === 'web' ? 'web' : 'app');
const id = (req: Request) => String(req.params.id ?? '');

/** Agendamentos (aluno) e agenda/disponibilidade (equipe). Autorização pela matriz de permissões. */
export function createAppointmentRouter(deps: AppointmentRouteDeps): Router {
  const router = Router();
  const { authed, asStudent, appointments, audit } = deps;
  const can = (permission: Parameters<typeof requirePermission>[0]) => requirePermission(permission, deps.onDenied);
  const student = (req: Request) => ({ id: req.student!.id, userId: req.auth!.userId });

  router.get('/api/appointments/catalog', authed, wrap(async (req, res) => {
    ok(req, res, await appointments.catalog());
  }));
  router.get('/api/appointments/slots', authed, can('appointments:book:own'), wrap(async (req, res) => {
    const requested = text(req.query.mode);
    ok(req, res, await appointments.slots({
      ...(text(req.query.from) ? { from: text(req.query.from)! } : {}),
      ...(text(req.query.to) ? { to: text(req.query.to)! } : {}),
      ...(requested === 'presencial' || requested === 'online' ? { mode: requested } : {}),
    }));
  }));
  router.get('/api/appointments', authed, can('appointments:book:own'), asStudent, wrap(async (req, res) => {
    const scope = text(req.query.scope);
    ok(req, res, await appointments.list(req.student!.id, scope === 'past' || scope === 'all' ? scope : 'upcoming'));
  }));
  router.post('/api/appointments', authed, can('appointments:book:own'), asStudent, validateBody(appointmentCreateSchema), wrap(async (req, res) => {
    const result = await appointments.book(student(req), audit.actorFrom(req), req.body as AppointmentCreateRequest, channelOf(req));
    ok(req, res, result.appointment, result.created ? 201 : 200);
  }));
  router.get('/api/appointments/:id', authed, can('appointments:book:own'), asStudent, wrap(async (req, res) => {
    ok(req, res, await appointments.get(req.student!.id, id(req)));
  }));
  router.post('/api/appointments/:id/cancel', authed, can('appointments:book:own'), asStudent, validateBody(appointmentCancelSchema), wrap(async (req, res) => {
    ok(req, res, await appointments.cancel(student(req), audit.actorFrom(req), id(req), (req.body as { reason?: string }).reason));
  }));
  router.post('/api/appointments/:id/reschedule', authed, can('appointments:book:own'), asStudent, validateBody(appointmentRescheduleSchema), wrap(async (req, res) => {
    ok(req, res, await appointments.reschedule(student(req), audit.actorFrom(req), id(req), req.body as AppointmentRescheduleRequest, channelOf(req)));
  }));
  router.get('/api/appointments/:id/calendar.ics', authed, can('appointments:book:own'), asStudent, wrap(async (req, res) => {
    const file = await appointments.calendar(req.student!.id, id(req));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.status(200).send(file.content);
  }));

  router.get('/api/asa/appointments', authed, can('appointments:read:any'), wrap(async (req, res) => {
    ok(req, res, await appointments.staffList({
      ...(text(req.query.from) ? { from: text(req.query.from)! } : {}),
      ...(text(req.query.to) ? { to: text(req.query.to)! } : {}),
      ...(text(req.query.status) ? { status: text(req.query.status)! } : {}),
      mine: text(req.query.attendant) === 'mine',
    }, req.auth!.userId));
  }));
  router.get('/api/asa/appointments/:id', authed, can('appointments:read:any'), wrap(async (req, res) => {
    ok(req, res, await appointments.staffGet(id(req)));
  }));
  router.patch('/api/asa/appointments/:id', authed, can('appointments:manage'), validateBody(staffAppointmentUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await appointments.staffUpdate({ ...audit.actorFrom(req), userId: req.auth!.userId }, id(req), req.body as StaffAppointmentUpdateRequest));
  }));

  router.get('/api/asa/availability', authed, can(['availability:manage:own', 'availability:manage:any']), wrap(async (req, res) => {
    const mine = text(req.query.attendant) === 'mine';
    ok(req, res, await appointments.availability(mine ? { attendantUserId: req.auth!.userId } : text(req.query.attendantUserId) ? { attendantUserId: text(req.query.attendantUserId)! } : {}));
  }));
  router.post('/api/asa/availability', authed, can(['availability:manage:own', 'availability:manage:any']), validateBody(availabilityCreateSchema), wrap(async (req, res) => {
    ok(req, res, await appointments.createAvailability({ ...audit.actorFrom(req), userId: req.auth!.userId, role: req.auth!.role }, req.body as AvailabilityRuleInput), 201);
  }));
  router.patch('/api/asa/availability/:id', authed, can(['availability:manage:own', 'availability:manage:any']), validateBody(availabilityUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await appointments.updateAvailability({ ...audit.actorFrom(req), userId: req.auth!.userId, role: req.auth!.role }, id(req), req.body as AvailabilityRuleUpdate));
  }));

  return router;
}
