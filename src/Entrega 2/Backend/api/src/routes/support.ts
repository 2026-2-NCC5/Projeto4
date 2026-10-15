import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
  createSupportController,
  createSupportFileController,
  createSupportStaffController,
  staffAssignSchema,
  staffMessageSchema,
  staffNoteSchema,
  staffPrioritySchema,
  staffResolveSchema,
  staffStatusSchema,
  supportCancelSchema,
  supportCreateSchema,
  supportMessageSchema,
  supportNotificationsReadSchema,
  supportRatingSchema,
  supportReopenSchema,
  supportUploadSchema,
} from '../controllers/supportController.js';
import { requirePermission } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { Repositories } from '../repositories/types.js';
import type { SupportCore, SupportService } from '../support/supportService.js';
import type { SupportStaffService } from '../support/supportStaffService.js';

export interface SupportRouteDeps {
  repos: Repositories;
  core: SupportCore;
  student: SupportService;
  staff: SupportStaffService;
  /** autenticação (Bearer) */
  authed: RequestHandler;
  /** carrega o estudante da sessão (nunca do corpo) */
  asStudent: RequestHandler;
  /** registra acessos negados à fila da equipe (opcional) */
  audit?: AuditService;
}

/** Rota de envio de arquivos: corpo JSON maior (base64), montado antes do parser padrão de 64 kB. */
export const SUPPORT_UPLOAD_PATHS = ['/api/support/uploads', '/api/support/staff/uploads'];
export const SUPPORT_UPLOAD_BODY_LIMIT = '8mb';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

/** Atendimento ASA: chamados do estudante e fila da equipe. */
export function createSupportRouter(deps: SupportRouteDeps): Router {
  const router = Router();
  const support = createSupportController(deps.student, deps.repos);
  const files = createSupportFileController(deps.core);
  const staff = createSupportStaffController(deps.staff, deps.repos);
  const { authed, asStudent } = deps;
  // Conteúdo dos chamados é da equipe ASA (ADR-008): a administração vê só metadados (/api/admin/*), nunca as mensagens.
  const denied = (req: Request, permission: string) => {
    void deps.audit?.recordFor(req, { action: 'authz.denied', outcome: 'denied', metadata: { permission, route: req.route?.path ?? req.path } });
  };
  const asStaff = requirePermission('tickets:read:any', denied);
  // escrita exige a permissão da ação (responder/atribuir/situação/prioridade ou nota interna), além da leitura
  const canManage = requirePermission('tickets:manage', denied);
  const canNote = requirePermission('tickets:internal_note', denied);
  // rotas do aluno: depois do vínculo de aluno, a permissão da matriz (abrir × acompanhar os próprios chamados)
  const ownCreate = requirePermission('tickets:create:own', denied);
  const ownRead = requirePermission('tickets:read:own', denied);

  router.get('/api/support/catalog', authed, wrap(support.catalog));
  router.get('/api/support/overview', authed, asStudent, ownRead, wrap(support.overview));
  router.get('/api/support/tickets', authed, asStudent, ownRead, wrap(support.list));
  router.post('/api/support/tickets', authed, asStudent, ownCreate, validateBody(supportCreateSchema), wrap(support.create));
  router.get('/api/support/tickets/:id', authed, asStudent, ownRead, wrap(support.get));
  router.get('/api/support/tickets/:id/events', authed, asStudent, ownRead, wrap(support.events));
  router.post('/api/support/tickets/:id/messages', authed, asStudent, ownRead, validateBody(supportMessageSchema), wrap(support.reply));
  router.post('/api/support/tickets/:id/read', authed, asStudent, ownRead, wrap(support.read));
  router.post('/api/support/tickets/:id/cancel', authed, asStudent, ownRead, validateBody(supportCancelSchema), wrap(support.cancel));
  router.post('/api/support/tickets/:id/reopen', authed, asStudent, ownRead, validateBody(supportReopenSchema), wrap(support.reopen));
  router.post('/api/support/tickets/:id/rating', authed, asStudent, ownRead, validateBody(supportRatingSchema), wrap(support.rate));
  router.get('/api/support/tickets/:id/attachments/:attachmentId/link', authed, asStudent, ownRead, wrap(support.attachmentLink));
  router.post('/api/support/uploads', authed, asStudent, ownRead, validateBody(supportUploadSchema), wrap(support.upload));
  router.delete('/api/support/uploads/:uploadId', authed, asStudent, ownRead, wrap(support.deleteUpload));
  router.get('/api/support/notifications', authed, asStudent, ownRead, wrap(support.notifications));
  router.post('/api/support/notifications/read', authed, asStudent, ownRead, validateBody(supportNotificationsReadSchema), wrap(support.readNotifications));
  // O link assinado é a credencial (abre no navegador sem cabeçalho Authorization).
  router.get('/api/support/files/:attachmentId', wrap(files.download));

  router.get('/api/support/staff/tickets', authed, asStaff, wrap(staff.list));
  router.get('/api/support/staff/tickets/:id', authed, asStaff, wrap(staff.get));
  router.post('/api/support/staff/tickets/:id/read', authed, asStaff, wrap(staff.read));
  router.get('/api/support/staff/tickets/:id/attachments/:attachmentId/link', authed, asStaff, wrap(staff.attachmentLink));
  // Cada ação da equipe também entra na auditoria geral (quem, quando, canal, correlação), além do histórico do chamado.
  const audited = (action: string, metadata: (req: Request) => Record<string, unknown> = () => ({})): RequestHandler => (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) void deps.audit?.recordFor(req, { action, resourceType: 'ticket', resourceId: String(req.params.id ?? ''), metadata: metadata(req) });
    });
    next();
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  router.post('/api/support/staff/tickets/:id/status', authed, asStaff, canManage, validateBody(staffStatusSchema), audited('ticket.status_changed', (req) => ({ to: String(body(req).status) })), wrap(staff.status));
  router.post('/api/support/staff/tickets/:id/assign', authed, asStaff, canManage, validateBody(staffAssignSchema), audited('ticket.assigned', (req) => ({ team: String(body(req).team) })), wrap(staff.assign));
  router.post('/api/support/staff/tickets/:id/messages', authed, asStaff, canManage, validateBody(staffMessageSchema), audited('ticket.message_sent', (req) => ({ requestedAction: Boolean(body(req).requestAction) })), wrap(staff.message));
  router.post('/api/support/staff/tickets/:id/notes', authed, asStaff, canNote, validateBody(staffNoteSchema), audited('ticket.internal_note'), wrap(staff.note));
  router.post('/api/support/staff/tickets/:id/priority', authed, asStaff, canManage, validateBody(staffPrioritySchema), audited('ticket.priority_changed', (req) => ({ to: String(body(req).priority) })), wrap(staff.priority));
  router.post('/api/support/staff/tickets/:id/resolve', authed, asStaff, canManage, validateBody(staffResolveSchema), audited('ticket.resolved'), wrap(staff.resolve));
  router.post('/api/support/staff/uploads', authed, asStaff, canManage, validateBody(supportUploadSchema), wrap(staff.upload));
  router.delete('/api/support/staff/uploads/:uploadId', authed, asStaff, canManage, wrap(staff.deleteUpload));

  return router;
}
