import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AutomationRuleInput } from '../contracts/mobileApi.v1.js';
import { ok } from '../controllers/respond.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AdminActor, AdminService } from '../admin/adminService.js';
import type { AuditService } from '../platform/auditService.js';

export interface AdminRouteDeps {
  admin: AdminService;
  audit: AuditService;
  authed: RequestHandler;
  onDenied: DeniedAccessRecorder;
  /** contagens operacionais (sem conteúdo de chamados) para a visão geral */
  operationalCounts: (viewerUserId: string) => Promise<{ tickets: { open: number; slaOverdue: number; slaNearDeadline: number; unassigned: number }; appointmentsToday: { total: number } | null }>;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const int = (value: unknown): number | undefined => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};
const staffRole = z.enum(['institutional_staff', 'technical_admin']);
const priority = z.enum(['normal', 'high', 'urgent']);
const trigger = z.enum(['ticket_created', 'sla_near_deadline', 'sla_overdue']);
const action = z.enum(['notify_staff', 'raise_priority']);

export const adminUserCreateSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120),
    email: z.email('E-mail inválido.').max(160),
    role: staffRole,
  })
  .strict();
export const adminUserUpdateSchema = z
  .object({ role: staffRole.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => value.role !== undefined || value.isActive !== undefined, { message: 'Nada para alterar.' });
export const slaPolicyUpdateSchema = z
  .object({ firstResponseHours: z.number().int().min(1).max(240), resolutionBusinessDays: z.number().int().min(1).max(30) })
  .strict();
const ruleConditions = z.object({ categoryIds: z.array(z.string().trim().min(1).max(40)).max(20).optional(), priorities: z.array(priority).max(3).optional() }).strict();
const ruleParams = z.object({ audience: z.enum(['team', 'assigned']).optional(), priority: z.enum(['high', 'urgent']).optional() }).strict();
export const automationCreateSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(300).nullable().optional(),
    trigger,
    conditions: ruleConditions.optional(),
    action,
    actionParams: ruleParams.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export const automationUpdateSchema = automationCreateSchema.partial().strict();
export const settingUpdateSchema = z.object({ value: z.unknown() }).strict();

/** Administração da plataforma (autorização pela matriz de permissões; tudo auditado). */
export function createAdminRouter(deps: AdminRouteDeps): Router {
  const router = Router();
  const { authed, admin, audit } = deps;
  const can = (permission: Parameters<typeof requirePermission>[0]) => requirePermission(permission, deps.onDenied);
  const actor = (req: Request): AdminActor => ({ ...audit.actorFrom(req), userId: req.auth!.userId, role: req.auth!.role, familyId: req.auth!.familyId ?? null });
  const id = (req: Request): string => String(req.params.id ?? '');

  router.get('/api/admin/overview', authed, can('health:read'), wrap(async (req, res) => {
    ok(req, res, await admin.overview({ dashboard: () => deps.operationalCounts(req.auth!.userId) }));
  }));

  // ---- contas
  router.get('/api/admin/users', authed, can('users:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.listUsers({
      ...(text(req.query.search) ? { search: text(req.query.search)! } : {}),
      ...(text(req.query.role) ? { role: text(req.query.role)! } : {}),
      ...(text(req.query.status) ? { status: text(req.query.status)! } : {}),
      ...(text(req.query.includeDemo) ? { includeDemo: text(req.query.includeDemo) !== 'false' } : {}),
      ...(int(req.query.page) ? { page: int(req.query.page)! } : {}),
      ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}),
    }));
  }));
  router.post('/api/admin/users', authed, can('users:manage'), validateBody(adminUserCreateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.inviteUser(actor(req), req.body as z.infer<typeof adminUserCreateSchema>, req.log), 201);
  }));
  router.get('/api/admin/users/:id', authed, can('users:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.getUser(id(req)));
  }));
  router.patch('/api/admin/users/:id', authed, can('users:manage'), validateBody(adminUserUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.updateUser(actor(req), id(req), req.body as z.infer<typeof adminUserUpdateSchema>));
  }));
  router.post('/api/admin/users/:id/revoke-sessions', authed, can('sessions:revoke:any'), wrap(async (req, res) => {
    ok(req, res, await admin.revokeSessions(actor(req), id(req)));
  }));
  router.post('/api/admin/users/:id/invite', authed, can('users:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.resendInvitation(actor(req), id(req), req.log));
  }));
  router.get('/api/admin/permissions', authed, can('permissions:read'), wrap(async (req, res) => {
    ok(req, res, admin.permissions());
  }));

  // ---- SLA e automações
  router.get('/api/admin/sla-policies', authed, can('sla:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.slaPolicies());
  }));
  router.put('/api/admin/sla-policies/:categoryId', authed, can('sla:manage'), validateBody(slaPolicyUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.updateSlaPolicy(actor(req), String(req.params.categoryId ?? ''), req.body as z.infer<typeof slaPolicyUpdateSchema>));
  }));
  router.get('/api/admin/automations', authed, can('automations:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.automations());
  }));
  router.post('/api/admin/automations', authed, can('automations:manage'), validateBody(automationCreateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.createAutomation(actor(req), req.body as AutomationRuleInput), 201);
  }));
  router.patch('/api/admin/automations/:id', authed, can('automations:manage'), validateBody(automationUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.updateAutomation(actor(req), id(req), req.body as Partial<AutomationRuleInput>));
  }));
  router.get('/api/admin/automations/:id/runs', authed, can('automations:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.automationRuns(id(req)));
  }));

  // ---- integrações, saúde, parâmetros e chamados (metadados)
  router.get('/api/admin/integrations', authed, can('integrations:read'), wrap(async (req, res) => {
    ok(req, res, await admin.integrations());
  }));
  router.get('/api/admin/health', authed, can('health:read'), wrap(async (req, res) => {
    ok(req, res, await admin.health());
  }));
  router.get('/api/admin/settings', authed, can('settings:manage'), wrap(async (req, res) => {
    ok(req, res, await admin.listSettings());
  }));
  router.put('/api/admin/settings/:key', authed, can('settings:manage'), validateBody(settingUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await admin.updateSetting(actor(req), String(req.params.key ?? ''), (req.body as { value: unknown }).value));
  }));
  router.get('/api/admin/tickets', authed, can('tickets:read:metadata'), wrap(async (req, res) => {
    ok(req, res, await admin.tickets({
      ...(text(req.query.status) ? { status: text(req.query.status)! } : {}),
      ...(text(req.query.category) ? { category: text(req.query.category)! } : {}),
      ...(int(req.query.page) ? { page: int(req.query.page)! } : {}),
      ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}),
    }));
  }));

  return router;
}
