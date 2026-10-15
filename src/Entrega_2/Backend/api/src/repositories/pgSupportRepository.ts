import type { DbClient, DbPool } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import { ConflictError, ValidationError } from '../errors/AppError.js';
import type {
  SupportActorType,
  SupportEventVisibility,
  SupportNotificationKind,
  SupportTicketEventType,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../contracts/mobileApi.v1.js';
import type {
  NewSupportEvent,
  NewSupportNotification,
  SupportAttachmentLink,
  SupportAttachmentRecord,
  SupportEventDetailRecord,
  SupportEventRecord,
  SupportMessageRecord,
  SupportNotificationRecord,
  SupportRatingRecord,
  SupportRepository,
  SupportTicketListRow,
  SupportTicketPatch,
  SupportTicketRecord,
} from '../support/types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids que vêm da URL: um valor que não é UUID não chega ao banco (evita erro de sintaxe → 500). */
const isUuid = (value: string) => UUID.test(value);

interface TicketRow {
  id: string;
  protocol: string;
  student_id: string;
  channel: 'app' | 'web';
  client_request_id: string;
  category_id: string;
  subcategory_id: string | null;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_team: string;
  assigned_agent_id: string | null;
  pending_action_title: string | null;
  pending_action_description: string | null;
  pending_action_requested_at: Date | null;
  pending_action_expects_attachment: boolean;
  resolution: string | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  reopened_count: number;
  sla_target_business_days: number;
  sla_started_at: Date;
  sla_due_at: Date;
  sla_paused_at: Date | null;
  sla_resumed_at: Date | null;
  sla_completed_at: Date | null;
  first_response_due_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const TICKET_COLUMNS = `id, protocol, student_id, channel, client_request_id, category_id, subcategory_id, subject, description, status, priority,
  assigned_team, assigned_agent_id, pending_action_title, pending_action_description, pending_action_requested_at,
  pending_action_expects_attachment, resolution, resolved_at, closed_at, cancelled_at, cancel_reason, reopened_count,
  sla_target_business_days, sla_started_at, sla_due_at, sla_paused_at, sla_resumed_at, sla_completed_at, first_response_due_at, version, created_at, updated_at`;

const prefixed = (alias: string) =>
  TICKET_COLUMNS.split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');

const mapTicket = (row: TicketRow): SupportTicketRecord => ({
  id: row.id,
  protocol: row.protocol,
  studentId: row.student_id,
  channel: row.channel,
  clientRequestId: row.client_request_id,
  categoryId: row.category_id,
  subcategoryId: row.subcategory_id,
  subject: row.subject,
  description: row.description,
  status: row.status,
  priority: row.priority,
  assignedTeam: row.assigned_team,
  assignedAgentId: row.assigned_agent_id,
  pendingAction:
    row.pending_action_title && row.pending_action_description && row.pending_action_requested_at
      ? { title: row.pending_action_title, description: row.pending_action_description, requestedAt: row.pending_action_requested_at, expectsAttachment: row.pending_action_expects_attachment }
      : null,
  resolution: row.resolution,
  resolvedAt: row.resolved_at,
  closedAt: row.closed_at,
  cancelledAt: row.cancelled_at,
  cancelReason: row.cancel_reason,
  reopenedCount: row.reopened_count,
  sla: {
    targetBusinessDays: row.sla_target_business_days,
    startedAt: row.sla_started_at,
    dueAt: row.sla_due_at,
    pausedAt: row.sla_paused_at,
    resumedAt: row.sla_resumed_at,
    completedAt: row.sla_completed_at,
  },
  firstResponseDueAt: row.first_response_due_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
});

interface EventRow {
  id: string;
  ticket_id: string;
  type: SupportTicketEventType;
  visibility: SupportEventVisibility;
  title: string;
  description: string | null;
  actor_type: SupportActorType;
  actor_user_id: string | null;
  actor_name: string | null;
  from_status: SupportTicketStatus | null;
  to_status: SupportTicketStatus | null;
  details: SupportEventDetailRecord[] | null;
  created_at: Date;
}

const mapEvent = (row: EventRow): SupportEventRecord => ({
  id: row.id,
  ticketId: row.ticket_id,
  type: row.type,
  visibility: row.visibility,
  title: row.title,
  description: row.description,
  actorType: row.actor_type,
  actorUserId: row.actor_user_id,
  actorName: row.actor_name,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  details: Array.isArray(row.details) ? row.details : [],
  createdAt: row.created_at,
});

interface MessageRow {
  id: string;
  ticket_id: string;
  sender_type: 'student' | 'agent';
  sender_user_id: string | null;
  sender_name: string;
  content: string;
  client_message_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

const MESSAGE_COLUMNS = 'id, ticket_id, sender_type, sender_user_id, sender_name, content, client_message_id, read_at, created_at';

const mapMessage = (row: MessageRow): SupportMessageRecord => ({
  id: row.id,
  ticketId: row.ticket_id,
  senderType: row.sender_type,
  senderUserId: row.sender_user_id,
  senderName: row.sender_name,
  content: row.content,
  clientMessageId: row.client_message_id,
  readAt: row.read_at,
  createdAt: row.created_at,
});

interface AttachmentRow {
  id: string;
  ticket_id: string | null;
  message_id: string | null;
  uploaded_by_type: 'student' | 'agent';
  uploaded_by_user_id: string | null;
  uploader_name: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: Date;
  expires_at: Date | null;
}

const ATTACHMENT_COLUMNS = 'id, ticket_id, message_id, uploaded_by_type, uploaded_by_user_id, uploader_name, file_name, mime_type, size_bytes, sha256, created_at, expires_at';

const mapAttachment = (row: AttachmentRow): SupportAttachmentRecord => ({
  id: row.id,
  ticketId: row.ticket_id,
  messageId: row.message_id,
  uploadedByType: row.uploaded_by_type,
  uploadedByUserId: row.uploaded_by_user_id,
  uploaderName: row.uploader_name,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

interface NotificationRow {
  id: string;
  student_id: string;
  ticket_id: string;
  protocol: string;
  kind: SupportNotificationKind;
  title: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

const mapNotification = (row: NotificationRow): SupportNotificationRecord => ({
  id: row.id,
  studentId: row.student_id,
  ticketId: row.ticket_id,
  protocol: row.protocol,
  kind: row.kind,
  title: row.title,
  body: row.body,
  createdAt: row.created_at,
  readAt: row.read_at,
});

/** Converte o patch do serviço em colunas (sla e pendingAction ocupam várias colunas). */
function patchColumns(patch: SupportTicketPatch): Array<[string, unknown]> {
  const columns: Array<[string, unknown]> = [];
  if (patch.status !== undefined) columns.push(['status', patch.status]);
  if (patch.priority !== undefined) columns.push(['priority', patch.priority]);
  if (patch.assignedTeam !== undefined) columns.push(['assigned_team', patch.assignedTeam]);
  if (patch.assignedAgentId !== undefined) columns.push(['assigned_agent_id', patch.assignedAgentId]);
  if (patch.pendingAction !== undefined) {
    const action = patch.pendingAction;
    columns.push(['pending_action_title', action?.title ?? null]);
    columns.push(['pending_action_description', action?.description ?? null]);
    columns.push(['pending_action_requested_at', action?.requestedAt ?? null]);
    columns.push(['pending_action_expects_attachment', action?.expectsAttachment ?? false]);
  }
  if (patch.resolution !== undefined) columns.push(['resolution', patch.resolution]);
  if (patch.resolvedAt !== undefined) columns.push(['resolved_at', patch.resolvedAt]);
  if (patch.closedAt !== undefined) columns.push(['closed_at', patch.closedAt]);
  if (patch.cancelledAt !== undefined) columns.push(['cancelled_at', patch.cancelledAt]);
  if (patch.cancelReason !== undefined) columns.push(['cancel_reason', patch.cancelReason]);
  if (patch.reopenedCount !== undefined) columns.push(['reopened_count', patch.reopenedCount]);
  if (patch.sla !== undefined) {
    columns.push(['sla_target_business_days', patch.sla.targetBusinessDays]);
    columns.push(['sla_started_at', patch.sla.startedAt]);
    columns.push(['sla_due_at', patch.sla.dueAt]);
    columns.push(['sla_paused_at', patch.sla.pausedAt]);
    columns.push(['sla_resumed_at', patch.sla.resumedAt]);
    columns.push(['sla_completed_at', patch.sla.completedAt]);
  }
  return columns;
}

async function insertEvents(client: DbClient, ticketId: string, events: NewSupportEvent[], now: Date): Promise<void> {
  for (const item of events) {
    await client.query(
      `insert into support_ticket_events (ticket_id, type, visibility, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [ticketId, item.type, item.visibility, item.title, item.description, item.actorType, item.actorUserId, item.actorName, item.fromStatus, item.toStatus, JSON.stringify(item.details), now],
    );
  }
}

async function insertNotifications(client: DbClient, ticketId: string, studentId: string, notifications: NewSupportNotification[], now: Date): Promise<void> {
  for (const item of notifications) {
    await client.query('insert into support_notifications (student_id, ticket_id, kind, title, body, created_at) values ($1, $2, $3, $4, $5, $6)', [studentId, ticketId, item.kind, item.title, item.body, now]);
  }
}

/** Vincula envios pendentes; se algum não puder ser vinculado, a transação inteira é desfeita. */
async function linkAttachments(client: DbClient, ticketId: string, link: SupportAttachmentLink, now: Date): Promise<void> {
  if (link.ids.length === 0) return;
  const result = await client.query(
    `update support_attachments set ticket_id = $1, message_id = $2, expires_at = null
      where id = any($3::uuid[]) and ticket_id is null and uploaded_by_user_id = $4 and expires_at > $5`,
    [ticketId, link.messageId, link.ids, link.ownerUserId, now],
  );
  if (result.rowCount !== link.ids.length) {
    throw new ValidationError('Um dos arquivos expirou ou não está mais disponível. Envie-o novamente.', [{ field: 'attachmentIds', message: 'arquivo indisponível' }], { reason: 'attachment_unavailable' });
  }
}

class PgSupportRepository implements SupportRepository {
  constructor(private readonly pool: DbPool) {}

  async createTicket(input: Parameters<SupportRepository['createTicket']>[0]): Promise<{ ticket: SupportTicketRecord; created: boolean }> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<TicketRow>(
        `insert into support_tickets (id, protocol, student_id, client_request_id, category_id, subcategory_id, subject, description, search_text,
            status, priority, assigned_team, sla_target_business_days, sla_started_at, sla_due_at, created_at, updated_at, channel, first_response_due_at)
         values ($1, 'ASA-' || to_char($15::timestamptz at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('support_ticket_protocol_seq')::text, 5, '0'),
            $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17)
         on conflict (student_id, client_request_id) do nothing
         returning ${TICKET_COLUMNS}`,
        [
          input.id,
          input.studentId,
          input.clientRequestId,
          input.categoryId,
          input.subcategoryId,
          input.subject,
          input.description,
          input.searchText,
          input.status,
          input.priority,
          input.assignedTeam,
          input.sla.targetBusinessDays,
          input.sla.startedAt,
          input.sla.dueAt,
          input.now,
          input.channel,
          input.firstResponseDueAt,
        ],
      );
      const inserted = rows[0];
      if (!inserted) {
        // Corrida de envio duplo: o outro pedido já criou o chamado.
        const existing = await client.query<TicketRow>(`select ${TICKET_COLUMNS} from support_tickets where student_id = $1 and client_request_id = $2`, [input.studentId, input.clientRequestId]);
        return { ticket: mapTicket(existing.rows[0]!), created: false };
      }
      await insertEvents(client, inserted.id, input.events, input.now);
      if (input.attachments) await linkAttachments(client, inserted.id, input.attachments, input.now);
      await insertNotifications(client, inserted.id, input.studentId, input.notifications, input.now);
      return { ticket: mapTicket(inserted), created: true };
    });
  }

  async findTicket(id: string): Promise<SupportTicketRecord | null> {
    const { rows } = await this.pool.query<TicketRow>(`select ${TICKET_COLUMNS} from support_tickets where id = $1`, [id]);
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async findTicketByClientRequest(studentId: string, clientRequestId: string): Promise<SupportTicketRecord | null> {
    const { rows } = await this.pool.query<TicketRow>(`select ${TICKET_COLUMNS} from support_tickets where student_id = $1 and client_request_id = $2`, [studentId, clientRequestId]);
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async listTickets(query: Parameters<SupportRepository['listTickets']>[0]): Promise<SupportTicketListRow[]> {
    const pattern = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null;
    // "não lidas" do ponto de vista de quem consulta: aluno lê mensagens da equipe; equipe lê mensagens do aluno
    const unreadSender = query.perspective === 'staff' ? 'student' : 'agent';
    const byDue = query.orderBy === 'due';
    const sortKey = byDue ? 't.sla_due_at' : 't.updated_at';
    const now = query.now ?? new Date();
    // mesma regra de slaStatus (sla.ts): prazo próximo = últimos 25% do prazo ou menos de 8 h
    const riskSql =
      query.slaRisk === 'overdue'
        ? 'and t.sla_completed_at is null and t.sla_paused_at is null and t.sla_due_at <= $14'
        : query.slaRisk === 'at_risk'
          ? `and t.sla_completed_at is null and t.sla_paused_at is null
             and (t.sla_due_at <= $14 or t.sla_due_at - $14 <= greatest((t.sla_due_at - t.sla_started_at) * 0.25, interval '8 hours'))`
          : query.slaRisk === 'near_deadline'
            ? `and t.sla_completed_at is null and t.sla_paused_at is null
               and t.sla_due_at > $14 and t.sla_due_at - $14 <= greatest((t.sla_due_at - t.sla_started_at) * 0.25, interval '8 hours')`
            : '';
    const { rows } = await this.pool.query<TicketRow & { unread_count: number; last_title: string | null; last_at: Date | null }>(
      `select ${prefixed('t')},
              (select count(*) from support_ticket_messages m where m.ticket_id = t.id and m.sender_type = '${unreadSender}' and m.read_at is null)::int as unread_count,
              le.title as last_title, le.created_at as last_at
         from support_tickets t
         left join lateral (
           select e.title, e.created_at from support_ticket_events e
            where e.ticket_id = t.id and e.visibility = 'public'
            order by e.created_at desc, e.seq desc limit 1
         ) le on true
        where ($1::text is null or t.student_id = $1)
          and ($2::text[] is null or t.status = any($2))
          and ($3::text is null or t.search_text like $3 or lower(t.protocol) like $3 or t.category_id = any($4::text[]))
          and ($5::timestamptz is null or (${sortKey}, t.id) ${byDue ? '>' : '<'} ($5, $6))
          and ($8::text is null or ($8 = 'mine' and t.assigned_agent_id = $9::uuid) or ($8 = 'unassigned' and t.assigned_agent_id is null))
          and ($10::text[] is null or t.assigned_team = any($10))
          and ($11::text[] is null or t.category_id = any($11))
          and ($12::text[] is null or t.priority = any($12))
          and (not $13::boolean or not exists (
                select 1 from students s join users u on u.id = s.user_id where s.id = t.student_id and u.is_demo))
          and $14::timestamptz is not null
          and (not $15::boolean or exists (
                select 1 from support_ticket_messages um where um.ticket_id = t.id and um.sender_type = 'student' and um.read_at is null))
          ${riskSql}
        order by ${sortKey} ${byDue ? 'asc' : 'desc'}, t.id ${byDue ? 'asc' : 'desc'}
        limit $7`,
      [
        query.studentId ?? null,
        query.statuses ?? null,
        pattern,
        query.searchCategoryIds ?? [],
        query.cursor?.updatedAt ?? null,
        query.cursor?.id ?? '',
        query.limit,
        query.assignment?.kind ?? null,
        query.assignment?.kind === 'mine' ? query.assignment.userId : null,
        query.teams ?? null,
        query.categoryIds ?? null,
        query.priorities ?? null,
        query.excludeDemo ?? false,
        now,
        query.unreadByStaff ?? false,
      ],
    );
    return rows.map((row) => ({
      ...mapTicket(row),
      unreadCount: row.unread_count,
      lastActivity: row.last_title && row.last_at ? { title: row.last_title, createdAt: row.last_at } : null,
    }));
  }

  async countByStatus(studentId: string): Promise<Partial<Record<SupportTicketStatus, number>>> {
    const { rows } = await this.pool.query<{ status: SupportTicketStatus; total: number }>('select status, count(*)::int as total from support_tickets where student_id = $1 group by status', [studentId]);
    return Object.fromEntries(rows.map((row) => [row.status, row.total]));
  }

  async listEvents(ticketId: string, options: { includeInternal: boolean }): Promise<SupportEventRecord[]> {
    const { rows } = await this.pool.query<EventRow>(
      `select id, ticket_id, type, visibility, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at
         from support_ticket_events where ticket_id = $1 and ($2 or visibility = 'public') order by created_at, seq`,
      [ticketId, options.includeInternal],
    );
    return rows.map(mapEvent);
  }

  async listMessages(ticketId: string): Promise<SupportMessageRecord[]> {
    const { rows } = await this.pool.query<MessageRow>(`select ${MESSAGE_COLUMNS} from support_ticket_messages where ticket_id = $1 order by created_at, seq`, [ticketId]);
    return rows.map(mapMessage);
  }

  async findMessageByClientId(ticketId: string, clientMessageId: string): Promise<SupportMessageRecord | null> {
    const { rows } = await this.pool.query<MessageRow>(`select ${MESSAGE_COLUMNS} from support_ticket_messages where ticket_id = $1 and client_message_id = $2`, [ticketId, clientMessageId]);
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async listAttachments(ticketId: string): Promise<SupportAttachmentRecord[]> {
    const { rows } = await this.pool.query<AttachmentRow>(`select ${ATTACHMENT_COLUMNS} from support_attachments where ticket_id = $1 order by created_at, id`, [ticketId]);
    return rows.map(mapAttachment);
  }

  async findRating(ticketId: string): Promise<SupportRatingRecord | null> {
    const { rows } = await this.pool.query<{ ticket_id: string; rating: 1 | 2 | 3 | 4 | 5; comment: string | null; created_at: Date }>(
      'select ticket_id, rating, comment, created_at from support_ticket_ratings where ticket_id = $1',
      [ticketId],
    );
    const row = rows[0];
    return row ? { ticketId: row.ticket_id, rating: row.rating, comment: row.comment, createdAt: row.created_at } : null;
  }

  async applyChanges(changes: Parameters<SupportRepository['applyChanges']>[0]): Promise<SupportTicketRecord> {
    return withTransaction(this.pool, async (client) => {
      const columns = patchColumns(changes.patch);
      const params: unknown[] = [changes.ticketId, changes.expectedVersion, changes.now];
      const sets = columns.map(([column, value]) => {
        params.push(value);
        return `${column} = $${params.length}`;
      });
      const { rows } = await client.query<TicketRow>(
        `update support_tickets set ${[...sets, 'version = version + 1', 'updated_at = $3'].join(', ')}
          where id = $1 and version = $2 returning ${TICKET_COLUMNS}`,
        params,
      );
      const updated = rows[0];
      if (!updated) throw new ConflictError('O chamado foi atualizado enquanto você agia. Atualize e tente novamente.', 'ticket_changed');
      for (const message of changes.messages) {
        await client.query(
          `insert into support_ticket_messages (id, ticket_id, sender_type, sender_user_id, sender_name, content, client_message_id, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [message.id, changes.ticketId, message.senderType, message.senderUserId, message.senderName, message.content, message.clientMessageId, changes.now],
        );
      }
      for (const link of changes.attachments) await linkAttachments(client, changes.ticketId, link, changes.now);
      await insertEvents(client, changes.ticketId, changes.events, changes.now);
      await insertNotifications(client, changes.ticketId, updated.student_id, changes.notifications, changes.now);
      if (changes.rating) {
        const rating = await client.query(
          'insert into support_ticket_ratings (ticket_id, rating, comment, created_at) values ($1, $2, $3, $4) on conflict (ticket_id) do nothing',
          [changes.ticketId, changes.rating.rating, changes.rating.comment, changes.now],
        );
        if (rating.rowCount !== 1) throw new ConflictError('Você já avaliou este atendimento.', 'already_rated');
      }
      return mapTicket(updated);
    });
  }

  async markRead(ticketId: string, studentId: string, now: Date): Promise<number> {
    return withTransaction(this.pool, async (client) => {
      const messages = await client.query(
        `update support_ticket_messages set read_at = $2 where ticket_id = $1 and sender_type = 'agent' and read_at is null`,
        [ticketId, now],
      );
      await client.query('update support_notifications set read_at = $3 where ticket_id = $1 and student_id = $2 and read_at is null', [ticketId, studentId, now]);
      return messages.rowCount ?? 0;
    });
  }

  async markReadByStaff(ticketId: string, now: Date): Promise<number> {
    const result = await this.pool.query(
      `update support_ticket_messages set read_at = $2 where ticket_id = $1 and sender_type = 'student' and read_at is null`,
      [ticketId, now],
    );
    return result.rowCount ?? 0;
  }

  async createUpload(input: Parameters<SupportRepository['createUpload']>[0]): Promise<SupportAttachmentRecord> {
    return withTransaction(this.pool, async (client) => {
      await client.query('delete from support_attachments where ticket_id is null and expires_at < $1', [input.now]);
      const { rows } = await client.query<AttachmentRow>(
        `insert into support_attachments (id, uploaded_by_type, uploaded_by_user_id, uploader_name, file_name, mime_type, size_bytes, sha256, content, created_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning ${ATTACHMENT_COLUMNS}`,
        [input.id, input.uploadedByType, input.uploadedByUserId, input.uploaderName, input.fileName, input.mimeType, input.sizeBytes, input.sha256, input.content, input.now, input.expiresAt],
      );
      return mapAttachment(rows[0]!);
    });
  }

  async findAttachment(id: string): Promise<SupportAttachmentRecord | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<AttachmentRow>(`select ${ATTACHMENT_COLUMNS} from support_attachments where id = $1`, [id]);
    return rows[0] ? mapAttachment(rows[0]) : null;
  }

  async readAttachmentContent(id: string): Promise<Buffer | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<{ content: Buffer }>('select content from support_attachments where id = $1', [id]);
    return rows[0]?.content ?? null;
  }

  async deletePendingUpload(id: string, ownerUserId: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await this.pool.query('delete from support_attachments where id = $1 and ticket_id is null and uploaded_by_user_id = $2', [id, ownerUserId]);
    return result.rowCount === 1;
  }

  async listNotifications(studentId: string, limit: number): Promise<SupportNotificationRecord[]> {
    const { rows } = await this.pool.query<NotificationRow>(
      `select n.id, n.student_id, n.ticket_id, t.protocol, n.kind, n.title, n.body, n.created_at, n.read_at
         from support_notifications n join support_tickets t on t.id = n.ticket_id
        where n.student_id = $1 order by n.created_at desc, n.id desc limit $2`,
      [studentId, limit],
    );
    return rows.map(mapNotification);
  }

  async countUnreadNotifications(studentId: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>('select count(*)::int as total from support_notifications where student_id = $1 and read_at is null', [studentId]);
    return rows[0]?.total ?? 0;
  }

  async markNotificationsRead(studentId: string, ids: string[] | null, now: Date): Promise<void> {
    if (ids) {
      const valid = ids.filter(isUuid);
      if (valid.length === 0) return;
      await this.pool.query('update support_notifications set read_at = $3 where student_id = $1 and id = any($2::uuid[]) and read_at is null', [studentId, valid, now]);
      return;
    }
    await this.pool.query('update support_notifications set read_at = $2 where student_id = $1 and read_at is null', [studentId, now]);
  }
}

export function createPgSupportRepository(pool: DbPool): SupportRepository {
  return new PgSupportRepository(pool);
}
