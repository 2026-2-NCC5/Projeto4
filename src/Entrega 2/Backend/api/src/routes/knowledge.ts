import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { KnowledgeArticleInput, KnowledgeArticleUpdate } from '../contracts/mobileApi.v1.js';
import { ok } from '../controllers/respond.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { KnowledgeService } from '../knowledge/service.js';

export interface KnowledgeRouteDeps {
  knowledge: KnowledgeService;
  audit: AuditService;
  authed: RequestHandler;
  onDenied: DeniedAccessRecorder;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

const article = {
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(1).max(400),
  body: z.string().trim().min(1).max(20_000),
  categoryId: z.string().trim().max(40).nullable().optional(),
  audience: z.enum(['student', 'staff']).optional(),
  sourceLabel: z.string().trim().max(200).nullable().optional(),
  sourceUrl: z.string().trim().max(500).nullable().optional(),
  changeNote: z.string().trim().max(300).nullable().optional(),
  reviewDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
};
export const articleCreateSchema = z.object({ ...article, slug: z.string().trim().max(80).optional() }).strict();
export const articleUpdateSchema = z.object({ ...article, expectedVersion: z.number().int().min(1) }).strict();

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const int = (value: unknown): number | undefined => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};

/** Base de conhecimento: leitura (versão publicada) e gestão editorial (rascunho → revisão → publicação). */
export function createKnowledgeRouter(deps: KnowledgeRouteDeps): Router {
  const router = Router();
  const { authed, knowledge, audit } = deps;
  const can = (permission: Parameters<typeof requirePermission>[0]) => requirePermission(permission, deps.onDenied);
  const actor = (req: Request) => ({ ...audit.actorFrom(req), userId: req.auth!.userId, role: req.auth!.role });
  const id = (req: Request) => String(req.params.id ?? '');

  router.get('/api/knowledge-base/manage', authed, can('kb:read:all'), wrap(async (req, res) => {
    ok(req, res, await knowledge.listManaged({
      ...(text(req.query.status) ? { status: text(req.query.status)! } : {}),
      ...(text(req.query.search) ? { search: text(req.query.search)! } : {}),
      ...(text(req.query.category) ? { category: text(req.query.category)! } : {}),
      ...(int(req.query.page) ? { page: int(req.query.page)! } : {}),
      ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}),
    }));
  }));
  router.post('/api/knowledge-base/manage', authed, can('kb:write'), validateBody(articleCreateSchema), wrap(async (req, res) => {
    ok(req, res, await knowledge.create(actor(req), req.body as KnowledgeArticleInput), 201);
  }));
  router.get('/api/knowledge-base/manage/:id', authed, can('kb:read:all'), wrap(async (req, res) => {
    ok(req, res, await knowledge.getManaged(id(req), { userId: req.auth!.userId, role: req.auth!.role }));
  }));
  router.put('/api/knowledge-base/manage/:id', authed, can('kb:write'), validateBody(articleUpdateSchema), wrap(async (req, res) => {
    ok(req, res, await knowledge.update(actor(req), id(req), req.body as KnowledgeArticleUpdate));
  }));
  router.post('/api/knowledge-base/manage/:id/submit', authed, can('kb:write'), wrap(async (req, res) => {
    ok(req, res, await knowledge.submit(actor(req), id(req)));
  }));
  router.post('/api/knowledge-base/manage/:id/publish', authed, can('kb:publish'), wrap(async (req, res) => {
    ok(req, res, await knowledge.publish(actor(req), id(req)));
  }));
  router.post('/api/knowledge-base/manage/:id/archive', authed, can('kb:publish'), wrap(async (req, res) => {
    ok(req, res, await knowledge.archive(actor(req), id(req)));
  }));
  router.post('/api/knowledge-base/manage/:id/restore', authed, can('kb:write'), wrap(async (req, res) => {
    ok(req, res, await knowledge.restore(actor(req), id(req)));
  }));

  router.get('/api/knowledge-base', authed, can('kb:read:published'), wrap(async (req, res) => {
    ok(req, res, await knowledge.listPublished(req.auth!.role, {
      ...(text(req.query.search) ? { search: text(req.query.search)! } : {}),
      ...(text(req.query.category) ? { category: text(req.query.category)! } : {}),
      ...(int(req.query.page) ? { page: int(req.query.page)! } : {}),
      ...(int(req.query.pageSize) ? { pageSize: int(req.query.pageSize)! } : {}),
    }));
  }));
  router.get('/api/knowledge-base/:slug', authed, can('kb:read:published'), wrap(async (req, res) => {
    ok(req, res, await knowledge.getPublished(req.auth!.role, String(req.params.slug ?? '')));
  }));

  return router;
}
