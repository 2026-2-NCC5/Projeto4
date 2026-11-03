import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { FixedWindowLimiter } from '../../auth/rateLimiter.js';
import { ok } from '../../controllers/respond.js';
import type { Permission, SupportChannelCreateRequest, SupportChannelPatchRequest, SupportContactReviewDecisionRequest, SupportContactVerificationConfirmRequest, SupportContactVerificationCreateRequest, SupportSavedReplyRequest, SupportSavedReplyStatusRequest, SupportSimulatorConnectionRequest, SupportSimulatorDeliveryRequest, SupportSimulatorInboundRequest, SupportSimulatorNextSendRequest, SupportTicketTagsRequest } from '../../contracts/mobileApi.v1.js';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../../errors/AppError.js';
import { requirePermission, type DeniedAccessRecorder } from '../../middlewares/auth.js';
import { validateBody } from '../../middlewares/validate.js';
import type { AuditService } from '../../platform/auditService.js';
import { SUPPORT_TEAMS } from '../catalog.js';
import type { SupportCore } from '../supportService.js';
import { SYNTHETIC_PHONE } from './contactRef.js';
import { CONSENT_VERSION } from './linkService.js';
import { WebhookRejectedError } from './ingestService.js';
import type { WhatsAppModule } from './module.js';
import { FAKE_SIGNATURE_HEADER, FakeProvider } from './providers/fakeProvider.js';
import { MetaCloudProvider } from './providers/metaCloudProvider.js';
import { randomUUID } from 'node:crypto';

/** Webhooks precisam do corpo cru (a assinatura é sobre os bytes recebidos): montados antes do parser JSON. */
export const WHATSAPP_WEBHOOK_PATHS = ['/api/internal/webhooks/wa-akg', '/api/internal/webhooks/meta', '/api/internal/webhooks/fake'];
export const WHATSAPP_WEBHOOK_BODY_LIMIT = '3mb';

const WEBHOOK_RATE = { windowMs: 60_000, max: 600 };
const FEED_RATE = { windowMs: 60_000, max: 120 };

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};
const param = (req: Request, name: string): string => String(req.params[name] ?? '');
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

const phone = z.string().regex(/^\+[0-9]{8,15}$/, 'Use o formato internacional: +5511999999999.');
const channelCreateSchema = z
  .object({ name: z.string().trim().min(3).max(80), team: z.enum(SUPPORT_TEAMS), publicNumber: phone.nullable().optional(), authorizationReference: z.string().trim().max(200).nullable().optional() })
  .strict();
const channelPatchSchema = z
  .object({ name: z.string().trim().min(3).max(80).optional(), team: z.enum(SUPPORT_TEAMS).optional(), state: z.enum(['enabled', 'paused', 'disabled']).optional(), publicNumber: phone.nullable().optional(), authorizationReference: z.string().trim().max(200).nullable().optional() })
  .strict();
const verificationCreateSchema = z.object({ consentAccepted: z.boolean(), consentVersion: z.string().min(1).max(40) }).strict();
const verificationConfirmSchema = z.object({ linkPreviousTickets: z.boolean() }).strict();
const reviewDecisionSchema = z.object({ decision: z.enum(['transfer_link', 'reject']), reason: z.string().trim().min(10).max(500) }).strict();
const tagsSchema = z.object({ tags: z.array(z.string().trim().min(1).max(40)).max(10) }).strict();
const presenceSchema = z.object({ composing: z.boolean().optional() }).strict();
const savedReplySchema = z.object({ categoryId: z.string().trim().max(40).nullable().optional(), title: z.string().trim().min(3).max(80), body: z.string().trim().min(1).max(2000) }).strict();
const savedReplyStatusSchema = z.object({ approvalStatus: z.enum(['approved', 'archived']) }).strict();
const retrySchema = z.object({ confirmDuplicateRisk: z.boolean().optional() }).strict();
const simulatorInboundSchema = z
  .object({
    channelId: z.string().uuid(),
    from: z.string().regex(SYNTHETIC_PHONE, 'Use um número sintético: +999...'),
    name: z.string().trim().max(120).optional(),
    text: z.string().max(8000).optional(),
    kind: z.enum(['text', 'document', 'image', 'unsupported']).optional(),
    providerEventId: z.string().min(1).max(200).optional(),
  })
  .strict();
const simulatorDeliverySchema = z.object({ channelId: z.string().uuid(), state: z.enum(['sent', 'delivered', 'read', 'failed']) }).strict();
const simulatorConnectionSchema = z.object({ channelId: z.string().uuid(), status: z.enum(['CONNECTED', 'DISCONNECTED', 'DEGRADED', 'QR_REQUIRED']) }).strict();
const simulatorNextSendSchema = z.object({ channelId: z.string().uuid(), mode: z.enum(['fail', 'reject', 'timeout']).nullable() }).strict();

export interface WhatsAppRouteDeps {
  module: WhatsAppModule;
  core: SupportCore;
  audit: AuditService;
  authed: RequestHandler;
  asStudent: RequestHandler;
  onDenied: DeniedAccessRecorder;
  rateLimitEnabled: boolean;
  now: () => Date;
  /** só fora de produção e com o provedor fake */
  simulatorEnabled: boolean;
}

const source = (req: Request): 'app' | 'web' => (req.auth?.channel === 'web' ? 'web' : 'app');

export function createWhatsAppRouter(deps: WhatsAppRouteDeps): Router {
  const router = Router();
  const { module, authed, asStudent, audit, core, now } = deps;
  const { channels, feed, repo } = module;
  const can = (permission: Permission) => requirePermission(permission, deps.onDenied);
  const webhookLimiter = new FixedWindowLimiter(WEBHOOK_RATE, () => now().getTime());
  const feedLimiter = new FixedWindowLimiter(FEED_RATE, () => now().getTime());

  const limitFeed: RequestHandler = (req, _res, next) => {
    if (deps.rateLimitEnabled && req.auth) {
      const hit = feedLimiter.hit(req.auth.userId);
      if (!hit.allowed) return next(new RateLimitedError(hit.retryAfterSeconds));
    }
    next();
  };
  const feedOptions = (req: Request, res: Response) => {
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const wait = Number(text(req.query.wait) ?? '0');
    return { since: text(req.query.since), waitSeconds: Number.isFinite(wait) ? wait : 0, signal: controller.signal };
  };
  const requireLinks = () => {
    if (!module.links) throw new ConflictError('O canal WhatsApp não está disponível no momento.', 'provider_unavailable');
    return module.links;
  };

  // ---- eventos (tempo real por long polling + reconciliação por cursor)
  router.get('/api/support/staff/events', authed, can('tickets:read:any'), limitFeed, wrap(async (req, res) => {
    module.touch();
    ok(req, res, await feed.read({ kind: 'staff' }, feedOptions(req, res)));
  }));
  router.get('/api/support/me/events', authed, asStudent, can('tickets:read:own'), limitFeed, wrap(async (req, res) => {
    // o estudante vem da sessão; nenhum identificador do cliente entra no filtro
    ok(req, res, await feed.read({ kind: 'student', studentId: req.student!.id }, feedOptions(req, res)));
  }));

  // ---- equipe
  router.get('/api/support/staff/whatsapp/status', authed, can('tickets:read:any'), wrap(async (req, res) => {
    ok(req, res, await channels.staffStatus());
  }));
  router.get('/api/support/staff/whatsapp/metrics', authed, can('metrics:read'), wrap(async (req, res) => {
    const to = text(req.query.to) ? new Date(text(req.query.to)!) : now();
    const from = text(req.query.from) ? new Date(text(req.query.from)!) : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new ValidationError('Período inválido.', [{ field: 'from', message: 'período inválido' }]);
    ok(req, res, await channels.metrics(from, to));
  }));
  router.get('/api/support/staff/inbox/counts', authed, can('tickets:read:any'), wrap(async (req, res) => {
    ok(req, res, await repo.inboxCounts(req.auth!.userId, Boolean(core.config.excludeDemo)));
  }));
  router.post('/api/support/staff/tickets/:id/messages/:messageId/retry', authed, can('tickets:read:any'), can('tickets:manage'), validateBody(retrySchema), wrap(async (req, res) => {
    const ticket = await core.findTicketOrThrow(param(req, 'id'));
    const message = await repo.findMessage(param(req, 'messageId'));
    if (!message || message.ticketId !== ticket.id || message.senderType !== 'agent' || message.transport !== 'whatsapp' || !message.channelId) throw new NotFoundError('Mensagem não encontrada.');
    if (message.deliveryState !== 'failed' && message.deliveryState !== 'unknown') throw new ConflictError('Esta mensagem não precisa de nova tentativa.', 'retry_not_allowed');
    // resultado desconhecido pode já ter chegado: reenviar é uma decisão humana, com o risco à vista
    if (message.deliveryState === 'unknown' && !(req.body as { confirmDuplicateRisk?: boolean }).confirmDuplicateRisk) throw new ConflictError('Não sabemos se esta mensagem chegou. Confirme para reenviar: a pessoa pode receber duas vezes.', 'delivery_unknown');
    const conversation = ticket.conversationId ? await repo.findConversation(ticket.conversationId) : null;
    if (!conversation || (ticket.studentId && ticket.studentId !== conversation.studentId)) throw new ConflictError('Este chamado não tem conversa no WhatsApp.', 'no_whatsapp_conversation');
    const block = channels.replyBlock(await repo.findChannel(conversation.channelId), conversation);
    if (block) throw new ConflictError('O canal não aceita envios agora.', block);
    if (!(await repo.requeueForRetry({ ticketId: ticket.id, messageId: message.id, channelId: message.channelId, now: now() }))) throw new ConflictError('Esta mensagem não precisa de nova tentativa.', 'retry_not_allowed');
    await audit.recordFor(req, { action: 'ticket.message_retry', resourceType: 'ticket', resourceId: ticket.id, metadata: { fromState: message.deliveryState } });
    module.kick();
    ok(req, res, { messageId: message.id, deliveryState: 'queued' }, 202);
  }));
  router.put('/api/support/staff/tickets/:id/tags', authed, can('tickets:read:any'), can('tickets:manage'), validateBody(tagsSchema), wrap(async (req, res) => {
    const ticket = await core.findTicketOrThrow(param(req, 'id'));
    const names = [...new Set((req.body as SupportTicketTagsRequest).tags.map((tag) => tag.toLowerCase()))];
    const tags = await repo.setTicketTags(ticket.id, names, req.auth!.userId, now());
    await audit.recordFor(req, { action: 'ticket.tags_changed', resourceType: 'ticket', resourceId: ticket.id, metadata: { count: tags.length } });
    ok(req, res, { tags });
  }));
  router.get('/api/support/staff/tags', authed, can('tickets:read:any'), wrap(async (req, res) => {
    ok(req, res, { items: await repo.listTags() });
  }));
  router.post('/api/support/staff/tickets/:id/presence', authed, can('tickets:read:any'), validateBody(presenceSchema), wrap(async (req, res) => {
    const ticket = await core.findTicketOrThrow(param(req, 'id'));
    const at = now();
    await repo.touchPresence(ticket.id, req.auth!.userId, Boolean((req.body as { composing?: boolean }).composing), at);
    const viewers = await repo.listPresence(ticket.id, req.auth!.userId, new Date(at.getTime() - 45_000));
    ok(req, res, { viewers: viewers.map((viewer) => ({ userId: viewer.userId, name: viewer.name, composing: viewer.composing, lastSeenAt: viewer.lastSeenAt.toISOString() })) });
  }));
  router.get('/api/support/staff/saved-replies', authed, can('tickets:read:any'), wrap(async (req, res) => {
    ok(req, res, { items: await repo.listSavedReplies({ includeDrafts: req.query.includeDrafts === '1' }) });
  }));
  router.post('/api/support/staff/saved-replies', authed, can('tickets:manage'), validateBody(savedReplySchema), wrap(async (req, res) => {
    const body = req.body as SupportSavedReplyRequest;
    const reply = await repo.createSavedReply({ categoryId: body.categoryId ?? null, title: body.title, body: body.body, createdBy: req.auth!.userId, now: now() });
    await audit.recordFor(req, { action: 'saved_reply.created', resourceType: 'saved_reply', resourceId: reply.id });
    ok(req, res, reply, 201);
  }));
  router.post('/api/support/staff/saved-replies/:id/status', authed, can('kb:publish'), validateBody(savedReplyStatusSchema), wrap(async (req, res) => {
    const updated = await repo.setSavedReplyStatus(param(req, 'id'), (req.body as SupportSavedReplyStatusRequest).approvalStatus, req.auth!.userId, now());
    if (!updated) throw new NotFoundError('Modelo não encontrado.');
    await audit.recordFor(req, { action: 'saved_reply.status_changed', resourceType: 'saved_reply', resourceId: updated.id, metadata: { to: updated.approvalStatus } });
    ok(req, res, updated);
  }));

  // ---- estudante: vínculo verificado
  router.get('/api/support/me/whatsapp', authed, asStudent, can('tickets:read:own'), wrap(async (req, res) => {
    if (!module.links) {
      ok(req, res, { available: false, demoMode: false, consentVersion: CONSENT_VERSION, consentText: '', links: [], pending: null });
      return;
    }
    ok(req, res, await module.links.state(req.student!.id));
  }));
  router.post('/api/support/me/whatsapp/verifications', authed, asStudent, can('tickets:read:own'), validateBody(verificationCreateSchema), wrap(async (req, res) => {
    const body = req.body as SupportContactVerificationCreateRequest;
    ok(req, res, await requireLinks().request(req.student!.id, { consentAccepted: body.consentAccepted, consentVersion: body.consentVersion, source: source(req) }, audit.actorFrom(req)), 201);
  }));
  router.get('/api/support/me/whatsapp/verifications/:id', authed, asStudent, can('tickets:read:own'), wrap(async (req, res) => {
    ok(req, res, await requireLinks().get(req.student!.id, param(req, 'id')));
  }));
  router.post('/api/support/me/whatsapp/verifications/:id/confirm', authed, asStudent, can('tickets:read:own'), validateBody(verificationConfirmSchema), wrap(async (req, res) => {
    ok(req, res, await requireLinks().confirm(req.student!.id, param(req, 'id'), req.body as SupportContactVerificationConfirmRequest, audit.actorFrom(req)));
  }));
  router.delete('/api/support/me/whatsapp/links/:id', authed, asStudent, can('tickets:read:own'), wrap(async (req, res) => {
    ok(req, res, await requireLinks().revoke(req.student!.id, param(req, 'id'), audit.actorFrom(req)));
  }));

  // ---- administração do canal: conexão e QR. Nenhuma destas rotas lê conversas (ADR-008).
  const manage = can('support_channels:manage');
  router.get('/api/admin/support/channels', authed, manage, wrap(async (req, res) => {
    ok(req, res, await channels.list());
  }));
  router.post('/api/admin/support/channels', authed, manage, validateBody(channelCreateSchema), wrap(async (req, res) => {
    ok(req, res, await channels.create(req.body as SupportChannelCreateRequest, audit.actorFrom(req)), 201);
  }));
  router.patch('/api/admin/support/channels/:id', authed, manage, validateBody(channelPatchSchema), wrap(async (req, res) => {
    ok(req, res, await channels.patch(param(req, 'id'), req.body as SupportChannelPatchRequest, audit.actorFrom(req)));
  }));
  router.get('/api/admin/support/channels/:id/status', authed, manage, wrap(async (req, res) => {
    ok(req, res, await channels.get(param(req, 'id')));
  }));
  router.post('/api/admin/support/channels/:id/connect', authed, manage, wrap(async (req, res) => {
    ok(req, res, await channels.connect(param(req, 'id'), audit.actorFrom(req)));
  }));
  router.delete('/api/admin/support/channels/:id/connection', authed, manage, wrap(async (req, res) => {
    ok(req, res, await channels.disconnect(param(req, 'id'), audit.actorFrom(req)));
  }));
  router.get('/api/admin/support/provider-health', authed, manage, wrap(async (req, res) => {
    ok(req, res, await channels.health());
  }));
  router.post('/api/admin/support/inbox/replay', authed, manage, wrap(async (req, res) => {
    const replayed = await repo.replayFailedInbox(now());
    await audit.recordFor(req, { action: 'channel.inbox_replayed', resourceType: 'support_channel', metadata: { replayed } });
    ok(req, res, { replayed });
  }));
  router.get('/api/admin/support/contact-reviews', authed, manage, wrap(async (req, res) => {
    ok(req, res, module.links ? await module.links.listReviews() : { items: [] });
  }));
  router.post('/api/admin/support/contact-reviews/:id/decision', authed, manage, validateBody(reviewDecisionSchema), wrap(async (req, res) => {
    await requireLinks().decideReview(param(req, 'id'), req.body as SupportContactReviewDecisionRequest, audit.actorFrom(req));
    ok(req, res, { decided: true });
  }));

  // ---- webhooks: autenticados pela assinatura do provedor, nunca por sessão
  const receive = (providerName: 'wa-akg' | 'fake') =>
    wrap(async (req, res) => {
      if (deps.rateLimitEnabled && !webhookLimiter.hit(`${providerName}:${req.ip ?? ''}`).allowed) {
        res.status(429).json({ error: { code: 'RATE_LIMITED' } });
        return;
      }
      if (!module.ingest || module.provider?.providerName !== providerName) {
        res.status(404).json({ error: { code: 'NOT_FOUND' } });
        return;
      }
      await handleInbound(req, res, param(req, 'channelId'));
    });
  const handleInbound = async (req: Request, res: Response, channelId: string) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' } });
      return;
    }
    try {
      const result = await module.ingest!.handleWebhook(channelId, req.body, req.headers as Record<string, string | undefined>);
      res.status(200).json({ received: result.received, duplicates: result.duplicates });
    } catch (error) {
      if (error instanceof WebhookRejectedError) {
        // o motivo fica no log; o remetente só sabe o status
        req.log.warn({ status: 'webhook_rejected', reason: error.message }, 'whatsapp webhook rejected');
        res.status(error.status).json({ error: { code: error.status === 401 ? 'UNAUTHORIZED' : error.status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR' } });
        return;
      }
      throw error;
    }
  };
  router.post('/api/internal/webhooks/wa-akg/:channelId', receive('wa-akg'));
  router.post('/api/internal/webhooks/fake/:channelId', receive('fake'));
  const metaChannelId = async (): Promise<string | null> => {
    const list = await repo.listChannels();
    return list.find((channel) => channel.provider === 'meta-cloud-api' && channel.state !== 'disabled')?.id ?? null;
  };
  router.get('/api/internal/webhooks/meta', wrap(async (req, res) => {
    if (!(module.provider instanceof MetaCloudProvider)) {
      res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return;
    }
    const challenge = module.provider.verifyHandshake({ mode: req.query['hub.mode'], token: req.query['hub.verify_token'], challenge: req.query['hub.challenge'] });
    if (challenge === null) {
      res.status(403).json({ error: { code: 'FORBIDDEN' } });
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  }));
  router.post('/api/internal/webhooks/meta', wrap(async (req, res) => {
    const channelId = module.provider instanceof MetaCloudProvider ? await metaChannelId() : null;
    if (!channelId || !module.ingest) {
      res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return;
    }
    await handleInbound(req, res, channelId);
  }));

  // ---- simulador: só existe fora de produção e com o provedor fake. Passa pelo mesmo caminho do webhook real.
  if (deps.simulatorEnabled && module.provider instanceof FakeProvider) {
    const fake = module.provider;
    const deliver = async (channelId: string, payload: unknown) => {
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      return module.ingest!.handleWebhook(channelId, rawBody, { [FAKE_SIGNATURE_HEADER]: fake.sign(rawBody) });
    };
    router.post('/api/admin/support/simulator/inbound', authed, manage, validateBody(simulatorInboundSchema), wrap(async (req, res) => {
      const body = req.body as SupportSimulatorInboundRequest;
      const id = body.providerEventId ?? `fake-in-${randomUUID()}`;
      const kind = body.kind ?? 'text';
      const result = await deliver(body.channelId, {
        events: [{ kind: 'message', providerEventId: `msg:${id}`, externalMessageId: id, from: body.from, displayName: body.name ?? null, timestamp: now().toISOString(), contentKind: kind, text: body.text ?? null, mediaRef: kind === 'document' ? 'fake:document' : kind === 'image' ? 'fake:image' : null }],
      });
      ok(req, res, result);
    }));
    router.post('/api/admin/support/simulator/delivery', authed, manage, validateBody(simulatorDeliverySchema), wrap(async (req, res) => {
      const body = req.body as SupportSimulatorDeliveryRequest;
      const latest = await repo.latestOutboundWithExternalId(body.channelId);
      if (!latest) throw new NotFoundError('Nenhuma mensagem enviada neste canal ainda.');
      ok(req, res, await deliver(body.channelId, { events: [{ kind: 'delivery', providerEventId: `status:${latest.externalMessageId}:${body.state}`, externalMessageId: latest.externalMessageId, state: body.state, errorCode: body.state === 'failed' ? 'provider_rejected' : null, timestamp: now().toISOString() }] }));
    }));
    router.post('/api/admin/support/simulator/connection', authed, manage, validateBody(simulatorConnectionSchema), wrap(async (req, res) => {
      const body = req.body as SupportSimulatorConnectionRequest;
      ok(req, res, await deliver(body.channelId, { events: [{ kind: 'connection', providerEventId: `connection:${randomUUID()}`, status: body.status, timestamp: now().toISOString() }] }));
    }));
    router.post('/api/admin/support/simulator/next-send', authed, manage, validateBody(simulatorNextSendSchema), wrap(async (req, res) => {
      const body = req.body as SupportSimulatorNextSendRequest;
      await repo.updateConnection(body.channelId, { fakeNextSend: body.mode }, now());
      ok(req, res, { mode: body.mode });
    }));
  }

  return router;
}
