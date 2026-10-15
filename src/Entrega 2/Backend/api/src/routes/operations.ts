import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ok } from '../controllers/respond.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import type { AuditService } from '../platform/auditService.js';
import type { OperationsService } from '../operations/operationsService.js';

export interface OperationsRouteDeps {
  operations: OperationsService;
  /** indicadores do agente: versões do Agent Service e provedor de IA */
  agentInsights: (input: { from?: string; to?: string }) => ReturnType<OperationsService['agentInsights']>;
  audit: AuditService;
  authed: RequestHandler;
  onDenied: DeniedAccessRecorder;
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
const period = (req: Request) => ({ ...(text(req.query.from) ? { from: text(req.query.from)! } : {}), ...(text(req.query.to) ? { to: text(req.query.to)! } : {}) });

/** Operação do ASA e trilha de auditoria (autorização pela matriz de permissões). */
export function createOperationsRouter(deps: OperationsRouteDeps): Router {
  const router = Router();
  const { authed, operations } = deps;
  const can = (permission: Parameters<typeof requirePermission>[0]) => requirePermission(permission, deps.onDenied);

  router.get('/api/asa/dashboard', authed, can('tickets:read:any'), wrap(async (req, res) => {
    ok(req, res, await operations.dashboard(req.auth!.userId));
  }));

  router.get('/api/asa/metrics', authed, can('metrics:read'), wrap(async (req, res) => {
    ok(req, res, await operations.metrics(period(req)));
  }));

  router.get('/api/asa/reports/tickets.csv', authed, can('reports:export'), wrap(async (req, res) => {
    const report = await operations.exportTicketsCsv(period(req));
    operations.assertExportable(report.rows);
    await deps.audit.recordFor(req, { action: 'report.exported', resourceType: 'report', resourceId: 'tickets.csv', metadata: { rows: report.rows, ...period(req) } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.status(200).send(report.content);
  }));

  router.get('/api/asa/students', authed, can('students:read:support_context'), wrap(async (req, res) => {
    ok(req, res, await operations.students({ ...(text(req.query.search) ? { search: text(req.query.search)! } : {}), ...(int(req.query.page) ? { page: int(req.query.page)! } : {}), ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}) }));
  }));

  router.get('/api/asa/students/:id', authed, can('students:read:support_context'), wrap(async (req, res) => {
    ok(req, res, await operations.student(String(req.params.id ?? ''), deps.audit.actorFrom(req)));
  }));

  router.get('/api/asa/agent-insights', authed, can('agent:insights:read'), wrap(async (req, res) => {
    ok(req, res, await deps.agentInsights(period(req)));
  }));

  const auditFilters = (req: Request) => ({
    ...(text(req.query.action) ? { action: text(req.query.action)! } : {}),
    ...(text(req.query.outcome) ? { outcome: text(req.query.outcome)! } : {}),
    ...(text(req.query.resourceType) ? { resourceType: text(req.query.resourceType)! } : {}),
    ...(text(req.query.resourceId) ? { resourceId: text(req.query.resourceId)! } : {}),
    ...period(req),
    ...(int(req.query.page) ? { page: int(req.query.page)! } : {}),
    ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}),
  });

  router.get('/api/audit/mine', authed, can('audit:read:own'), wrap(async (req, res) => {
    ok(req, res, await operations.auditEvents({ ...auditFilters(req), actorUserId: req.auth!.userId }));
  }));

  router.get('/api/admin/audit-events', authed, can('audit:read:any'), wrap(async (req, res) => {
    ok(req, res, await operations.auditEvents({ ...auditFilters(req), ...(text(req.query.actorUserId) ? { actorUserId: text(req.query.actorUserId)! } : {}) }));
  }));

  return router;
}
