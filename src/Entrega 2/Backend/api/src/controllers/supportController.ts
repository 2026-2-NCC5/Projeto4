import type { Request, Response } from 'express';
import { z } from 'zod';
import type {
  SupportCancelRequest,
  SupportMessageCreateRequest,
  SupportNotificationsReadRequest,
  SupportRatingRequest,
  SupportReopenRequest,
  SupportStaffAssignRequest,
  SupportStaffMessageRequest,
  SupportStaffNoteRequest,
  SupportStaffPriorityRequest,
  SupportStaffResolveRequest,
  SupportStaffStatusRequest,
  SupportTicketCreateRequest,
  SupportUploadRequest,
} from '../contracts/mobileApi.v1.js';
import { NotFoundError } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import { contentDisposition } from '../support/attachments.js';
import { SUPPORT_LIMITS, SUPPORT_TEAMS } from '../support/catalog.js';
import { ALL_STATUSES } from '../support/statuses.js';
import type { ListQuery, SupportActor, SupportCore, SupportService } from '../support/supportService.js';
import type { SupportStaffService } from '../support/supportStaffService.js';
import { ok } from './respond.js';

const L = SUPPORT_LIMITS;
/** Chaves de idempotência geradas pelo app (UUID ou similar). */
const clientKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/, 'Identificador de requisição inválido.');
const uploadId = z.string().uuid();
const attachmentIds = z.array(uploadId).max(L.maxAttachmentsPerTicket).optional();

// Corpos estritos: campos desconhecidos (ex.: studentId, priority, status) são rejeitados com 400.
export const supportCreateSchema = z
  .object({
    clientRequestId: clientKey,
    categoryId: z.string().trim().min(1).max(40),
    subcategoryId: z.string().trim().min(1).max(40).nullable().optional(),
    subject: z.string().trim().min(L.subjectMinLength, 'Descreva o assunto em poucas palavras.').max(L.subjectMaxLength, `O assunto deve ter no máximo ${L.subjectMaxLength} caracteres.`),
    description: z.string().trim().min(L.descriptionMinLength, 'Conte um pouco mais sobre sua solicitação.').max(L.descriptionMaxLength, `A descrição deve ter no máximo ${L.descriptionMaxLength} caracteres.`),
    attachmentIds,
  })
  .strict();

export const supportMessageSchema = z
  .object({
    clientMessageId: clientKey,
    content: z.string().max(L.messageMaxLength, `A mensagem deve ter no máximo ${L.messageMaxLength} caracteres.`),
    attachmentIds,
  })
  .strict();

export const supportCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const supportReopenSchema = z.object({ reason: z.string().trim().min(10, 'Conte o que ainda precisa ser resolvido.').max(L.messageMaxLength) }).strict();
export const supportRatingSchema = z
  .object({
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    comment: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const supportUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(120),
    // 5 MB em base64 ≈ 6,7 MB de texto; o limite real (bytes decodificados) é conferido no serviço.
    contentBase64: z.string().min(1).max(Math.ceil((L.maxAttachmentBytes * 4) / 3) + 1024),
  })
  .strict();
export const supportNotificationsReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict();

export const staffStatusSchema = z.object({ status: z.enum(ALL_STATUSES as [string, ...string[]]), publicNote: z.string().trim().max(500).optional() }).strict();
export const staffAssignSchema = z.object({ team: z.enum(SUPPORT_TEAMS), publicNote: z.string().trim().max(500).optional() }).strict();
export const staffMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(L.messageMaxLength),
    attachmentIds,
    requestAction: z
      .object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(500), expectsAttachment: z.boolean().optional() })
      .strict()
      .optional(),
  })
  .strict();
export const staffNoteSchema = z.object({ content: z.string().trim().min(1).max(L.messageMaxLength) }).strict();
export const staffPrioritySchema = z.object({ priority: z.enum(['normal', 'high', 'urgent']) }).strict();
export const staffResolveSchema = z.object({ resolution: z.string().trim().min(10).max(L.messageMaxLength) }).strict();

const queryString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const queryInt = (value: unknown): number | undefined => {
  const parsed = Number(queryString(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};
const listQuery = (req: Request) => {
  const status = queryString(req.query.status);
  const search = queryString(req.query.search);
  const limit = queryInt(req.query.limit);
  const cursor = queryString(req.query.cursor);
  return { ...(status ? { status } : {}), ...(search ? { search } : {}), ...(limit !== undefined ? { limit } : {}), ...(cursor ? { cursor } : {}) };
};
const param = (req: Request, name: string): string => String(req.params[name] ?? '');

/** Filtros da fila da equipe (valores fora da lista são ignorados). */
const staffListQuery = (req: Request): ListQuery => {
  const assigned = queryString(req.query.assigned);
  const sla = queryString(req.query.sla);
  const sort = queryString(req.query.sort);
  const team = queryString(req.query.team);
  const category = queryString(req.query.category);
  const priority = queryString(req.query.priority);
  return {
    ...listQuery(req),
    ...(assigned === 'mine' || assigned === 'unassigned' ? { assigned } : {}),
    ...(sla === 'at_risk' || sla === 'near_deadline' || sla === 'overdue' ? { sla } : {}),
    ...(sort === 'due' || sort === 'updated' ? { sort } : {}),
    ...(team ? { team: team.slice(0, 400) } : {}),
    ...(category ? { category: category.slice(0, 200) } : {}),
    ...(priority ? { priority: priority.slice(0, 40) } : {}),
    ...(queryString(req.query.unread) === '1' ? { unread: true } : {}),
  };
};

/** Nome público de quem age (o estudante no histórico do próprio chamado; o nome completo fica só na auditoria). */
async function actorFor(req: Request, repos: Repositories): Promise<SupportActor> {
  const user = await repos.users.findById(req.auth!.userId);
  if (!user) throw new NotFoundError('Usuário não encontrado.');
  return { userId: user.id, displayName: user.fullName };
}

export function createSupportController(support: SupportService, repos: Repositories) {
  return {
    async catalog(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.catalog());
    },
    async overview(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.overview(req.student!.id));
    },
    async list(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.list(req.student!.id, listQuery(req)));
    },
    async get(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.get(req.student!.id, param(req, 'id')));
    },
    async events(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.events(req.student!.id, param(req, 'id')));
    },
    async create(req: Request, res: Response): Promise<void> {
      const channel = req.auth!.channel === 'web' ? 'web' : 'app';
      const result = await support.create(req.student!.id, await actorFor(req, repos), req.body as SupportTicketCreateRequest, channel);
      // Reenvio com o mesmo clientRequestId devolve o chamado já criado (200), sem duplicar.
      ok(req, res, result.ticket, result.created ? 201 : 200);
    },
    async reply(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.reply(req.student!.id, await actorFor(req, repos), param(req, 'id'), req.body as SupportMessageCreateRequest), 201);
    },
    async read(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.markRead(req.student!.id, param(req, 'id')));
    },
    async cancel(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.cancel(req.student!.id, await actorFor(req, repos), param(req, 'id'), req.body as SupportCancelRequest));
    },
    async reopen(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.reopen(req.student!.id, await actorFor(req, repos), param(req, 'id'), req.body as SupportReopenRequest));
    },
    async rate(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.rate(req.student!.id, await actorFor(req, repos), param(req, 'id'), req.body as SupportRatingRequest), 201);
    },
    async upload(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.upload(await actorFor(req, repos), req.body as SupportUploadRequest), 201);
    },
    async deleteUpload(req: Request, res: Response): Promise<void> {
      await support.deleteUpload(req.auth!.userId, param(req, 'uploadId'));
      res.status(204).end();
    },
    async attachmentLink(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.attachmentLink(req.student!.id, param(req, 'id'), param(req, 'attachmentId')));
    },
    async notifications(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.notifications(req.student!.id, queryInt(req.query.limit) ?? 20));
    },
    async readNotifications(req: Request, res: Response): Promise<void> {
      ok(req, res, await support.readNotifications(req.student!.id, (req.body as SupportNotificationsReadRequest).ids));
    },
  };
}

export function createSupportFileController(core: SupportCore) {
  return {
    /** Download pelo link assinado: binário com tipo e nome originais, sem cache compartilhado. */
    async download(req: Request, res: Response): Promise<void> {
      const { record, content } = await core.download(param(req, 'attachmentId'), queryString(req.query.exp), queryString(req.query.sig));
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Length', String(content.length));
      res.setHeader('Content-Disposition', contentDisposition(record.mimeType, record.fileName));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.status(200).end(content);
    },
  };
}

export function createSupportStaffController(staff: SupportStaffService, repos: Repositories) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.list(staffListQuery(req), req.auth!.userId));
    },
    async get(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.get(param(req, 'id')));
    },
    async read(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.markRead(param(req, 'id')));
    },
    async attachmentLink(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.attachmentLink(param(req, 'id'), param(req, 'attachmentId')));
    },
    async status(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.setStatus(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffStatusRequest));
    },
    async assign(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.assign(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffAssignRequest));
    },
    async message(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.message(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffMessageRequest), 201);
    },
    async note(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.note(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffNoteRequest), 201);
    },
    async priority(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.priority(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffPriorityRequest));
    },
    async resolve(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.resolve(await actorFor(req, repos), param(req, 'id'), req.body as SupportStaffResolveRequest));
    },
    async upload(req: Request, res: Response): Promise<void> {
      ok(req, res, await staff.upload(await actorFor(req, repos), req.body as SupportUploadRequest), 201);
    },
    async deleteUpload(req: Request, res: Response): Promise<void> {
      await staff.deleteUpload(req.auth!.userId, param(req, 'uploadId'));
      res.status(204).end();
    },
  };
}
