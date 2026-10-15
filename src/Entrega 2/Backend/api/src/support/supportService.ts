import { randomUUID } from 'node:crypto';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import type {
  SupportAttachmentLink as SupportAttachmentLinkDto,
  SupportCancelRequest,
  SupportCatalog,
  SupportHelpArticle,
  SupportMessageCreateRequest,
  SupportNotificationList,
  SupportOverview,
  SupportRatingRequest,
  SupportReopenRequest,
  SupportTicket,
  SupportTicketCreateRequest,
  SupportTicketEvent,
  SupportTicketList,
  SupportTicketStatus,
  SupportUpload,
  SupportUploadRequest,
} from '../contracts/mobileApi.v1.js';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from '../errors/AppError.js';
import type { Logger } from '../config/logger.js';
import type { Repositories } from '../repositories/types.js';
import { decodeUpload, PENDING_UPLOAD_TTL_MS, signAttachmentLink, verifyAttachmentLink } from './attachments.js';
import { categoryIdsMatching, findCategory, findSubcategoryLabel, MAX_ATTACHMENTS_PER_SUBMISSION, normalizeSearch, SUPPORT_LIMITS, supportCatalog, TRIAGE_TEAM } from './catalog.js';
import { reopenDeadline, toEvent, toNotification, toSummary, toTicket, type TicketBundle } from './mappers.js';
import { completeSla, restartSla, resumeSla, startSla } from './sla.js';
import { ALL_STATUSES, isActiveStatus } from './statuses.js';
import type { NewSupportEvent, NewSupportNotification, SupportAttachmentRecord, SupportTicketChanges, SupportTicketRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
/** Um chamado resolvido continua em destaque na Home por este tempo (para o estudante ver a solução e avaliar). */
const RESOLVED_HIGHLIGHT_MS = 3 * DAY_MS;

/** Entrega opcional por push (registro de aparelhos fica fora do módulo). Falhas nunca afetam a requisição. */
export interface SupportPushNotifier {
  sendToUser(userId: string, payload: { title: string; body: string; data: Record<string, unknown>; idempotencyKey: string }): Promise<unknown>;
}

export interface SupportServiceConfig {
  timeZone: string;
  /** modo demonstração desligado: a fila da equipe não mostra chamados de contas fictícias */
  excludeDemo?: boolean;
  /** chave dos links assinados de download (derivada do segredo do servidor) */
  signingSecret: string;
  rateLimitEnabled: boolean;
}

/** Quem age: o usuário autenticado e o nome público que aparece no histórico. */
export interface SupportActor {
  userId: string;
  displayName: string;
}

export const SUPPORT_RATE_LIMITS = {
  create: { windowMs: HOUR_MS, max: 20 },
  message: { windowMs: HOUR_MS, max: 120 },
  upload: { windowMs: HOUR_MS, max: 60 },
} as const;

export function event(partial: Pick<NewSupportEvent, 'type' | 'title' | 'actorType'> & Partial<NewSupportEvent>): NewSupportEvent {
  return {
    visibility: 'public',
    description: null,
    actorUserId: null,
    actorName: null,
    fromStatus: null,
    toStatus: null,
    details: [],
    ...partial,
  };
}

export function encodeCursor(ticket: { updatedAt: Date; id: string }): string {
  return Buffer.from(`${ticket.updatedAt.toISOString()}|${ticket.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { updatedAt: Date; id: string } | null {
  if (!cursor) return null;
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const [updatedAt, id] = raw.split('|');
  const date = updatedAt ? new Date(updatedAt) : null;
  if (!date || Number.isNaN(date.getTime()) || !id) {
    throw new ValidationError('Cursor de paginação inválido.', [{ field: 'cursor', message: 'cursor inválido' }]);
  }
  return { updatedAt: date, id };
}

export function parseStatuses(raw: string | undefined): SupportTicketStatus[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const invalid = values.filter((value) => !(ALL_STATUSES as readonly string[]).includes(value));
  if (invalid.length > 0) {
    throw new ValidationError('Situação de chamado inválida.', [{ field: 'status', message: `desconhecido: ${invalid.join(', ')}` }]);
  }
  return values as SupportTicketStatus[];
}

export interface ListQuery {
  status?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  // ---- platform (fila da equipe)
  assigned?: 'mine' | 'unassigned';
  team?: string;
  category?: string;
  priority?: string;
  sla?: 'at_risk' | 'near_deadline' | 'overdue';
  unread?: boolean;
  sort?: 'updated' | 'due';
}

/** Meta padrão de primeira resposta (horas corridas) quando a administração não definiu outra. */
export const DEFAULT_FIRST_RESPONSE_HOURS = 24;

/** Ganchos opcionais da administração (definidos depois da construção para evitar dependência circular). */
export interface SupportCoreHooks {
  /** Dias úteis de solução vigentes para a categoria (metas da administração); `fallback` = catálogo. */
  resolutionDays?: (categoryId: string, fallback: number) => Promise<number>;
  /** Horas corridas para a primeira resposta da equipe (metas da administração; padrão 24). */
  firstResponseHours?: (categoryId: string) => Promise<number>;
  /** Chamado criado (depois da transação). Não lança: falhas ficam no histórico das automações. */
  onTicketCreated?: (ticket: SupportTicketRecord) => Promise<void>;
}

/** Operações compartilhadas entre a visão do estudante e a da equipe. */
export class SupportCore {
  hooks: SupportCoreHooks = {};

  private readonly limiters = {
    create: new FixedWindowLimiter(SUPPORT_RATE_LIMITS.create, () => this.now().getTime()),
    message: new FixedWindowLimiter(SUPPORT_RATE_LIMITS.message, () => this.now().getTime()),
    upload: new FixedWindowLimiter(SUPPORT_RATE_LIMITS.upload, () => this.now().getTime()),
  };

  constructor(
    readonly repos: Repositories,
    readonly config: SupportServiceConfig,
    readonly now: () => Date,
    private readonly push: SupportPushNotifier | null = null,
    private readonly logger: Logger | null = null,
  ) {}

  limit(kind: keyof typeof SUPPORT_RATE_LIMITS, key: string): void {
    if (!this.config.rateLimitEnabled) return;
    const result = this.limiters[kind].hit(key);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
  }

  async findTicketOrThrow(ticketId: string): Promise<SupportTicketRecord> {
    const ticket = await this.repos.support.findTicket(ticketId);
    if (!ticket) throw new NotFoundError('Chamado não encontrado.');
    return ticket;
  }

  async loadBundle(ticket: SupportTicketRecord, includeInternal: boolean): Promise<TicketBundle> {
    const [events, messages, attachments, rating] = await Promise.all([
      this.repos.support.listEvents(ticket.id, { includeInternal }),
      this.repos.support.listMessages(ticket.id),
      this.repos.support.listAttachments(ticket.id),
      this.repos.support.findRating(ticket.id),
    ]);
    return { ticket, events, messages, attachments, rating };
  }

  /** Valida envios pendentes do próprio usuário antes de vinculá-los (o repositório confere de novo na transação). */
  async checkPendingUploads(ids: string[] | undefined, ownerUserId: string, alreadyAttached: number): Promise<SupportAttachmentRecord[]> {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return [];
    if (unique.length > MAX_ATTACHMENTS_PER_SUBMISSION) {
      throw new ValidationError(`Envie no máximo ${MAX_ATTACHMENTS_PER_SUBMISSION} arquivos por vez.`, [{ field: 'attachmentIds', message: 'arquivos demais' }]);
    }
    if (alreadyAttached + unique.length > SUPPORT_LIMITS.maxAttachmentsPerTicket) {
      throw new ValidationError(`Um chamado aceita até ${SUPPORT_LIMITS.maxAttachmentsPerTicket} arquivos.`, [{ field: 'attachmentIds', message: 'limite do chamado' }]);
    }
    const now = this.now();
    const records = await Promise.all(unique.map((id) => this.repos.support.findAttachment(id)));
    const invalid = records.some((record) => !record || record.ticketId !== null || record.uploadedByUserId !== ownerUserId || (record.expiresAt !== null && record.expiresAt < now));
    if (invalid) {
      throw new ValidationError('Um dos arquivos expirou ou não está mais disponível. Envie-o novamente.', [{ field: 'attachmentIds', message: 'arquivo indisponível' }], { reason: 'attachment_unavailable' });
    }
    return records as SupportAttachmentRecord[];
  }

  async upload(actor: SupportActor, uploadedByType: 'student' | 'agent', body: SupportUploadRequest): Promise<SupportUpload> {
    this.limit('upload', actor.userId);
    const decoded = decodeUpload(body);
    const now = this.now();
    const record = await this.repos.support.createUpload({
      id: randomUUID(),
      uploadedByType,
      uploadedByUserId: actor.userId,
      uploaderName: actor.displayName,
      fileName: decoded.fileName,
      mimeType: decoded.mimeType,
      sizeBytes: decoded.sizeBytes,
      sha256: decoded.sha256,
      content: decoded.content,
      expiresAt: new Date(now.getTime() + PENDING_UPLOAD_TTL_MS),
      now,
    });
    return {
      id: record.id,
      name: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt.toISOString(),
      expiresAt: (record.expiresAt ?? now).toISOString(),
    };
  }

  async deleteUpload(userId: string, uploadId: string): Promise<void> {
    const removed = await this.repos.support.deletePendingUpload(uploadId, userId);
    if (!removed) throw new NotFoundError('Arquivo não encontrado.');
  }

  /** Download por link assinado (sem cabeçalho Authorization: o link é a credencial, válido por 5 minutos). */
  async download(attachmentId: string, exp: string | undefined, sig: string | undefined): Promise<{ record: SupportAttachmentRecord; content: Buffer }> {
    if (!verifyAttachmentLink(this.config.signingSecret, attachmentId, exp, sig, this.now())) {
      throw new ForbiddenError('Link de arquivo inválido ou expirado.', 'invalid_link');
    }
    const record = await this.repos.support.findAttachment(attachmentId);
    const content = record?.ticketId ? await this.repos.support.readAttachmentContent(attachmentId) : null;
    if (!record || !content) throw new NotFoundError('Arquivo não encontrado.');
    return { record, content };
  }

  link(attachmentId: string): SupportAttachmentLinkDto {
    const signed = signAttachmentLink(this.config.signingSecret, attachmentId, this.now());
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  async apply(changes: Omit<SupportTicketChanges, 'now'> & { now?: Date }): Promise<SupportTicketRecord> {
    const updated = await this.repos.support.applyChanges({ ...changes, now: changes.now ?? this.now() });
    if (changes.notifications.length > 0) this.deliverPush(updated, changes.notifications);
    return updated;
  }

  /** Push best-effort: o registro no centro de avisos já foi gravado na transação. */
  deliverPush(ticket: SupportTicketRecord, notifications: NewSupportNotification[]): void {
    if (!this.push) return;
    const push = this.push;
    void this.repos.students
      .findById(ticket.studentId)
      .then(async (student) => {
        if (!student) return;
        for (const notification of notifications) {
          await push.sendToUser(student.userId, {
            title: notification.title,
            body: `${ticket.protocol} · ${notification.body}`,
            data: { type: 'support_ticket', ticketId: ticket.id, kind: notification.kind },
            idempotencyKey: `support:${ticket.id}:${ticket.version}:${notification.kind}`,
          });
        }
      })
      .catch((error: unknown) => {
        this.logger?.warn({ ticket_id: ticket.id, error_type: error instanceof Error ? error.name : typeof error }, 'support push delivery failed');
      });
  }
}

/** Visão do estudante: o estudante vem sempre da sessão (`studentId` do middleware), nunca do corpo. */
export class SupportService {
  constructor(private readonly core: SupportCore) {}

  private get repos() {
    return this.core.repos;
  }

  private now(): Date {
    return this.core.now();
  }

  /** Central de ajuda vem dos artigos publicados da base de conhecimento; sem banco, do catálogo do código. */
  async catalog(): Promise<SupportCatalog> {
    const base = supportCatalog();
    // prazo exibido = meta vigente da administração (o mesmo usado na abertura do chamado)
    const resolve = this.core.hooks.resolutionDays;
    const firstResponse = this.core.hooks.firstResponseHours;
    const categories = await Promise.all(
      base.categories.map(async (category) => ({
        ...category,
        slaBusinessDays: resolve ? await resolve(category.id, category.slaBusinessDays) : category.slaBusinessDays,
        firstResponseHours: firstResponse ? await firstResponse(category.id) : DEFAULT_FIRST_RESPONSE_HOURS,
      })),
    );
    const articles = this.helpArticles ? await this.helpArticles().catch(() => null) : null;
    return { ...base, categories, ...(articles && articles.length > 0 ? { articles } : {}) };
  }

  /** fonte dos artigos da Central de ajuda (base de conhecimento) */
  helpArticles: (() => Promise<SupportHelpArticle[] | null>) | null = null;

  /** Carrega o chamado garantindo que pertence ao estudante da sessão. */
  private async owned(studentId: string, ticketId: string): Promise<SupportTicketRecord> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    if (ticket.studentId !== studentId) throw new ForbiddenError('Este chamado pertence a outro estudante.');
    return ticket;
  }

  private async view(ticket: SupportTicketRecord): Promise<SupportTicket> {
    return toTicket(await this.core.loadBundle(ticket, false), this.now());
  }

  async get(studentId: string, ticketId: string): Promise<SupportTicket> {
    return this.view(await this.owned(studentId, ticketId));
  }

  async events(studentId: string, ticketId: string): Promise<SupportTicketEvent[]> {
    const ticket = await this.owned(studentId, ticketId);
    return (await this.repos.support.listEvents(ticket.id, { includeInternal: false })).map(toEvent);
  }

  async list(studentId: string, query: ListQuery): Promise<SupportTicketList> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const search = query.search ? normalizeSearch(query.search).slice(0, 80) : '';
    const statuses = parseStatuses(query.status);
    const [rows, byStatus] = await Promise.all([
      this.repos.support.listTickets({
        studentId,
        ...(statuses ? { statuses } : {}),
        ...(search ? { search, searchCategoryIds: categoryIdsMatching(search) } : {}),
        limit: limit + 1,
        cursor: decodeCursor(query.cursor),
      }),
      this.repos.support.countByStatus(studentId),
    ]);
    const page = rows.slice(0, limit);
    const now = this.now();
    const last = page[page.length - 1];
    return {
      items: page.map((row) => toSummary(row, row, now)),
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      counts: countsFrom(byStatus),
    };
  }

  /** Resumo da Home: um único chamado em destaque, só quando há algo relevante. */
  async overview(studentId: string): Promise<SupportOverview> {
    const activeStatuses = ALL_STATUSES.filter(isActiveStatus);
    const [active, resolved, unreadNotificationsCount, byStatus] = await Promise.all([
      this.repos.support.listTickets({ studentId, statuses: activeStatuses, limit: MAX_PAGE_SIZE }),
      this.repos.support.listTickets({ studentId, statuses: ['resolved'], limit: 1 }),
      this.repos.support.countUnreadNotifications(studentId),
      this.repos.support.countByStatus(studentId),
    ]);
    const now = this.now();
    const ranked = [...active].sort((a, b) => rank(b) - rank(a) || b.updatedAt.getTime() - a.updatedAt.getTime());
    const recentResolved = resolved.find((row) => row.resolvedAt && now.getTime() - row.resolvedAt.getTime() <= RESOLVED_HIGHLIGHT_MS);
    const highlight = ranked[0] ?? recentResolved ?? null;
    const counts = countsFrom(byStatus);
    return {
      activeCount: counts.active,
      waitingStudentCount: counts.waitingStudent,
      unreadMessagesCount: active.reduce((sum, row) => sum + row.unreadCount, 0),
      unreadNotificationsCount,
      highlight: highlight ? toSummary(highlight, highlight, now) : null,
    };
  }

  async create(studentId: string, actor: SupportActor, body: SupportTicketCreateRequest, channel: 'app' | 'web' = 'app'): Promise<{ ticket: SupportTicket; created: boolean }> {
    const existing = await this.repos.support.findTicketByClientRequest(studentId, body.clientRequestId);
    if (existing) return { ticket: await this.view(existing), created: false };

    const category = findCategory(body.categoryId);
    if (!category) throw new ValidationError('Categoria inválida.', [{ field: 'categoryId', message: 'categoria desconhecida' }]);
    const subcategoryId = body.subcategoryId ?? null;
    if (category.subcategories.length > 0 && !subcategoryId) {
      throw new ValidationError('Escolha o tipo da solicitação.', [{ field: 'subcategoryId', message: 'obrigatório para esta categoria' }]);
    }
    if (subcategoryId && !findSubcategoryLabel(category.id, subcategoryId)) {
      throw new ValidationError('Tipo de solicitação inválido.', [{ field: 'subcategoryId', message: 'não pertence à categoria' }]);
    }
    this.core.limit('create', studentId);
    const uploads = await this.core.checkPendingUploads(body.attachmentIds, actor.userId, 0);

    const now = this.now();
    const subcategoryLabel = findSubcategoryLabel(category.id, subcategoryId);
    const subject = body.subject.trim();
    const days = this.core.hooks.resolutionDays ? await this.core.hooks.resolutionDays(category.id, category.slaBusinessDays) : category.slaBusinessDays;
    const firstResponseHours = this.core.hooks.firstResponseHours ? await this.core.hooks.firstResponseHours(category.id) : DEFAULT_FIRST_RESPONSE_HOURS;
    const events: NewSupportEvent[] = [
      event({
        type: 'ticket_created',
        title: 'Chamado aberto',
        actorType: 'student',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        toStatus: 'submitted',
        details: [{ label: 'Categoria', value: category.label }, ...(subcategoryLabel ? [{ label: 'Tipo', value: subcategoryLabel }] : [])],
      }),
      ...uploads.map((upload) => event({ type: 'file_uploaded', title: 'Arquivo anexado', description: upload.fileName, actorType: 'student', actorUserId: actor.userId, actorName: actor.displayName })),
      event({
        type: 'ticket_received',
        title: 'Solicitação recebida pelo ASA',
        description: 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.',
        actorType: 'system',
        actorName: TRIAGE_TEAM,
        fromStatus: 'submitted',
        toStatus: 'received',
        details: [
          { label: 'Equipe responsável', value: TRIAGE_TEAM },
          { label: 'Prazo de resposta', value: `até ${days} ${days === 1 ? 'dia útil' : 'dias úteis'}` },
        ],
      }),
    ];
    const notifications: NewSupportNotification[] = [{ kind: 'ticket_received', title: 'Chamado recebido', body: `"${subject}" entrou na fila do ASA. Avisaremos a cada atualização.` }];
    const result = await this.repos.support.createTicket({
      id: `ticket-${randomUUID()}`,
      studentId,
      channel,
      clientRequestId: body.clientRequestId,
      categoryId: category.id,
      subcategoryId,
      subject,
      description: body.description.trim(),
      searchText: normalizeSearch([subject, category.label, subcategoryLabel ?? ''].join(' ')),
      status: 'received',
      priority: category.defaultPriority,
      assignedTeam: TRIAGE_TEAM,
      sla: startSla(days, now, this.core.config.timeZone),
      firstResponseDueAt: new Date(now.getTime() + firstResponseHours * 3_600_000),
      events,
      attachments: uploads.length > 0 ? { ids: uploads.map((upload) => upload.id), ownerUserId: actor.userId, messageId: null } : null,
      notifications,
      now,
    });
    if (!result.created) return { ticket: await this.view(result.ticket), created: false };
    this.core.deliverPush(result.ticket, notifications);
    if (!this.core.hooks.onTicketCreated) return { ticket: await this.view(result.ticket), created: true };
    await this.core.hooks.onTicketCreated(result.ticket);
    // a automação pode ter elevado a prioridade (nova versão): devolve o estado atual
    return { ticket: await this.view((await this.repos.support.findTicket(result.ticket.id)) ?? result.ticket), created: true };
  }

  async reply(studentId: string, actor: SupportActor, ticketId: string, body: SupportMessageCreateRequest): Promise<SupportTicket> {
    const ticket = await this.owned(studentId, ticketId);
    const duplicate = await this.repos.support.findMessageByClientId(ticket.id, body.clientMessageId);
    if (duplicate) return this.view(ticket);
    if (!isActiveStatus(ticket.status)) throw new ConflictError('Este chamado não recebe novas mensagens.', 'ticket_not_open');
    const content = body.content.trim();
    if (!content && (body.attachmentIds ?? []).length === 0) {
      throw new ValidationError('Escreva uma mensagem ou anexe um arquivo.', [{ field: 'content', message: 'obrigatório' }]);
    }
    this.core.limit('message', actor.userId);
    const attached = (await this.repos.support.listAttachments(ticket.id)).length;
    const uploads = await this.core.checkPendingUploads(body.attachmentIds, actor.userId, attached);

    const now = this.now();
    const messageId = randomUUID();
    const events: NewSupportEvent[] = [
      event({ type: 'message_sent', title: 'Mensagem enviada', actorType: 'student', actorUserId: actor.userId, actorName: actor.displayName }),
      ...uploads.map((upload) => event({ type: 'file_uploaded', title: 'Arquivo anexado', description: upload.fileName, actorType: 'student', actorUserId: actor.userId, actorName: actor.displayName })),
    ];
    let patch: SupportTicketChanges['patch'] = {};
    if (ticket.status === 'waiting_student') {
      // A resposta destrava o atendimento: o prazo volta a correr e o chamado volta para análise.
      patch = { status: 'in_analysis', pendingAction: null, sla: resumeSla(ticket.sla, now) };
      events.push(
        event({
          type: 'student_response_received',
          title: 'Resposta enviada ao ASA',
          description: 'O atendimento continua a partir da sua resposta.',
          actorType: 'student',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          fromStatus: 'waiting_student',
          toStatus: 'in_analysis',
        }),
      );
    }
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch,
      events,
      messages: [{ id: messageId, senderType: 'student', senderUserId: actor.userId, senderName: actor.displayName, content, clientMessageId: body.clientMessageId }],
      attachments: uploads.length > 0 ? [{ ids: uploads.map((upload) => upload.id), ownerUserId: actor.userId, messageId }] : [],
      notifications: [],
      now,
    });
    return this.view(updated);
  }

  async markRead(studentId: string, ticketId: string): Promise<SupportTicket> {
    const ticket = await this.owned(studentId, ticketId);
    await this.repos.support.markRead(ticket.id, studentId, this.now());
    return this.view(ticket);
  }

  async cancel(studentId: string, actor: SupportActor, ticketId: string, body: SupportCancelRequest): Promise<SupportTicket> {
    const ticket = await this.owned(studentId, ticketId);
    if (!isActiveStatus(ticket.status)) throw new ConflictError('Este chamado não pode mais ser cancelado.', 'cancel_not_allowed');
    const now = this.now();
    const reason = body.reason?.trim() || null;
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { status: 'cancelled', cancelledAt: now, cancelReason: reason, pendingAction: null, sla: completeSla(ticket.sla, now) },
      events: [
        event({
          type: 'ticket_cancelled',
          title: 'Chamado cancelado pelo estudante',
          description: reason,
          actorType: 'student',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          fromStatus: ticket.status,
          toStatus: 'cancelled',
        }),
      ],
      messages: [],
      attachments: [],
      notifications: [],
      now,
    });
    return this.view(updated);
  }

  /** "Ainda preciso de ajuda": só a partir de `resolved`, dentro da janela. A resolução anterior continua no histórico. */
  async reopen(studentId: string, actor: SupportActor, ticketId: string, body: SupportReopenRequest): Promise<SupportTicket> {
    const ticket = await this.owned(studentId, ticketId);
    const deadline = reopenDeadline(ticket);
    const now = this.now();
    if (!deadline || deadline.getTime() <= now.getTime()) {
      throw new ConflictError(
        ticket.status === 'resolved' ? 'O prazo para reabrir este chamado terminou. Abra um novo chamado.' : 'Somente chamados resolvidos podem ser reabertos.',
        'reopen_not_allowed',
      );
    }
    const reason = body.reason.trim();
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { status: 'reopened', reopenedCount: ticket.reopenedCount + 1, sla: restartSla(ticket.sla, now, this.core.config.timeZone) },
      events: [
        event({
          type: 'ticket_reopened',
          title: 'Chamado reaberto pelo estudante',
          description: reason,
          actorType: 'student',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          fromStatus: 'resolved',
          toStatus: 'reopened',
          details: ticket.resolution ? [{ label: 'Resolução anterior', value: ticket.resolution }] : [],
        }),
      ],
      messages: [{ id: randomUUID(), senderType: 'student', senderUserId: actor.userId, senderName: actor.displayName, content: reason, clientMessageId: null }],
      attachments: [],
      notifications: [],
      now,
    });
    return this.view(updated);
  }

  async rate(studentId: string, actor: SupportActor, ticketId: string, body: SupportRatingRequest): Promise<SupportTicket> {
    const ticket = await this.owned(studentId, ticketId);
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new ConflictError('A avaliação fica disponível depois que o chamado é resolvido.', 'rating_not_allowed');
    }
    if (await this.repos.support.findRating(ticket.id)) throw new ConflictError('Você já avaliou este atendimento.', 'already_rated');
    const now = this.now();
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: {},
      events: [
        event({
          type: 'rating_submitted',
          title: 'Atendimento avaliado',
          actorType: 'student',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          details: [{ label: 'Nota', value: `${body.rating} de 5` }],
        }),
      ],
      messages: [],
      attachments: [],
      notifications: [],
      rating: { rating: body.rating, comment: body.comment?.trim() || null },
      now,
    });
    return this.view(updated);
  }

  upload(actor: SupportActor, body: SupportUploadRequest): Promise<SupportUpload> {
    return this.core.upload(actor, 'student', body);
  }

  deleteUpload(userId: string, uploadId: string): Promise<void> {
    return this.core.deleteUpload(userId, uploadId);
  }

  async attachmentLink(studentId: string, ticketId: string, attachmentId: string): Promise<SupportAttachmentLinkDto> {
    const ticket = await this.owned(studentId, ticketId);
    const attachment = await this.repos.support.findAttachment(attachmentId);
    if (!attachment || attachment.ticketId !== ticket.id) throw new NotFoundError('Arquivo não encontrado.');
    return this.core.link(attachment.id);
  }

  async notifications(studentId: string, limit = 20): Promise<SupportNotificationList> {
    const [items, unreadCount] = await Promise.all([
      this.repos.support.listNotifications(studentId, Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)),
      this.repos.support.countUnreadNotifications(studentId),
    ]);
    return { items: items.map(toNotification), unreadCount };
  }

  async readNotifications(studentId: string, ids: string[] | undefined): Promise<SupportNotificationList> {
    await this.repos.support.markNotificationsRead(studentId, ids && ids.length > 0 ? ids : null, this.now());
    return this.notifications(studentId);
  }
}

/** Ordem de destaque na Home: ação pendente > mensagem nova > demais. */
function rank(row: { status: SupportTicketStatus; unreadCount: number }): number {
  if (row.status === 'waiting_student') return 2;
  if (row.unreadCount > 0) return 1;
  return 0;
}

export function countsFrom(byStatus: Partial<Record<SupportTicketStatus, number>>): SupportTicketList['counts'] {
  let all = 0;
  let active = 0;
  for (const status of ALL_STATUSES) {
    const count = byStatus[status] ?? 0;
    all += count;
    if (isActiveStatus(status)) active += count;
  }
  return { all, active, waitingStudent: byStatus.waiting_student ?? 0, finished: all - active, byStatus: { ...byStatus } };
}
