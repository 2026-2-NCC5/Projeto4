import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from '../../config/logger.js';
import { ConflictError } from '../../errors/AppError.js';
import type { Repositories } from '../../repositories/types.js';
import { contentMatchesType, sanitizeFileName } from '../attachments.js';
import { SUPPORT_LIMITS, TRIAGE_TEAM, findCategory, normalizeSearch } from '../catalog.js';
import { runWithCorrelation } from '../realtime/correlation.js';
import type { SupportFeedRepository } from '../realtime/feedRepository.js';
import { startSla, resumeSla, restartSla } from '../sla.js';
import { event, type SupportCore } from '../supportService.js';
import { isActiveStatus } from '../statuses.js';
import type { NewSupportEvent, NewSupportMessage, SupportTicketRecord } from '../types.js';
import type { ContactVault } from './contactVault.js';
import { nextAttemptDelayMs } from './delivery.js';
import type { LinkService } from './linkService.js';
import { NON_TEXT_PLACEHOLDER, WebhookSchemaError, type CanonicalWhatsAppEvent, type ProviderChannelContext, type WhatsAppProvider } from './provider.js';
import type { ChannelRecord, ConversationRecord, InboxRecord, WhatsAppRepository } from './repository.js';

const MAX_INBOUND_LENGTH = 8000;
const TRUNCATED_NOTICE = '\n\n[Mensagem cortada: o restante está no WhatsApp institucional]';
const MAX_PROCESS_ATTEMPTS = 8;
/** Confirmação de envio sem mensagem correspondente: pode ser algo digitado no aparelho. Depois disso, é descartada. */
const UNMATCHED_DELIVERY_ATTEMPTS = 5;
/** Enquanto o processamento em linha roda, a linha não é reprocessável por outra instância. */
const INLINE_LEASE_MS = 60_000;
const REPROCESS_LEASE_MS = 120_000;
const APPLY_RETRIES = 4;
/** Só palavras isoladas: "preciso parar o curso" não é pedido de parar de receber mensagens. */
const OPT_OUT = /^\s*(sair|parar|stop|cancelar mensagens|descadastrar)\s*[.!]*\s*$/i;
/** Categoria inicial: a equipe reclassifica na triagem. */
const INBOUND_CATEGORY = 'asa_service';
const DAY_MS = 86_400_000;

export interface IngestResult {
  received: number;
  duplicates: number;
  failed: number;
}

export class WebhookRejectedError extends Error {
  constructor(readonly status: 400 | 401 | 404, code: string) {
    super(code);
    this.name = 'WebhookRejectedError';
  }
}

/** Evento guardado na inbox (cifrado) até o processamento terminar: data vira texto no JSON. */
type StoredEvent = Omit<Extract<CanonicalWhatsAppEvent, { kind: 'message' }>, 'timestamp'> & { timestamp: string };
type StoredAnyEvent = StoredEvent | (Omit<Exclude<CanonicalWhatsAppEvent, { kind: 'message' }>, 'timestamp'> & { timestamp: string });

const context = (channel: ChannelRecord): ProviderChannelContext => ({ channelId: channel.id, externalSessionId: channel.connection.externalSessionId });

/**
 * Entrada de eventos do provedor. Ordem: autentica → grava na inbox (deduplica) → processa. Se o processamento falhar,
 * o evento fica na inbox e é refeito por `reprocessPending`; o provedor recebe 200 porque o evento já está seguro aqui.
 * Mensagem recebida é dado não confiável: nunca vira comando, e nome/número não identificam ninguém.
 */
export class WhatsAppIngestService {
  constructor(
    private readonly deps: {
      repo: WhatsAppRepository;
      repos: Repositories;
      feed: SupportFeedRepository;
      core: SupportCore;
      provider: WhatsAppProvider;
      vault: ContactVault;
      links: LinkService;
      mirrorToApp: boolean;
      maxAttachmentBytes: number;
      logger: Logger;
      now: () => Date;
    },
  ) {}

  /** Webhook HTTP. Lança WebhookRejectedError sem revelar o motivo exato ao remetente. */
  async handleWebhook(channelId: string, rawBody: Buffer, headers: Record<string, string | undefined>): Promise<IngestResult> {
    const { repo, provider, now } = this.deps;
    const channel = await repo.findChannel(channelId);
    if (!channel || channel.provider !== provider.providerName) throw new WebhookRejectedError(404, 'unknown_channel');
    if (!(await provider.verifyWebhook({ rawBody, headers }))) throw new WebhookRejectedError(401, 'invalid_signature');
    let events: CanonicalWhatsAppEvent[];
    try {
      events = await provider.normalizeInboundWebhook(JSON.parse(rawBody.toString('utf8')), context(channel));
    } catch (error) {
      if (error instanceof WebhookSchemaError || error instanceof SyntaxError) throw new WebhookRejectedError(400, 'invalid_payload');
      throw error;
    }
    await repo.updateConnection(channel.id, { lastWebhookAt: now() }, now());
    return this.accept(channel, events);
  }

  /** Grava e processa eventos (do webhook ou da reconciliação). */
  async accept(channel: ChannelRecord, events: CanonicalWhatsAppEvent[]): Promise<IngestResult> {
    const { repo, provider, vault, now } = this.deps;
    const result: IngestResult = { received: 0, duplicates: 0, failed: 0 };
    for (const item of events) {
      const inbox = await repo.insertInbox({
        provider: provider.providerName,
        channelId: channel.id,
        providerEventId: item.providerEventId,
        kind: item.kind,
        payloadEncrypted: vault.encrypt(JSON.stringify({ ...item, timestamp: item.timestamp.toISOString() })),
        retryAt: new Date(now().getTime() + INLINE_LEASE_MS),
        now: now(),
      });
      if (!inbox) {
        result.duplicates += 1;
        continue;
      }
      result.received += 1;
      if (!(await this.processRow(inbox, channel, item))) result.failed += 1;
    }
    return result;
  }

  /** Refaz o que ficou pendente (falha no processamento, confirmação que chegou antes da mensagem). */
  async reprocessPending(limit = 50): Promise<number> {
    const { repo, vault, logger, now } = this.deps;
    const rows = await repo.claimRetriableInbox(limit, MAX_PROCESS_ATTEMPTS, now(), REPROCESS_LEASE_MS);
    let processed = 0;
    for (const row of rows) {
      const channel = await repo.findChannel(row.channelId);
      if (!channel || !row.payloadEncrypted) continue;
      let item: CanonicalWhatsAppEvent;
      try {
        const stored = JSON.parse(vault.decrypt(row.payloadEncrypted)) as StoredAnyEvent;
        item = { ...stored, timestamp: new Date(stored.timestamp) } as CanonicalWhatsAppEvent;
      } catch {
        // linha ilegível (chave trocada) não pode travar as que vêm depois dela
        logger.error({ channel_id: channel.id, inbox_id: row.id }, 'whatsapp inbox row could not be decrypted');
        await repo.failInbox(row.id, 'undecryptable', true, this.nextAttempt(row));
        continue;
      }
      if (await this.processRow(row, channel, item)) processed += 1;
    }
    return processed;
  }

  /** Busca no provedor o que pode ter sido perdido, sem nunca importar o histórico anterior ao canal. */
  async reconcile(): Promise<{ channels: number; events: number; failed: number }> {
    const { repo, provider, logger, now } = this.deps;
    if (!provider.reconcile) return { channels: 0, events: 0, failed: 0 };
    const channels = (await repo.listChannels()).filter((channel) => channel.state === 'enabled' && channel.provider === provider.providerName && channel.connection.status === 'CONNECTED');
    let total = 0;
    let failed = 0;
    for (const channel of channels) {
      const since = new Date(Math.max(channel.createdAt.getTime(), now().getTime() - 3 * DAY_MS));
      try {
        const events = await provider.reconcile(context(channel), since, { maxChats: 25 });
        const result = await this.accept(channel, events);
        total += result.received;
        failed += result.failed;
      } catch (error) {
        failed += 1;
        logger.warn({ channel_id: channel.id, error_type: error instanceof Error ? error.message : typeof error }, 'whatsapp reconcile failed');
      }
    }
    return { channels: channels.length, events: total, failed };
  }

  /** Espera crescente entre reprocessamentos: uma falha passageira não gasta todas as tentativas em segundos. */
  private nextAttempt(row: InboxRecord): Date {
    return new Date(this.deps.now().getTime() + nextAttemptDelayMs(row.attemptCount + 1));
  }

  private async processRow(row: InboxRecord, channel: ChannelRecord, item: CanonicalWhatsAppEvent): Promise<boolean> {
    const { repo, logger, now } = this.deps;
    return runWithCorrelation(`corr-wa-${row.id}`, async () => {
      try {
        const outcome = await this.process(channel, item);
        if (outcome === 'retry') {
          // o gateway também avisa de mensagens digitadas no aparelho, que nunca terão correspondente aqui
          if (row.attemptCount + 1 >= UNMATCHED_DELIVERY_ATTEMPTS) {
            await repo.finishInbox(row.id, 'ignored', now());
            return true;
          }
          await repo.failInbox(row.id, 'waiting_for_message', true, this.nextAttempt(row));
          return false;
        }
        await repo.finishInbox(row.id, outcome, now());
        return true;
      } catch (error) {
        // nunca loga o corpo do evento: pode ter telefone e conteúdo
        const code = error instanceof Error ? error.name : 'unknown_error';
        logger.error({ channel_id: channel.id, inbox_id: row.id, kind: item.kind, error_type: code }, 'whatsapp event processing failed');
        await repo.failInbox(row.id, code.slice(0, 60), true, this.nextAttempt(row));
        return false;
      }
    });
  }

  private async process(channel: ChannelRecord, item: CanonicalWhatsAppEvent): Promise<'processed' | 'ignored' | 'retry'> {
    if (item.kind === 'message') return this.processMessage(channel, item);
    if (item.kind === 'delivery') return this.processDelivery(channel, item);
    await this.processConnection(channel, item);
    return 'processed';
  }

  private async processConnection(channel: ChannelRecord, item: Extract<CanonicalWhatsAppEvent, { kind: 'connection' }>): Promise<void> {
    const { repo, feed, now } = this.deps;
    const at = now();
    await repo.updateConnection(channel.id, {
      status: item.status,
      ...(item.maskedNumber ? { maskedNumber: item.maskedNumber } : {}),
      lastErrorCode: item.errorCode,
      healthCheckedAt: at,
      ...(item.status === 'CONNECTED' ? { desiredConnected: true, lastConnectedAt: at, consecutiveFailures: 0, circuitOpenUntil: null } : {}),
      ...(item.status === 'DISCONNECTED' ? { desiredConnected: false, lastDisconnectedAt: at } : {}),
    }, at);
    await feed.appendChannelEvent({ type: 'support.channel.connection_updated', audience: 'STAFF_ONLY', actorType: 'system', actorUserId: null, data: { channelId: channel.id, status: item.status }, now: at });
  }

  private async processDelivery(channel: ChannelRecord, item: Extract<CanonicalWhatsAppEvent, { kind: 'delivery' }>): Promise<'processed' | 'retry'> {
    const { repo, now } = this.deps;
    const messageId = await repo.findMessageIdByExternal(channel.id, item.externalMessageId);
    // a confirmação pode chegar antes de o envio gravar o id externo: fica na inbox e é refeita
    if (!messageId) return 'retry';
    await repo.updateDelivery({ messageId, state: item.state, errorCode: item.errorCode, now: now() });
    return 'processed';
  }

  private async processMessage(channel: ChannelRecord, item: Extract<CanonicalWhatsAppEvent, { kind: 'message' }>): Promise<'processed' | 'ignored'> {
    const { repo, repos, vault, links, now } = this.deps;
    const at = now();
    const fingerprint = vault.fingerprint(item.from.value);
    // código de vinculação: prova o controle do número e não abre chamado
    if (item.text && (await links.tryProve(item.text, item.from, fingerprint))) return 'ignored';

    const conversation = await repo.upsertConversation({ channelId: channel.id, fingerprint, encrypted: vault.encrypt(item.from.value), masked: item.from.masked, displayName: item.displayName, now: at });
    // Reprocessamento: a mensagem pode já estar gravada, com os passos seguintes pendentes. Eles são idempotentes e sempre rodam.
    const existing = await repo.findMessageIdByExternal(channel.id, item.externalMessageId);
    const stored = existing ? await repo.findMessage(existing) : null;
    let delivered: { ticketId: string; messageId: string; senderName: string; studentVisible: boolean };
    if (stored) {
      delivered = { ticketId: stored.ticketId, messageId: stored.id, senderName: stored.senderName, studentVisible: stored.studentVisible };
    } else {
      const student = conversation.studentId ? await repos.students.findById(conversation.studentId) : null;
      const user = student ? await repos.users.findById(student.userId) : null;
      const contactName = item.displayName ? `${item.displayName} (não verificado)` : 'Contato do WhatsApp';
      const messageId = randomUUID();
      // A identidade vem do dono do CHAMADO, não da conversa: quem escreve em um chamado sem dono continua contato.
      const messageFor = (ownerId: string | null): NewSupportMessage => {
        const known = ownerId !== null && ownerId === conversation.studentId;
        return {
          id: messageId,
          senderType: known ? 'student' : 'contact',
          senderUserId: null,
          senderName: known ? (user?.fullName ?? 'Estudante') : contactName,
          content: buildContent(item),
          clientMessageId: null,
          transportFields: {
            transport: 'whatsapp',
            channelId: channel.id,
            externalMessageId: item.externalMessageId,
            deliveryState: 'not_applicable',
            providerTimestamp: item.timestamp,
            contentKind: item.contentKind,
            replyToExternalId: item.replyToExternalId,
            // espelhar exige autorização da instituição (configuração) e vínculo verificado com o dono do chamado
            studentVisible: this.deps.mirrorToApp && known,
          },
        };
      };
      const { ticket, message } = await this.appendToTicket(channel, conversation, messageFor, at);
      delivered = { ticketId: ticket.id, messageId, senderName: message.senderName, studentVisible: message.transportFields?.studentVisible === true };
    }
    await repo.touchConversation(conversation.id, { lastInboundAt: item.timestamp, lastMessageAt: item.timestamp, ...this.optOutChange(conversation, item) });
    if (item.media) await this.importMedia(channel, delivered, item);
    return 'processed';
  }

  /**
   * Pedido para parar vale pela data da mensagem, não pela ordem de chegada: uma mensagem antiga, atrasada ou vinda da
   * reconciliação não desfaz o pedido. Só quem escreve depois dele retoma a conversa.
   */
  private optOutChange(conversation: ConversationRecord, item: Extract<CanonicalWhatsAppEvent, { kind: 'message' }>): { optedOutAt?: Date | null } {
    const current = conversation.optedOutAt;
    if (item.text && OPT_OUT.test(item.text)) return !current || item.timestamp > current ? { optedOutAt: item.timestamp } : {};
    return current && item.timestamp > current ? { optedOutAt: null } : {};
  }

  /**
   * Regra explícita: conversa com chamado aberto → entra nele; resolvido há menos que a janela de reabertura → reabre;
   * caso contrário → chamado novo. Webhooks concorrentes não abrem dois chamados (índice único por conversa).
   */
  private async appendToTicket(channel: ChannelRecord, conversation: ConversationRecord, messageFor: (ownerId: string | null) => NewSupportMessage, at: Date): Promise<{ ticket: SupportTicketRecord; message: NewSupportMessage }> {
    const { repo, repos } = this.deps;
    for (let attempt = 0; attempt < APPLY_RETRIES; attempt += 1) {
      const openId = await repo.findOpenTicketId(conversation.id);
      const latestId = openId ?? (await repo.findLatestTicketId(conversation.id));
      let latest = latestId ? await repos.support.findTicket(latestId) : null;
      // Revogar o vínculo já solta o chamado; isto cobre qualquer outro caminho: um número nunca escreve no chamado de outra pessoa.
      if (latest?.studentId && latest.studentId !== conversation.studentId) {
        await repo.detachTicket(latest.id, at);
        latest = null;
        continue;
      }
      try {
        if (latest && isActiveStatus(latest.status)) {
          const message = messageFor(latest.studentId);
          return { ticket: await this.appendMessage(latest, message, at), message };
        }
        if (latest?.status === 'resolved' && latest.resolvedAt && at.getTime() - latest.resolvedAt.getTime() <= SUPPORT_LIMITS.reopenWindowDays * DAY_MS) {
          const message = messageFor(latest.studentId);
          return { ticket: await this.reopenWith(latest, message, at), message };
        }
        const message = messageFor(conversation.studentId);
        const created = await this.createTicket(channel, conversation, message, at);
        if (created) return { ticket: created, message };
      } catch (error) {
        if (!(error instanceof ConflictError && (error.reason === 'ticket_changed' || error.reason === 'conversation_has_open_ticket'))) throw error;
      }
      // outro evento do mesmo chamado venceu a corrida: relê e tenta de novo
    }
    // o evento continua na inbox e é refeito por reprocessPending
    throw new ConflictError('O chamado está mudando muito rápido.', 'ticket_changed');
  }

  /** Quem aparece no histórico: o estudante, só quando ele é o dono do chamado; senão, "WhatsApp". */
  private actorOf(message: NewSupportMessage): { actorType: 'student' | 'system'; actorName: string } {
    return message.senderType === 'student' ? { actorType: 'student', actorName: message.senderName } : { actorType: 'system', actorName: 'WhatsApp' };
  }

  private inboundEvents(message: NewSupportMessage): NewSupportEvent {
    const visible = message.transportFields?.studentVisible === true;
    return event({ type: 'message_sent', visibility: visible ? 'public' : 'internal', title: 'Mensagem recebida pelo WhatsApp', ...this.actorOf(message) });
  }

  private async appendMessage(ticket: SupportTicketRecord, message: NewSupportMessage, at: Date): Promise<SupportTicketRecord> {
    const events: NewSupportEvent[] = [this.inboundEvents(message)];
    let patch = {};
    if (ticket.status === 'waiting_student') {
      // mesma regra do app: a resposta destrava o atendimento e o prazo volta a correr
      patch = { status: 'in_analysis' as const, pendingAction: null, sla: resumeSla(ticket.sla, at) };
      events.push(event({ type: 'student_response_received', title: 'Resposta recebida pelo WhatsApp', description: 'O atendimento continua a partir da resposta.', ...this.actorOf(message), fromStatus: 'waiting_student', toStatus: 'in_analysis' }));
    }
    return this.deps.core.apply({ ticketId: ticket.id, expectedVersion: ticket.version, patch, events, messages: [message], attachments: [], notifications: [], now: at });
  }

  private async reopenWith(ticket: SupportTicketRecord, message: NewSupportMessage, at: Date): Promise<SupportTicketRecord> {
    const { core } = this.deps;
    return core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { status: 'reopened', reopenedCount: ticket.reopenedCount + 1, sla: restartSla(ticket.sla, at, core.config.timeZone) },
      events: [
        this.inboundEvents(message),
        event({ type: 'ticket_reopened', title: 'Chamado reaberto por mensagem no WhatsApp', ...this.actorOf(message), fromStatus: 'resolved', toStatus: 'reopened' }),
      ],
      messages: [message],
      attachments: [],
      notifications: ticket.studentId ? [{ kind: 'status_changed', title: 'Chamado reaberto', body: 'Sua mensagem no WhatsApp reabriu este atendimento.' }] : [],
      now: at,
    });
  }

  private async createTicket(channel: ChannelRecord, conversation: ConversationRecord, message: NewSupportMessage, at: Date): Promise<SupportTicketRecord | null> {
    const { repos, core } = this.deps;
    const category = findCategory(INBOUND_CATEGORY);
    const fallbackDays = category?.slaBusinessDays ?? 5;
    const days = core.hooks.resolutionDays ? await core.hooks.resolutionDays(INBOUND_CATEGORY, fallbackDays) : fallbackDays;
    const firstResponseHours = core.hooks.firstResponseHours ? await core.hooks.firstResponseHours(INBOUND_CATEGORY) : 24;
    const subject = 'Atendimento pelo WhatsApp';
    const result = await repos.support.createTicket({
      id: `ticket-${randomUUID()}`,
      studentId: conversation.studentId,
      channel: 'whatsapp',
      conversationId: conversation.id,
      clientRequestId: `whatsapp:${message.id}`,
      categoryId: INBOUND_CATEGORY,
      subcategoryId: null,
      subject,
      // a mensagem fica nas mensagens: a descrição não repete conteúdo que pode não estar autorizado no app
      description: 'Solicitação recebida pelo WhatsApp institucional.',
      searchText: normalizeSearch([subject, category?.label ?? '', conversation.contactMasked].join(' ')),
      status: 'received',
      priority: category?.defaultPriority ?? 'normal',
      assignedTeam: channel.team || TRIAGE_TEAM,
      sla: startSla(days, at, core.config.timeZone),
      firstResponseDueAt: new Date(at.getTime() + firstResponseHours * 3_600_000),
      events: [
        event({ type: 'ticket_created', title: 'Chamado aberto pelo WhatsApp', ...this.actorOf(message), toStatus: 'received', details: [{ label: 'Origem', value: 'WhatsApp' }] }),
        this.inboundEvents(message),
      ],
      messages: [message],
      attachments: null,
      notifications: conversation.studentId ? [{ kind: 'ticket_received', title: 'Chamado recebido', body: 'Sua mensagem no WhatsApp virou um atendimento. Você pode acompanhar por aqui.' }] : [],
      now: at,
    });
    if (!result.created) return null;
    if (conversation.studentId) core.deliverPush(result.ticket, [{ kind: 'ticket_received', title: 'Chamado recebido', body: 'Acompanhe o atendimento pelo app.' }]);
    if (core.hooks.onTicketCreated) await core.hooks.onTicketCreated(result.ticket);
    return result.ticket;
  }

  /**
   * Importa a mídia para o armazenamento do ASA conforme a mesma lista de tipos dos anexos. O tipo é conferido pelo
   * conteúdo (o provedor não é confiável para isso). Erro aqui mantém o evento na inbox para nova tentativa; a mensagem
   * já está gravada, com aviso, e o id do arquivo é derivado do evento: refazer não duplica.
   */
  private async importMedia(channel: ChannelRecord, delivered: { ticketId: string; messageId: string; senderName: string; studentVisible: boolean }, item: Extract<CanonicalWhatsAppEvent, { kind: 'message' }>): Promise<void> {
    const { provider, repo, logger, now, maxAttachmentBytes } = this.deps;
    if (!provider.fetchMedia || !item.media) return;
    const media = await provider.fetchMedia(context(channel), item.media, maxAttachmentBytes);
    if (!media) return;
    const mimeType = sniffAllowedType(media.content, media.fileName);
    if (!mimeType) {
      logger.info({ channel_id: channel.id, kind: item.contentKind }, 'whatsapp media not imported: type not allowed');
      return;
    }
    await repo.insertInboundAttachment({
      id: uuidFrom(`${channel.id}:${item.externalMessageId}`),
      ticketId: delivered.ticketId,
      messageId: delivered.messageId,
      fileName: sanitizeFileName(media.fileName ?? `arquivo-whatsapp.${EXTENSIONS[mimeType] ?? 'bin'}`),
      mimeType,
      sizeBytes: media.content.length,
      sha256: createHash('sha256').update(media.content).digest('hex'),
      content: media.content,
      providerMediaRef: item.media.ref,
      uploaderName: delivered.senderName,
      studentVisible: delivered.studentVisible,
      now: now(),
    });
  }
}

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Tipo permitido pelo conteúdo do arquivo, ignorando o que o remetente ou o provedor declararam. */
export function sniffAllowedType(content: Buffer, fileName: string | null): string | null {
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const) {
    if (contentMatchesType(mime, content)) return mime;
  }
  // ZIP só é aceito como .docx: outro ZIP pode esconder qualquer coisa
  const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (fileName?.toLowerCase().endsWith('.docx') && contentMatchesType(docx, content) && SUPPORT_LIMITS.allowedMimeTypes.includes(docx)) return docx;
  return null;
}

function uuidFrom(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function buildContent(item: Extract<CanonicalWhatsAppEvent, { kind: 'message' }>): string {
  const text = item.text?.trim();
  if (!text) return NON_TEXT_PLACEHOLDER[item.contentKind] || NON_TEXT_PLACEHOLDER.unsupported;
  return text.length > MAX_INBOUND_LENGTH ? `${text.slice(0, MAX_INBOUND_LENGTH - TRUNCATED_NOTICE.length)}${TRUNCATED_NOTICE}` : text;
}
