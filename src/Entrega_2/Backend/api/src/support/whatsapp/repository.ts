import type { DbClient, DbPool } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import type {
  SupportConnectionStatus,
  SupportContactVerificationStatus,
  SupportInboxCounts,
  SupportMessageDeliveryState,
  SupportProviderName,
  SupportSavedReply,
  SupportWhatsAppMetrics,
} from '../../contracts/mobileApi.v1.js';
import { currentCorrelationId } from '../realtime/correlation.js';
import type { SupportAttachmentRecord } from '../types.js';
import { canAdvanceDelivery, canForceDelivery } from './delivery.js';

export interface ConnectionRecord {
  status: SupportConnectionStatus;
  /** a administração pediu a conexão; sem isso, ler o estado no provedor não religa o canal */
  desiredConnected: boolean;
  externalSessionId: string | null;
  maskedNumber: string | null;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastErrorCode: string | null;
  healthCheckedAt: Date | null;
  lastWebhookAt: Date | null;
  consecutiveFailures: number;
  circuitOpenUntil: Date | null;
  fakeNextSend: 'fail' | 'reject' | 'timeout' | null;
}

export interface ChannelRecord {
  id: string;
  name: string;
  provider: SupportProviderName;
  state: 'enabled' | 'paused' | 'disabled';
  team: string;
  publicNumber: string | null;
  authorizationReference: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  connection: ConnectionRecord;
}

export interface ConversationRecord {
  id: string;
  channelId: string;
  contactFingerprint: string;
  contactEncrypted: string;
  contactMasked: string;
  contactDisplayName: string | null;
  studentId: string | null;
  contactLinkId: string | null;
  linkedAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastMessageAt: Date | null;
  optedOutAt: Date | null;
}

export interface ContactLinkRecord {
  id: string;
  studentId: string;
  contactFingerprint: string;
  contactMasked: string;
  verifiedAt: Date;
  consentRecordId: string;
  revokedAt: Date | null;
}

export interface VerificationRecord {
  id: string;
  studentId: string;
  channelId: string;
  status: SupportContactVerificationStatus;
  consentVersion: string;
  consentSource: 'app' | 'web';
  contactFingerprint: string | null;
  contactEncrypted: string | null;
  contactMasked: string | null;
  expiresAt: Date;
  provenAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

export interface InboxRecord {
  id: string;
  provider: string;
  channelId: string;
  providerEventId: string;
  kind: 'message' | 'delivery' | 'connection';
  status: 'received' | 'processed' | 'ignored' | 'failed';
  payloadEncrypted: string | null;
  attemptCount: number;
}

export interface OutboxRecord {
  id: string;
  ticketId: string;
  messageId: string;
  channelId: string;
  dedupeKey: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'unknown';
  attemptCount: number;
}

export interface OutboundMessageRow {
  id: string;
  ticketId: string;
  content: string;
  replyToExternalId: string | null;
  deliveryState: SupportMessageDeliveryState;
  senderType: 'student' | 'agent' | 'contact';
  senderName: string;
  transport: 'in_app' | 'whatsapp';
  studentVisible: boolean;
  channelId: string | null;
  externalMessageId: string | null;
}

export interface OutboxStats {
  pending: number;
  processing: number;
  failed: number;
  unknown: number;
  oldestPendingAt: Date | null;
}

export interface InboxStats {
  pending: number;
  failed: number;
  lastReceivedAt: Date | null;
}

/** Só PostgreSQL (como admin/analytics): depende de transações, `skip locked` e índices parciais. */
export interface WhatsAppRepository {
  listChannels(): Promise<ChannelRecord[]>;
  findChannel(id: string): Promise<ChannelRecord | null>;
  createChannel(input: { name: string; provider: SupportProviderName; team: string; publicNumber: string | null; authorizationReference: string | null; isDemo: boolean; createdBy: string; now: Date }): Promise<ChannelRecord>;
  updateChannel(id: string, patch: Partial<Pick<ChannelRecord, 'name' | 'team' | 'state' | 'publicNumber' | 'authorizationReference'>>, now: Date): Promise<ChannelRecord | null>;
  updateConnection(channelId: string, patch: Partial<Omit<ConnectionRecord, 'consecutiveFailures'>> & { consecutiveFailures?: number }, now: Date): Promise<void>;

  upsertConversation(input: { channelId: string; fingerprint: string; encrypted: string; masked: string; displayName: string | null; now: Date }): Promise<ConversationRecord>;
  findConversation(id: string): Promise<ConversationRecord | null>;
  touchConversation(id: string, patch: { lastInboundAt?: Date; lastOutboundAt?: Date; lastMessageAt?: Date; optedOutAt?: Date | null }): Promise<void>;
  findOpenTicketId(conversationId: string): Promise<string | null>;
  findLatestTicketId(conversationId: string): Promise<string | null>;
  countUnidentifiedTickets(fingerprint: string): Promise<number>;
  listUnidentifiedTicketIds(fingerprint: string): Promise<string[]>;

  findActiveLink(fingerprint: string): Promise<ContactLinkRecord | null>;
  listActiveLinks(studentId: string): Promise<ContactLinkRecord[]>;
  /**
   * Consentimento + vínculo + conversas do contato, na mesma transação, com o pedido travado: confirmar duas vezes não
   * vira conflito. `not_ready` = o pedido não está mais à espera; `conflict` = o contato já é de outra conta.
   */
  createLink(input: { studentId: string; fingerprint: string; encrypted: string; masked: string; verificationId: string; consentVersion: string; consentSource: 'app' | 'web'; now: Date }): Promise<ContactLinkRecord | 'not_ready' | 'conflict'>;
  /**
   * Revoga vínculo e consentimento. As conversas voltam a ser "não identificadas", e os chamados do estudante se soltam
   * da conversa: continuam dele, mas o número deixa de escrever neles e de receber respostas sobre eles.
   */
  revokeLink(linkId: string, studentId: string | null, now: Date): Promise<ContactLinkRecord | null>;
  /** Defesa em profundidade: solta um chamado cujo dono não é o da conversa. */
  detachTicket(ticketId: string, now: Date): Promise<void>;
  /** Revisão humana: revoga o vínculo anterior e devolve o pedido para confirmação, com prazo novo, em uma transação. */
  transferReview(id: string, provenUntil: Date, now: Date): Promise<boolean>;

  createVerification(input: { studentId: string; channelId: string; codeHash: string; consentVersion: string; consentSource: 'app' | 'web'; expiresAt: Date; now: Date }): Promise<VerificationRecord>;
  countRecentVerifications(studentId: string, since: Date): Promise<number>;
  findVerification(id: string, studentId: string): Promise<VerificationRecord | null>;
  latestOpenVerification(studentId: string, now: Date): Promise<VerificationRecord | null>;
  /** Consome o código uma única vez (corrida entre webhooks repetidos: só um vence). */
  proveVerification(input: { codeHash: string; fingerprint: string; encrypted: string; masked: string; provenUntil: Date; now: Date }): Promise<VerificationRecord | null>;
  setVerificationStatus(id: string, status: SupportContactVerificationStatus, now: Date): Promise<void>;
  expireVerifications(now: Date): Promise<number>;
  listReviews(limit: number): Promise<VerificationRecord[]>;
  findReview(id: string): Promise<VerificationRecord | null>;

  /** `retryAt`: até lá, a linha é de quem acabou de gravar (o processamento em linha); só depois vira reprocessável. */
  insertInbox(input: { provider: string; channelId: string; providerEventId: string; kind: InboxRecord['kind']; payloadEncrypted: string; retryAt: Date; now: Date }): Promise<InboxRecord | null>;
  finishInbox(id: string, status: 'processed' | 'ignored', now: Date): Promise<void>;
  failInbox(id: string, errorCode: string, keepPayload: boolean, nextAttemptAt: Date): Promise<void>;
  /** Reserva linhas para reprocessar (`skip locked` + concessão): duas instâncias nunca pegam a mesma. */
  claimRetriableInbox(limit: number, maxAttempts: number, now: Date, leaseMs: number): Promise<InboxRecord[]>;
  /** Devolve à fila o que esgotou as tentativas (ação da administração). */
  replayFailedInbox(now: Date): Promise<number>;
  purgeFailedInbox(before: Date): Promise<number>;
  inboxStats(): Promise<InboxStats>;

  /** Marca como `unknown` envios interrompidos: nunca reenvia às cegas. Devolve as linhas afetadas. */
  expireStuckOutbox(now: Date): Promise<OutboxRecord[]>;
  claimOutbox(limit: number, now: Date, lockMs: number): Promise<OutboxRecord[]>;
  finishOutbox(id: string, status: 'sent' | 'failed' | 'unknown', errorCode: string | null, now: Date): Promise<void>;
  rescheduleOutbox(id: string, nextAttemptAt: Date, errorCode: string, options: { countAttempt: boolean }, now: Date): Promise<void>;
  /**
   * Nova tentativa pedida pela equipe, em uma transação: volta a mensagem para a fila, esquece o id externo da tentativa
   * anterior e cria a linha com chave nova. Devolve false se a mensagem não está mais em falha ou desconhecida.
   */
  requeueForRetry(input: { ticketId: string; messageId: string; channelId: string; now: Date }): Promise<boolean>;
  outboxStats(): Promise<OutboxStats>;

  findMessage(id: string): Promise<OutboundMessageRow | null>;
  /** Mensagem pelo id externo, no canal. */
  findMessageIdByExternal(channelId: string, externalMessageId: string): Promise<string | null>;
  latestOutboundWithExternalId(channelId: string): Promise<{ id: string; externalMessageId: string } | null>;
  /** Aplica a regra monotônica e registra o evento; devolve false se o estado não mudou. */
  updateDelivery(input: { messageId: string; state: SupportMessageDeliveryState; errorCode: string | null; externalMessageId?: string; now: Date; force?: boolean }): Promise<boolean>;

  insertInboundAttachment(input: { id: string; ticketId: string; messageId: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; content: Buffer; providerMediaRef: string; uploaderName: string; studentVisible: boolean; now: Date }): Promise<SupportAttachmentRecord | null>;

  listTags(): Promise<Array<{ id: string; name: string }>>;
  setTicketTags(ticketId: string, names: string[], userId: string, now: Date): Promise<string[]>;
  tagsForTicket(ticketId: string): Promise<string[]>;
  inboxExtras(ticketIds: string[]): Promise<Map<string, { contactLabel: string | null; tags: string[]; lastMessagePreview: string | null }>>;
  inboxCounts(userId: string, excludeDemo: boolean): Promise<SupportInboxCounts>;
  metrics(from: Date, to: Date, excludeDemo: boolean): Promise<Omit<SupportWhatsAppMetrics, 'from' | 'to'>>;

  listSavedReplies(options: { includeDrafts: boolean }): Promise<SupportSavedReply[]>;
  createSavedReply(input: { categoryId: string | null; title: string; body: string; createdBy: string; now: Date }): Promise<SupportSavedReply>;
  setSavedReplyStatus(id: string, status: 'approved' | 'archived', actorUserId: string, now: Date): Promise<SupportSavedReply | null>;

  touchPresence(ticketId: string, userId: string, composing: boolean, now: Date): Promise<void>;
  listPresence(ticketId: string, exceptUserId: string, since: Date): Promise<Array<{ userId: string; name: string; composing: boolean; lastSeenAt: Date }>>;
  purgePresence(before: Date): Promise<number>;
  purgeFinishedInbox(before: Date): Promise<number>;
}

const CHANNEL_SELECT = `
  select c.id, c.name, c.provider, c.state, c.team, c.public_number, c.authorization_reference, c.is_demo, c.created_at, c.updated_at,
         p.status, p.desired_connected, p.external_session_id, p.masked_number, p.last_connected_at, p.last_disconnected_at, p.last_error_code,
         p.health_checked_at, p.last_webhook_at, p.consecutive_failures, p.circuit_open_until, p.fake_next_send
    from support_channels c join support_provider_connections p on p.channel_id = c.id`;

interface ChannelRow {
  id: string;
  name: string;
  provider: SupportProviderName;
  state: ChannelRecord['state'];
  team: string;
  public_number: string | null;
  authorization_reference: string | null;
  is_demo: boolean;
  created_at: Date;
  updated_at: Date;
  status: SupportConnectionStatus;
  desired_connected: boolean;
  external_session_id: string | null;
  masked_number: string | null;
  last_connected_at: Date | null;
  last_disconnected_at: Date | null;
  last_error_code: string | null;
  health_checked_at: Date | null;
  last_webhook_at: Date | null;
  consecutive_failures: number;
  circuit_open_until: Date | null;
  fake_next_send: ConnectionRecord['fakeNextSend'];
}

const mapChannel = (row: ChannelRow): ChannelRecord => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  state: row.state,
  team: row.team,
  publicNumber: row.public_number,
  authorizationReference: row.authorization_reference,
  isDemo: row.is_demo,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  connection: {
    status: row.status,
    desiredConnected: row.desired_connected,
    externalSessionId: row.external_session_id,
    maskedNumber: row.masked_number,
    lastConnectedAt: row.last_connected_at,
    lastDisconnectedAt: row.last_disconnected_at,
    lastErrorCode: row.last_error_code,
    healthCheckedAt: row.health_checked_at,
    lastWebhookAt: row.last_webhook_at,
    consecutiveFailures: row.consecutive_failures,
    circuitOpenUntil: row.circuit_open_until,
    fakeNextSend: row.fake_next_send,
  },
});

interface ConversationRow {
  id: string;
  channel_id: string;
  contact_fingerprint: string;
  contact_encrypted: string;
  contact_masked: string;
  contact_display_name: string | null;
  student_id: string | null;
  contact_link_id: string | null;
  linked_at: Date | null;
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  last_message_at: Date | null;
  opted_out_at: Date | null;
}

const mapConversation = (row: ConversationRow): ConversationRecord => ({
  id: row.id,
  channelId: row.channel_id,
  contactFingerprint: row.contact_fingerprint,
  contactEncrypted: row.contact_encrypted,
  contactMasked: row.contact_masked,
  contactDisplayName: row.contact_display_name,
  studentId: row.student_id,
  contactLinkId: row.contact_link_id,
  linkedAt: row.linked_at,
  lastInboundAt: row.last_inbound_at,
  lastOutboundAt: row.last_outbound_at,
  lastMessageAt: row.last_message_at,
  optedOutAt: row.opted_out_at,
});

interface LinkRow {
  id: string;
  student_id: string;
  contact_fingerprint: string;
  contact_masked: string;
  verified_at: Date;
  consent_record_id: string;
  revoked_at: Date | null;
}

const mapLink = (row: LinkRow): ContactLinkRecord => ({
  id: row.id,
  studentId: row.student_id,
  contactFingerprint: row.contact_fingerprint,
  contactMasked: row.contact_masked,
  verifiedAt: row.verified_at,
  consentRecordId: row.consent_record_id,
  revokedAt: row.revoked_at,
});

interface VerificationRow {
  id: string;
  student_id: string;
  channel_id: string;
  status: SupportContactVerificationStatus;
  consent_version: string;
  consent_source: 'app' | 'web';
  contact_fingerprint: string | null;
  contact_encrypted: string | null;
  contact_masked: string | null;
  expires_at: Date;
  proven_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
}

const VERIFICATION_COLUMNS = 'id, student_id, channel_id, status, consent_version, consent_source, contact_fingerprint, contact_encrypted, contact_masked, expires_at, proven_at, confirmed_at, created_at';

const mapVerification = (row: VerificationRow): VerificationRecord => ({
  id: row.id,
  studentId: row.student_id,
  channelId: row.channel_id,
  status: row.status,
  consentVersion: row.consent_version,
  consentSource: row.consent_source,
  contactFingerprint: row.contact_fingerprint,
  contactEncrypted: row.contact_encrypted,
  contactMasked: row.contact_masked,
  expiresAt: row.expires_at,
  provenAt: row.proven_at,
  confirmedAt: row.confirmed_at,
  createdAt: row.created_at,
});

const INBOX_COLUMNS = 'id, provider, channel_id, provider_event_id, kind, status, payload_encrypted, attempt_count';
interface InboxRow {
  id: string;
  provider: string;
  channel_id: string;
  provider_event_id: string;
  kind: InboxRecord['kind'];
  status: InboxRecord['status'];
  payload_encrypted: string | null;
  attempt_count: number;
}
const mapInbox = (row: InboxRow): InboxRecord => ({
  id: row.id,
  provider: row.provider,
  channelId: row.channel_id,
  providerEventId: row.provider_event_id,
  kind: row.kind,
  status: row.status,
  payloadEncrypted: row.payload_encrypted,
  attemptCount: row.attempt_count,
});

const OUTBOX_COLUMNS = 'id, ticket_id, message_id, channel_id, dedupe_key, status, attempt_count';
interface OutboxRow {
  id: string;
  ticket_id: string;
  message_id: string;
  channel_id: string;
  dedupe_key: string;
  status: OutboxRecord['status'];
  attempt_count: number;
}
const mapOutbox = (row: OutboxRow): OutboxRecord => ({ id: row.id, ticketId: row.ticket_id, messageId: row.message_id, channelId: row.channel_id, dedupeKey: row.dedupe_key, status: row.status, attemptCount: row.attempt_count });

interface SavedReplyRow {
  id: string;
  category_id: string | null;
  title: string;
  body: string;
  approval_status: SupportSavedReply['approvalStatus'];
  updated_at: Date;
}
const mapSavedReply = (row: SavedReplyRow): SupportSavedReply => ({ id: row.id, categoryId: row.category_id, title: row.title, body: row.body, approvalStatus: row.approval_status, updatedAt: row.updated_at.toISOString() });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID.test(value);

const CONNECTION_COLUMNS: Record<string, string> = {
  status: 'status',
  desiredConnected: 'desired_connected',
  externalSessionId: 'external_session_id',
  maskedNumber: 'masked_number',
  lastConnectedAt: 'last_connected_at',
  lastDisconnectedAt: 'last_disconnected_at',
  lastErrorCode: 'last_error_code',
  healthCheckedAt: 'health_checked_at',
  lastWebhookAt: 'last_webhook_at',
  consecutiveFailures: 'consecutive_failures',
  circuitOpenUntil: 'circuit_open_until',
  fakeNextSend: 'fake_next_send',
};

/** Solta chamados da conversa (a linha fica registrada para a equipe). `where` decide quais. */
async function detachTickets(client: DbClient, where: { sql: string; params: unknown[] }, description: string, now: Date): Promise<void> {
  const { rows } = await client.query<{ id: string; student_id: string | null; last_sequence: string }>(
    `update support_tickets t set conversation_id = null, last_sequence = t.last_sequence + 1 from support_conversations c
      where t.conversation_id = c.id and ${where.sql} returning t.id, t.student_id, t.last_sequence`,
    where.params,
  );
  for (const row of rows) {
    await client.query(
      `insert into support_ticket_events (ticket_id, type, visibility, title, description, actor_type, actor_name, created_at)
       values ($1, 'internal_note', 'internal', 'WhatsApp desvinculado deste chamado', $2, 'system', 'Sistema', $3)`,
      [row.id, description, now],
    );
    await client.query(
      `insert into support_event_log (ticket_id, sequence, type, audience, student_id, actor_type, correlation_id, data, occurred_at)
       values ($1, $2, 'support.ticket.linked', 'STAFF_ONLY', $3, 'system', $4, $5::jsonb, $6)`,
      [row.id, Number(row.last_sequence), row.student_id, currentCorrelationId(), JSON.stringify({ title: 'WhatsApp desvinculado deste chamado' }), now],
    );
  }
}

async function revokeLinkTx(client: DbClient, linkId: string, studentId: string | null, now: Date): Promise<ContactLinkRecord | null> {
  const { rows } = await client.query<LinkRow>(
    `update support_contact_links set revoked_at = $2 where id = $1 and revoked_at is null and ($3::text is null or student_id = $3) returning *`,
    [linkId, now, studentId],
  );
  const link = rows[0];
  if (!link) return null;
  await client.query('update support_consent_records set revoked_at = $2 where id = $1', [link.consent_record_id, now]);
  // antes de limpar a conversa: o chamado continua do estudante, mas o número não fala mais sobre ele
  await detachTickets(client, { sql: 'c.contact_link_id = $1 and t.student_id = $2', params: [linkId, link.student_id] }, 'O vínculo do número foi revogado. Respostas pelo WhatsApp não saem mais deste chamado; use o chat do app.', now);
  await client.query('update support_conversations set student_id = null, contact_link_id = null, linked_at = null where contact_link_id = $1', [linkId]);
  return mapLink(link);
}

async function bumpSequence(client: DbClient, ticketId: string): Promise<{ sequence: number; studentId: string | null } | null> {
  const { rows } = await client.query<{ last_sequence: string; student_id: string | null }>(
    'update support_tickets set last_sequence = last_sequence + 1 where id = $1 returning last_sequence, student_id',
    [ticketId],
  );
  const row = rows[0];
  return row ? { sequence: Number(row.last_sequence), studentId: row.student_id } : null;
}

export class PgWhatsAppRepository implements WhatsAppRepository {
  constructor(private readonly pool: DbPool) {}

  async listChannels(): Promise<ChannelRecord[]> {
    const { rows } = await this.pool.query<ChannelRow>(`${CHANNEL_SELECT} order by c.created_at`);
    return rows.map(mapChannel);
  }

  async findChannel(id: string): Promise<ChannelRecord | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<ChannelRow>(`${CHANNEL_SELECT} where c.id = $1`, [id]);
    return rows[0] ? mapChannel(rows[0]) : null;
  }

  async createChannel(input: { name: string; provider: SupportProviderName; team: string; publicNumber: string | null; authorizationReference: string | null; isDemo: boolean; createdBy: string; now: Date }): Promise<ChannelRecord> {
    const id = await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into support_channels (name, provider, team, public_number, authorization_reference, is_demo, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8) returning id`,
        [input.name, input.provider, input.team, input.publicNumber, input.authorizationReference, input.isDemo, input.createdBy, input.now],
      );
      await client.query('insert into support_provider_connections (channel_id, updated_at) values ($1, $2)', [rows[0]!.id, input.now]);
      return rows[0]!.id;
    });
    return (await this.findChannel(id))!;
  }

  async updateChannel(id: string, patch: Partial<Pick<ChannelRecord, 'name' | 'team' | 'state' | 'publicNumber' | 'authorizationReference'>>, now: Date): Promise<ChannelRecord | null> {
    if (!isUuid(id)) return null;
    const map: Record<string, string> = { name: 'name', team: 'team', state: 'state', publicNumber: 'public_number', authorizationReference: 'authorization_reference' };
    const params: unknown[] = [id, now];
    const sets = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        params.push(value);
        return `${map[key]} = $${params.length}`;
      });
    await this.pool.query(`update support_channels set ${['updated_at = $2', ...sets].join(', ')} where id = $1`, params);
    return this.findChannel(id);
  }

  async updateConnection(channelId: string, patch: Partial<Omit<ConnectionRecord, 'consecutiveFailures'>> & { consecutiveFailures?: number }, now: Date): Promise<void> {
    const params: unknown[] = [channelId, now];
    const sets = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        params.push(value);
        return `${CONNECTION_COLUMNS[key]} = $${params.length}`;
      });
    await this.pool.query(`update support_provider_connections set ${['updated_at = $2', ...sets].join(', ')} where channel_id = $1`, params);
  }

  async upsertConversation(input: { channelId: string; fingerprint: string; encrypted: string; masked: string; displayName: string | null; now: Date }): Promise<ConversationRecord> {
    // Contato já vinculado: a conversa nasce identificada. O vínculo vem de verificação, nunca do número informado.
    const { rows } = await this.pool.query<ConversationRow>(
      `insert into support_conversations (channel_id, contact_fingerprint, contact_encrypted, contact_masked, contact_display_name, student_id, contact_link_id, linked_at, created_at)
       select $1, $2, $3, $4, $5, l.student_id, l.id, case when l.id is null then null else $6::timestamptz end, $6
         from (select 1) one left join support_contact_links l on l.contact_fingerprint = $2 and l.revoked_at is null
       on conflict (channel_id, contact_fingerprint) do update
         set contact_display_name = coalesce(excluded.contact_display_name, support_conversations.contact_display_name)
       returning *`,
      [input.channelId, input.fingerprint, input.encrypted, input.masked, input.displayName, input.now],
    );
    return mapConversation(rows[0]!);
  }

  async findConversation(id: string): Promise<ConversationRecord | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<ConversationRow>('select * from support_conversations where id = $1', [id]);
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async touchConversation(id: string, patch: { lastInboundAt?: Date; lastOutboundAt?: Date; lastMessageAt?: Date; optedOutAt?: Date | null }): Promise<void> {
    const params: unknown[] = [id];
    const sets: string[] = [];
    // greatest: um webhook atrasado não recua a janela de atendimento
    if (patch.lastInboundAt) {
      params.push(patch.lastInboundAt);
      sets.push(`last_inbound_at = greatest(last_inbound_at, $${params.length})`);
    }
    if (patch.lastOutboundAt) {
      params.push(patch.lastOutboundAt);
      sets.push(`last_outbound_at = greatest(last_outbound_at, $${params.length})`);
    }
    if (patch.lastMessageAt) {
      params.push(patch.lastMessageAt);
      sets.push(`last_message_at = greatest(last_message_at, $${params.length})`);
    }
    if (patch.optedOutAt !== undefined) {
      params.push(patch.optedOutAt);
      sets.push(`opted_out_at = $${params.length}`);
    }
    if (sets.length > 0) await this.pool.query(`update support_conversations set ${sets.join(', ')} where id = $1`, params);
  }

  async findOpenTicketId(conversationId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(`select id from support_tickets where conversation_id = $1 and status not in ('resolved', 'closed', 'cancelled')`, [conversationId]);
    return rows[0]?.id ?? null;
  }

  async findLatestTicketId(conversationId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>('select id from support_tickets where conversation_id = $1 order by created_at desc, id desc limit 1', [conversationId]);
    return rows[0]?.id ?? null;
  }

  async countUnidentifiedTickets(fingerprint: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>(
      'select count(*)::int as total from support_tickets t join support_conversations c on c.id = t.conversation_id where c.contact_fingerprint = $1 and t.student_id is null',
      [fingerprint],
    );
    return rows[0]?.total ?? 0;
  }

  async listUnidentifiedTicketIds(fingerprint: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select t.id from support_tickets t join support_conversations c on c.id = t.conversation_id where c.contact_fingerprint = $1 and t.student_id is null order by t.created_at',
      [fingerprint],
    );
    return rows.map((row) => row.id);
  }

  async findActiveLink(fingerprint: string): Promise<ContactLinkRecord | null> {
    const { rows } = await this.pool.query<LinkRow>('select * from support_contact_links where contact_fingerprint = $1 and revoked_at is null', [fingerprint]);
    return rows[0] ? mapLink(rows[0]) : null;
  }

  async listActiveLinks(studentId: string): Promise<ContactLinkRecord[]> {
    const { rows } = await this.pool.query<LinkRow>('select * from support_contact_links where student_id = $1 and revoked_at is null order by verified_at desc', [studentId]);
    return rows.map(mapLink);
  }

  async createLink(input: { studentId: string; fingerprint: string; encrypted: string; masked: string; verificationId: string; consentVersion: string; consentSource: 'app' | 'web'; now: Date }): Promise<ContactLinkRecord | 'not_ready' | 'conflict'> {
    return withTransaction(this.pool, async (client) => {
      // a trava no pedido serializa confirmações repetidas: a segunda vê que ele já foi usado
      const pending = await client.query<{ status: SupportContactVerificationStatus }>('select status from support_contact_verifications where id = $1 and student_id = $2 for update', [input.verificationId, input.studentId]);
      if (pending.rows[0]?.status !== 'proven') return 'not_ready';
      const active = await client.query<LinkRow>('select * from support_contact_links where contact_fingerprint = $1 and revoked_at is null', [input.fingerprint]);
      const owner = active.rows[0];
      if (owner && owner.student_id !== input.studentId) return 'conflict';
      if (owner) {
        await client.query(`update support_contact_verifications set status = 'confirmed', confirmed_at = $2 where id = $1`, [input.verificationId, input.now]);
        return mapLink(owner);
      }
      const consent = await client.query<{ id: string }>(
        `insert into support_consent_records (student_id, scope, channel, source, version, accepted_at) values ($1, 'whatsapp_support', 'whatsapp', $2, $3, $4) returning id`,
        [input.studentId, input.consentSource, input.consentVersion, input.now],
      );
      const { rows } = await client.query<LinkRow>(
        `insert into support_contact_links (student_id, contact_fingerprint, contact_encrypted, contact_masked, verification_method, verified_at, consent_record_id, created_at)
         values ($1, $2, $3, $4, 'whatsapp_inbound_code', $5, $6, $5)
         on conflict (contact_fingerprint) where revoked_at is null do nothing
         returning *`,
        [input.studentId, input.fingerprint, input.encrypted, input.masked, input.now, consent.rows[0]!.id],
      );
      const link = rows[0];
      if (!link) {
        // outra conta venceu a corrida entre a leitura e a gravação
        await client.query('delete from support_consent_records where id = $1', [consent.rows[0]!.id]);
        return 'conflict';
      }
      await detachTickets(client, { sql: 'c.contact_fingerprint = $1 and t.student_id is not null and t.student_id <> $2', params: [input.fingerprint, input.studentId] }, 'O número passou a ser de outra conta. Respostas pelo WhatsApp não saem mais deste chamado; use o chat do app.', input.now);
      await client.query('update support_conversations set student_id = $1, contact_link_id = $2, linked_at = $3 where contact_fingerprint = $4', [input.studentId, link.id, input.now, input.fingerprint]);
      await client.query(`update support_contact_verifications set status = 'confirmed', confirmed_at = $2 where id = $1`, [input.verificationId, input.now]);
      return mapLink(link);
    });
  }

  async revokeLink(linkId: string, studentId: string | null, now: Date): Promise<ContactLinkRecord | null> {
    if (!isUuid(linkId)) return null;
    return withTransaction(this.pool, (client) => revokeLinkTx(client, linkId, studentId, now));
  }

  async detachTicket(ticketId: string, now: Date): Promise<void> {
    await withTransaction(this.pool, (client) => detachTickets(client, { sql: 't.id = $1', params: [ticketId] }, 'O dono deste chamado não é mais o dono do número. Respostas pelo WhatsApp não saem mais daqui.', now));
  }

  async transferReview(id: string, provenUntil: Date, now: Date): Promise<boolean> {
    if (!isUuid(id)) return false;
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ contact_fingerprint: string | null }>(`select contact_fingerprint from support_contact_verifications where id = $1 and status = 'review_required' for update`, [id]);
      const review = rows[0];
      if (!review) return false;
      if (review.contact_fingerprint) {
        const active = await client.query<{ id: string }>('select id from support_contact_links where contact_fingerprint = $1 and revoked_at is null', [review.contact_fingerprint]);
        if (active.rows[0]) await revokeLinkTx(client, active.rows[0].id, null, now);
      }
      await client.query(`update support_contact_verifications set status = 'proven', proven_at = $2, expires_at = $3 where id = $1`, [id, now, provenUntil]);
      return true;
    });
  }

  async createVerification(input: { studentId: string; channelId: string; codeHash: string; consentVersion: string; consentSource: 'app' | 'web'; expiresAt: Date; now: Date }): Promise<VerificationRecord> {
    return withTransaction(this.pool, async (client) => {
      // um pedido novo invalida os anteriores ainda abertos
      await client.query(`update support_contact_verifications set status = 'cancelled' where student_id = $1 and status in ('pending', 'proven')`, [input.studentId]);
      const { rows } = await client.query<VerificationRow>(
        `insert into support_contact_verifications (student_id, channel_id, code_hash, status, consent_version, consent_source, expires_at, created_at)
         values ($1, $2, $3, 'pending', $4, $5, $6, $7) returning ${VERIFICATION_COLUMNS}`,
        [input.studentId, input.channelId, input.codeHash, input.consentVersion, input.consentSource, input.expiresAt, input.now],
      );
      return mapVerification(rows[0]!);
    });
  }

  async countRecentVerifications(studentId: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>('select count(*)::int as total from support_contact_verifications where student_id = $1 and created_at >= $2', [studentId, since]);
    return rows[0]?.total ?? 0;
  }

  async findVerification(id: string, studentId: string): Promise<VerificationRecord | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<VerificationRow>(`select ${VERIFICATION_COLUMNS} from support_contact_verifications where id = $1 and student_id = $2`, [id, studentId]);
    return rows[0] ? mapVerification(rows[0]) : null;
  }

  async latestOpenVerification(studentId: string, now: Date): Promise<VerificationRecord | null> {
    const { rows } = await this.pool.query<VerificationRow>(
      `select ${VERIFICATION_COLUMNS} from support_contact_verifications
        where student_id = $1 and ((status in ('pending', 'proven') and expires_at > $2) or status = 'review_required')
        order by created_at desc limit 1`,
      [studentId, now],
    );
    return rows[0] ? mapVerification(rows[0]) : null;
  }

  async proveVerification(input: { codeHash: string; fingerprint: string; encrypted: string; masked: string; provenUntil: Date; now: Date }): Promise<VerificationRecord | null> {
    const { rows } = await this.pool.query<VerificationRow>(
      `update support_contact_verifications set status = 'proven', proven_at = $2, expires_at = $6, contact_fingerprint = $3, contact_encrypted = $4, contact_masked = $5
        where code_hash = $1 and status = 'pending' and expires_at > $2 returning ${VERIFICATION_COLUMNS}`,
      [input.codeHash, input.now, input.fingerprint, input.encrypted, input.masked, input.provenUntil],
    );
    if (rows[0]) return mapVerification(rows[0]);
    // reprocessamento do mesmo evento: o código já foi consumido por este contato, e a mensagem continua sendo um código
    const again = await this.pool.query<VerificationRow>(
      `select ${VERIFICATION_COLUMNS} from support_contact_verifications
        where code_hash = $1 and contact_fingerprint = $2 and status in ('proven', 'review_required', 'confirmed') order by created_at desc limit 1`,
      [input.codeHash, input.fingerprint],
    );
    return again.rows[0] ? mapVerification(again.rows[0]) : null;
  }

  async setVerificationStatus(id: string, status: SupportContactVerificationStatus, now: Date): Promise<void> {
    await this.pool.query('update support_contact_verifications set status = $2, confirmed_at = case when $2 = \'confirmed\' then $3 else confirmed_at end where id = $1', [id, status, now]);
  }

  async expireVerifications(now: Date): Promise<number> {
    const result = await this.pool.query(`update support_contact_verifications set status = 'expired' where status in ('pending', 'proven') and expires_at <= $1`, [now]);
    return result.rowCount ?? 0;
  }

  async listReviews(limit: number): Promise<VerificationRecord[]> {
    const { rows } = await this.pool.query<VerificationRow>(`select ${VERIFICATION_COLUMNS} from support_contact_verifications where status = 'review_required' order by created_at limit $1`, [limit]);
    return rows.map(mapVerification);
  }

  async findReview(id: string): Promise<VerificationRecord | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<VerificationRow>(`select ${VERIFICATION_COLUMNS} from support_contact_verifications where id = $1 and status = 'review_required'`, [id]);
    return rows[0] ? mapVerification(rows[0]) : null;
  }

  async insertInbox(input: { provider: string; channelId: string; providerEventId: string; kind: InboxRecord['kind']; payloadEncrypted: string; retryAt: Date; now: Date }): Promise<InboxRecord | null> {
    const { rows } = await this.pool.query<InboxRow>(
      `insert into support_inbox_dedup (provider, channel_id, provider_event_id, kind, payload_encrypted, received_at, next_attempt_at)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (provider, channel_id, provider_event_id) do nothing returning ${INBOX_COLUMNS}`,
      [input.provider, input.channelId, input.providerEventId, input.kind, input.payloadEncrypted, input.now, input.retryAt],
    );
    return rows[0] ? mapInbox(rows[0]) : null;
  }

  async finishInbox(id: string, status: 'processed' | 'ignored', now: Date): Promise<void> {
    // o conteúdo só fica aqui até o processamento terminar
    await this.pool.query('update support_inbox_dedup set status = $2, processed_at = $3, payload_encrypted = null, error_code = null where id = $1', [id, status, now]);
  }

  async failInbox(id: string, errorCode: string, keepPayload: boolean, nextAttemptAt: Date): Promise<void> {
    await this.pool.query(
      `update support_inbox_dedup set status = 'failed', attempt_count = attempt_count + 1, error_code = $2, next_attempt_at = $4,
              payload_encrypted = case when $3 then payload_encrypted else null end
        where id = $1 and status <> 'processed'`,
      [id, errorCode, keepPayload, nextAttemptAt],
    );
  }

  async claimRetriableInbox(limit: number, maxAttempts: number, now: Date, leaseMs: number): Promise<InboxRecord[]> {
    const { rows } = await this.pool.query<InboxRow>(
      `update support_inbox_dedup set next_attempt_at = $4
        where id in (
          select id from support_inbox_dedup
           where status in ('received', 'failed') and payload_encrypted is not null and attempt_count < $2 and next_attempt_at <= $3
           order by next_attempt_at for update skip locked limit $1)
        returning ${INBOX_COLUMNS}`,
      [limit, maxAttempts, now, new Date(now.getTime() + leaseMs)],
    );
    return rows.map(mapInbox);
  }

  async replayFailedInbox(now: Date): Promise<number> {
    const result = await this.pool.query(`update support_inbox_dedup set attempt_count = 0, next_attempt_at = $1 where status = 'failed' and payload_encrypted is not null`, [now]);
    return result.rowCount ?? 0;
  }

  async purgeFailedInbox(before: Date): Promise<number> {
    const result = await this.pool.query(`delete from support_inbox_dedup where status = 'failed' and received_at < $1`, [before]);
    return result.rowCount ?? 0;
  }

  async inboxStats(): Promise<InboxStats> {
    const { rows } = await this.pool.query<{ pending: number; failed: number; last_received_at: Date | null }>(
      `select (count(*) filter (where status = 'received'))::int as pending, (count(*) filter (where status = 'failed'))::int as failed, max(received_at) as last_received_at from support_inbox_dedup`,
    );
    return { pending: rows[0]?.pending ?? 0, failed: rows[0]?.failed ?? 0, lastReceivedAt: rows[0]?.last_received_at ?? null };
  }

  async expireStuckOutbox(now: Date): Promise<OutboxRecord[]> {
    const { rows } = await this.pool.query<OutboxRow>(
      `update support_outbox set status = 'unknown', last_error_code = 'send_interrupted', locked_until = null, updated_at = $1
        where status = 'processing' and locked_until < $1 returning ${OUTBOX_COLUMNS}`,
      [now],
    );
    return rows.map(mapOutbox);
  }

  async claimOutbox(limit: number, now: Date, lockMs: number): Promise<OutboxRecord[]> {
    const { rows } = await this.pool.query<OutboxRow>(
      `update support_outbox set status = 'processing', attempt_count = attempt_count + 1, locked_until = $2, updated_at = $1
        where id in (select id from support_outbox where status = 'pending' and next_attempt_at <= $1 order by next_attempt_at, created_at for update skip locked limit $3)
        returning ${OUTBOX_COLUMNS}`,
      [now, new Date(now.getTime() + lockMs), limit],
    );
    return rows.map(mapOutbox);
  }

  async finishOutbox(id: string, status: 'sent' | 'failed' | 'unknown', errorCode: string | null, now: Date): Promise<void> {
    await this.pool.query(`update support_outbox set status = $2, last_error_code = $3, locked_until = null, updated_at = $4 where id = $1 and status = 'processing'`, [id, status, errorCode, now]);
  }

  async rescheduleOutbox(id: string, nextAttemptAt: Date, errorCode: string, options: { countAttempt: boolean }, now: Date): Promise<void> {
    await this.pool.query(
      `update support_outbox set status = 'pending', next_attempt_at = $2, last_error_code = $3, locked_until = null, updated_at = $4,
              attempt_count = case when $5 then attempt_count else greatest(attempt_count - 1, 0) end where id = $1 and status = 'processing'`,
      [id, nextAttemptAt, errorCode, now, options.countAttempt],
    );
  }

  async requeueForRetry(input: { ticketId: string; messageId: string; channelId: string; now: Date }): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      await client.query('select 1 from support_tickets where id = $1 for update', [input.ticketId]);
      const { rows } = await client.query<{ student_visible: boolean }>(
        `update support_ticket_messages set delivery_state = 'queued', delivery_error_code = null, delivery_updated_at = $2, external_message_id = null
          where id = $1 and delivery_state in ('failed', 'unknown') returning student_visible`,
        [input.messageId, input.now],
      );
      const message = rows[0];
      if (!message) return false;
      const attempts = await client.query<{ total: number }>('select count(*)::int as total from support_outbox where message_id = $1', [input.messageId]);
      await client.query(
        `insert into support_outbox (kind, ticket_id, message_id, channel_id, dedupe_key, next_attempt_at, created_at, updated_at)
         values ('whatsapp.send', $1, $2, $3, $4, $5, $5, $5)`,
        [input.ticketId, input.messageId, input.channelId, `message:${input.messageId}:retry:${attempts.rows[0]!.total}`, input.now],
      );
      const ticket = await bumpSequence(client, input.ticketId);
      if (ticket) {
        await client.query(
          `insert into support_event_log (ticket_id, sequence, type, audience, student_id, actor_type, correlation_id, data, occurred_at)
           values ($1, $2, 'support.message.delivery_updated', $3, $4, 'system', $5, $6::jsonb, $7)`,
          [input.ticketId, ticket.sequence, message.student_visible ? 'STUDENT_VISIBLE' : 'STAFF_ONLY', ticket.studentId, currentCorrelationId(), JSON.stringify({ messageId: input.messageId, state: 'queued', transport: 'whatsapp' }), input.now],
        );
      }
      return true;
    });
  }

  async outboxStats(): Promise<OutboxStats> {
    const { rows } = await this.pool.query<{ pending: number; processing: number; failed: number; unknown: number; oldest: Date | null }>(
      `select (count(*) filter (where status = 'pending'))::int as pending, (count(*) filter (where status = 'processing'))::int as processing,
              (count(*) filter (where status = 'failed'))::int as failed, (count(*) filter (where status = 'unknown'))::int as unknown,
              min(created_at) filter (where status = 'pending') as oldest from support_outbox`,
    );
    const row = rows[0];
    return { pending: row?.pending ?? 0, processing: row?.processing ?? 0, failed: row?.failed ?? 0, unknown: row?.unknown ?? 0, oldestPendingAt: row?.oldest ?? null };
  }

  async findMessage(id: string): Promise<OutboundMessageRow | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<{ id: string; ticket_id: string; content: string; reply_to_external_id: string | null; delivery_state: SupportMessageDeliveryState; sender_type: OutboundMessageRow['senderType']; sender_name: string; transport: OutboundMessageRow['transport']; student_visible: boolean; channel_id: string | null; external_message_id: string | null }>(
      'select id, ticket_id, content, reply_to_external_id, delivery_state, sender_type, sender_name, transport, student_visible, channel_id, external_message_id from support_ticket_messages where id = $1',
      [id],
    );
    const row = rows[0];
    return row ? { id: row.id, ticketId: row.ticket_id, content: row.content, replyToExternalId: row.reply_to_external_id, deliveryState: row.delivery_state, senderType: row.sender_type, senderName: row.sender_name, transport: row.transport, studentVisible: row.student_visible, channelId: row.channel_id, externalMessageId: row.external_message_id } : null;
  }

  async findMessageIdByExternal(channelId: string, externalMessageId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>('select id from support_ticket_messages where channel_id = $1 and external_message_id = $2', [channelId, externalMessageId]);
    return rows[0]?.id ?? null;
  }

  async latestOutboundWithExternalId(channelId: string): Promise<{ id: string; externalMessageId: string } | null> {
    const { rows } = await this.pool.query<{ id: string; external_message_id: string }>(
      `select id, external_message_id from support_ticket_messages where channel_id = $1 and sender_type = 'agent' and external_message_id is not null order by created_at desc, seq desc limit 1`,
      [channelId],
    );
    return rows[0] ? { id: rows[0].id, externalMessageId: rows[0].external_message_id } : null;
  }

  async updateDelivery(input: { messageId: string; state: SupportMessageDeliveryState; errorCode: string | null; externalMessageId?: string; now: Date; force?: boolean }): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const owner = await client.query<{ ticket_id: string }>('select ticket_id from support_ticket_messages where id = $1', [input.messageId]);
      const ticketId = owner.rows[0]?.ticket_id;
      if (!ticketId) return false;
      // trava primeiro o chamado, como as demais alterações: a sequência acompanha a ordem de quem grava
      await client.query('select 1 from support_tickets where id = $1 for update', [ticketId]);
      const { rows } = await client.query<{ delivery_state: SupportMessageDeliveryState; student_visible: boolean; external_message_id: string | null }>(
        'select delivery_state, student_visible, external_message_id from support_ticket_messages where id = $1 for update',
        [input.messageId],
      );
      const message = rows[0];
      if (!message) return false;
      // com id do provedor na mão, a mensagem foi aceita: "desconhecido" seria menos do que já se sabe
      const acceptedAlready = input.state === 'unknown' && message.external_message_id !== null;
      const stateChanges = input.force ? canForceDelivery(message.delivery_state, input.state) && !acceptedAlready : canAdvanceDelivery(message.delivery_state, input.state);
      if (!stateChanges) {
        if (input.externalMessageId) await client.query('update support_ticket_messages set external_message_id = coalesce(external_message_id, $2) where id = $1', [input.messageId, input.externalMessageId]);
        return false;
      }
      await client.query(
        `update support_ticket_messages set delivery_state = $2, delivery_error_code = $3, delivery_updated_at = $4, external_message_id = coalesce($5, external_message_id) where id = $1`,
        [input.messageId, input.state, input.errorCode, input.now, input.externalMessageId ?? null],
      );
      const ticket = await bumpSequence(client, ticketId);
      if (ticket) {
        await client.query(
          `insert into support_event_log (ticket_id, sequence, type, audience, student_id, actor_type, correlation_id, data, occurred_at)
           values ($1, $2, 'support.message.delivery_updated', $3, $4, 'system', $5, $6::jsonb, $7)`,
          // o código de erro não vai no evento: fica na mensagem, visível só para a equipe
          [ticketId, ticket.sequence, message.student_visible ? 'STUDENT_VISIBLE' : 'STAFF_ONLY', ticket.studentId, currentCorrelationId(), JSON.stringify({ messageId: input.messageId, state: input.state, transport: 'whatsapp' }), input.now],
        );
      }
      return true;
    });
  }

  async insertInboundAttachment(input: { id: string; ticketId: string; messageId: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; content: Buffer; providerMediaRef: string; uploaderName: string; studentVisible: boolean; now: Date }): Promise<SupportAttachmentRecord | null> {
    const { rows } = await this.pool.query<{ id: string; created_at: Date }>(
      `insert into support_attachments (id, ticket_id, message_id, uploaded_by_type, uploader_name, file_name, mime_type, size_bytes, sha256, content, created_at, origin, provider_media_ref, student_visible)
       values ($1, $2, $3, 'contact', $4, $5, $6, $7, $8, $9, $10, 'whatsapp', $11, $12) on conflict (id) do nothing returning id, created_at`,
      [input.id, input.ticketId, input.messageId, input.uploaderName, input.fileName, input.mimeType, input.sizeBytes, input.sha256, input.content, input.now, input.providerMediaRef, input.studentVisible],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      ticketId: input.ticketId,
      messageId: input.messageId,
      uploadedByType: 'contact',
      uploadedByUserId: null,
      uploaderName: input.uploaderName,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      createdAt: rows[0].created_at,
      expiresAt: null,
      origin: 'whatsapp',
      studentVisible: input.studentVisible,
      reviewStatus: 'received',
    };
  }

  async listTags(): Promise<Array<{ id: string; name: string }>> {
    const { rows } = await this.pool.query<{ id: string; name: string }>('select id, name from support_tags order by name');
    return rows;
  }

  async setTicketTags(ticketId: string, names: string[], userId: string, now: Date): Promise<string[]> {
    return withTransaction(this.pool, async (client) => {
      for (const name of names) await client.query('insert into support_tags (name, created_by, created_at) values ($1, $2, $3) on conflict (name) do nothing', [name, userId, now]);
      await client.query('delete from support_ticket_tags where ticket_id = $1 and tag_id not in (select id from support_tags where name = any($2::text[]))', [ticketId, names]);
      await client.query(
        `insert into support_ticket_tags (ticket_id, tag_id, added_by, added_at) select $1, id, $3, $4 from support_tags where name = any($2::text[]) on conflict do nothing`,
        [ticketId, names, userId, now],
      );
      const { rows } = await client.query<{ name: string }>('select g.name from support_ticket_tags t join support_tags g on g.id = t.tag_id where t.ticket_id = $1 order by g.name', [ticketId]);
      return rows.map((row) => row.name);
    });
  }

  async tagsForTicket(ticketId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>('select g.name from support_ticket_tags t join support_tags g on g.id = t.tag_id where t.ticket_id = $1 order by g.name', [ticketId]);
    return rows.map((row) => row.name);
  }

  async inboxExtras(ticketIds: string[]): Promise<Map<string, { contactLabel: string | null; tags: string[]; lastMessagePreview: string | null }>> {
    const result = new Map<string, { contactLabel: string | null; tags: string[]; lastMessagePreview: string | null }>();
    if (ticketIds.length === 0) return result;
    const { rows } = await this.pool.query<{ id: string; contact_masked: string | null; tags: string[] | null; preview: string | null }>(
      `select t.id, c.contact_masked,
              (select array_agg(g.name order by g.name) from support_ticket_tags tt join support_tags g on g.id = tt.tag_id where tt.ticket_id = t.id) as tags,
              (select left(m.content, 120) from support_ticket_messages m where m.ticket_id = t.id order by coalesce(m.provider_timestamp, m.created_at) desc, m.seq desc limit 1) as preview
         from support_tickets t left join support_conversations c on c.id = t.conversation_id
        where t.id = any($1::text[])`,
      [ticketIds],
    );
    for (const row of rows) result.set(row.id, { contactLabel: row.contact_masked, tags: row.tags ?? [], lastMessagePreview: row.preview });
    return result;
  }

  async inboxCounts(userId: string, excludeDemo: boolean): Promise<SupportInboxCounts> {
    const { rows } = await this.pool.query<SupportInboxCounts>(
      `with t as (
         select tk.* from support_tickets tk
           left join students s on s.id = tk.student_id
           left join users u on u.id = s.user_id
          where tk.status not in ('resolved', 'closed', 'cancelled') and not ($2::boolean and coalesce(u.is_demo, false))
       )
       select (count(*) filter (where status in ('submitted', 'received', 'triage', 'reopened')))::int as "newTickets",
              (count(*) filter (where assigned_agent_id = $1))::int as "mine",
              (count(*) filter (where status = 'waiting_student'))::int as "waitingStudent",
              (count(*) filter (where student_id is null))::int as "unidentified",
              (count(*) filter (where channel = 'whatsapp'))::int as "whatsapp",
              (count(*) filter (where exists (select 1 from support_ticket_messages m where m.ticket_id = t.id and m.sender_type in ('student', 'contact') and m.read_at is null)))::int as "unread"
         from t`,
      [userId, excludeDemo],
    );
    return rows[0]!;
  }

  async metrics(from: Date, to: Date, excludeDemo: boolean): Promise<Omit<SupportWhatsAppMetrics, 'from' | 'to'>> {
    const { rows } = await this.pool.query<Omit<SupportWhatsAppMetrics, 'from' | 'to'>>(
      `with t as (
         select tk.* from support_tickets tk
           left join students s on s.id = tk.student_id
           left join users u on u.id = s.user_id
          where tk.channel = 'whatsapp' and not ($3::boolean and coalesce(u.is_demo, false))
       ),
       m as (
         select msg.* from support_ticket_messages msg join t on t.id = msg.ticket_id
          where msg.transport = 'whatsapp' and msg.created_at >= $1 and msg.created_at < $2
       ),
       first_reply as (
         select t.id, t.created_at, min(e.created_at) as replied_at
           from t join support_ticket_events e on e.ticket_id = t.id and e.actor_type in ('agent', 'department') and (e.visibility = 'public' or e.type = 'message_received')
          where t.created_at >= $1 and t.created_at < $2 group by t.id, t.created_at
       )
       select (select count(*) from t where created_at >= $1 and created_at < $2)::int as "ticketsOpened",
              (select count(*) from t where resolved_at >= $1 and resolved_at < $2)::int as "ticketsResolved",
              (select count(*) from t where student_id is null and status not in ('resolved', 'closed', 'cancelled'))::int as "unidentifiedOpen",
              (select count(*) from m where sender_type in ('student', 'contact'))::int as "inboundMessages",
              (select count(*) from m where sender_type = 'agent')::int as "outboundMessages",
              (select count(*) from m where delivery_state = 'failed')::int as "deliveryFailures",
              (select count(*) from m where delivery_state = 'unknown')::int as "deliveryUnknown",
              (select percentile_cont(0.5) within group (order by extract(epoch from replied_at - created_at) / 60) from first_reply)::float as "medianFirstResponseMinutes"`,
      [from, to, excludeDemo],
    );
    return rows[0]!;
  }

  async listSavedReplies(options: { includeDrafts: boolean }): Promise<SupportSavedReply[]> {
    const { rows } = await this.pool.query<SavedReplyRow>(
      `select id, category_id, title, body, approval_status, updated_at from support_saved_replies where approval_status = 'approved' or ($1 and approval_status = 'draft') order by title`,
      [options.includeDrafts],
    );
    return rows.map(mapSavedReply);
  }

  async createSavedReply(input: { categoryId: string | null; title: string; body: string; createdBy: string; now: Date }): Promise<SupportSavedReply> {
    const { rows } = await this.pool.query<SavedReplyRow>(
      `insert into support_saved_replies (category_id, title, body, created_by, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)
       returning id, category_id, title, body, approval_status, updated_at`,
      [input.categoryId, input.title, input.body, input.createdBy, input.now],
    );
    return mapSavedReply(rows[0]!);
  }

  async setSavedReplyStatus(id: string, status: 'approved' | 'archived', actorUserId: string, now: Date): Promise<SupportSavedReply | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<SavedReplyRow>(
      `update support_saved_replies set approval_status = $2, updated_at = $4,
              approved_by = case when $2 = 'approved' then $3::uuid else approved_by end,
              approved_at = case when $2 = 'approved' then $4::timestamptz else approved_at end
        where id = $1 returning id, category_id, title, body, approval_status, updated_at`,
      [id, status, actorUserId, now],
    );
    return rows[0] ? mapSavedReply(rows[0]) : null;
  }

  async touchPresence(ticketId: string, userId: string, composing: boolean, now: Date): Promise<void> {
    await this.pool.query(
      `insert into support_ticket_presence (ticket_id, user_id, composing, last_seen_at) values ($1, $2, $3, $4)
       on conflict (ticket_id, user_id) do update set composing = excluded.composing, last_seen_at = excluded.last_seen_at`,
      [ticketId, userId, composing, now],
    );
  }

  async listPresence(ticketId: string, exceptUserId: string, since: Date): Promise<Array<{ userId: string; name: string; composing: boolean; lastSeenAt: Date }>> {
    const { rows } = await this.pool.query<{ user_id: string; full_name: string; composing: boolean; last_seen_at: Date }>(
      `select p.user_id, u.full_name, p.composing, p.last_seen_at from support_ticket_presence p join users u on u.id = p.user_id
        where p.ticket_id = $1 and p.user_id <> $2 and p.last_seen_at >= $3 order by p.last_seen_at desc`,
      [ticketId, exceptUserId, since],
    );
    return rows.map((row) => ({ userId: row.user_id, name: row.full_name, composing: row.composing, lastSeenAt: row.last_seen_at }));
  }

  async purgePresence(before: Date): Promise<number> {
    const result = await this.pool.query('delete from support_ticket_presence where last_seen_at < $1', [before]);
    return result.rowCount ?? 0;
  }

  async purgeFinishedInbox(before: Date): Promise<number> {
    const result = await this.pool.query(`delete from support_inbox_dedup where status in ('processed', 'ignored') and processed_at < $1`, [before]);
    return result.rowCount ?? 0;
  }
}
