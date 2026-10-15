import { randomUUID } from 'node:crypto';
import { slaStatus } from '../../src/support/sla.js';
import { ConflictError, ValidationError } from '../../src/errors/AppError.js';
import type { SupportTicketStatus } from '../../src/contracts/mobileApi.v1.js';
import type {
  NewSupportEvent,
  NewSupportNotification,
  SupportAttachmentLink,
  SupportAttachmentRecord,
  SupportEventRecord,
  SupportMessageRecord,
  SupportNotificationRecord,
  SupportRatingRecord,
  SupportRepository,
  SupportTicketRecord,
} from '../../src/support/types.js';

interface StoredTicket extends SupportTicketRecord {
  searchText: string;
}

export interface InMemorySupportStore {
  tickets: StoredTicket[];
  events: SupportEventRecord[];
  messages: SupportMessageRecord[];
  attachments: Array<SupportAttachmentRecord & { content: Buffer }>;
  ratings: SupportRatingRecord[];
  notifications: Omit<SupportNotificationRecord, 'protocol'>[];
}

const clone = <T>(value: T): T => structuredClone(value);
const unattach = ({ content: _content, ...record }: SupportAttachmentRecord & { content: Buffer }): SupportAttachmentRecord => clone(record);

/** Repositório de chamados em memória (testes unitários), com as mesmas regras do PostgreSQL. */
export function createInMemorySupportRepository(): SupportRepository & { store: InMemorySupportStore } {
  const store: InMemorySupportStore = { tickets: [], events: [], messages: [], attachments: [], ratings: [], notifications: [] };
  let protocolSequence = 400;

  const pushEvents = (ticketId: string, events: NewSupportEvent[], now: Date) => {
    for (const item of events) store.events.push({ ...clone(item), id: randomUUID(), ticketId, createdAt: now });
  };
  const pushNotifications = (ticketId: string, studentId: string, notifications: NewSupportNotification[], now: Date) => {
    for (const item of notifications) store.notifications.push({ ...item, id: randomUUID(), ticketId, studentId, createdAt: now, readAt: null });
  };
  const canLink = (link: SupportAttachmentLink, now: Date) =>
    link.ids.every((id) => store.attachments.some((item) => item.id === id && item.ticketId === null && item.uploadedByUserId === link.ownerUserId && item.expiresAt !== null && item.expiresAt > now));
  const link = (ticketId: string, attachment: SupportAttachmentLink) => {
    for (const item of store.attachments) {
      if (attachment.ids.includes(item.id)) Object.assign(item, { ticketId, messageId: attachment.messageId, expiresAt: null });
    }
  };
  const unavailable = () => new ValidationError('Um dos arquivos expirou ou não está mais disponível. Envie-o novamente.', [{ field: 'attachmentIds', message: 'arquivo indisponível' }], { reason: 'attachment_unavailable' });
  const stripSearch = ({ searchText: _searchText, ...ticket }: StoredTicket): SupportTicketRecord => clone(ticket);

  return {
    store,
    async createTicket(input) {
      const existing = store.tickets.find((ticket) => ticket.studentId === input.studentId && ticket.clientRequestId === input.clientRequestId);
      if (existing) return { ticket: stripSearch(existing), created: false };
      if (input.attachments && !canLink(input.attachments, input.now)) throw unavailable();
      protocolSequence += 1;
      const ticket: StoredTicket = {
        id: input.id,
        protocol: `ASA-${input.now.getUTCFullYear()}-${String(protocolSequence).padStart(5, '0')}`,
        studentId: input.studentId,
        channel: input.channel,
        clientRequestId: input.clientRequestId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        subject: input.subject,
        description: input.description,
        searchText: input.searchText,
        status: input.status,
        priority: input.priority,
        assignedTeam: input.assignedTeam,
        assignedAgentId: null,
        pendingAction: null,
        resolution: null,
        resolvedAt: null,
        closedAt: null,
        cancelledAt: null,
        cancelReason: null,
        reopenedCount: 0,
        sla: clone(input.sla),
        firstResponseDueAt: input.firstResponseDueAt,
        createdAt: input.now,
        updatedAt: input.now,
        version: 1,
      };
      store.tickets.push(ticket);
      pushEvents(ticket.id, input.events, input.now);
      if (input.attachments) link(ticket.id, input.attachments);
      pushNotifications(ticket.id, ticket.studentId, input.notifications, input.now);
      return { ticket: stripSearch(ticket), created: true };
    },
    async findTicket(id) {
      const ticket = store.tickets.find((item) => item.id === id);
      return ticket ? stripSearch(ticket) : null;
    },
    async findTicketByClientRequest(studentId, clientRequestId) {
      const ticket = store.tickets.find((item) => item.studentId === studentId && item.clientRequestId === clientRequestId);
      return ticket ? stripSearch(ticket) : null;
    },
    async listTickets(query) {
      const term = query.search ?? '';
      const cursor = query.cursor;
      const now = query.now ?? new Date();
      const unreadSender = query.perspective === 'staff' ? 'student' : 'agent';
      const byDue = query.orderBy === 'due';
      const key = (ticket: StoredTicket) => (byDue ? ticket.sla.dueAt : ticket.updatedAt).getTime();
      const risky = (ticket: StoredTicket) => {
        const status = slaStatus(ticket.sla, now);
        if (query.slaRisk === 'overdue') return status === 'overdue';
        if (query.slaRisk === 'near_deadline') return status === 'near_deadline';
        return status === 'overdue' || status === 'near_deadline';
      };
      return store.tickets
        .filter((ticket) => !query.studentId || ticket.studentId === query.studentId)
        .filter((ticket) => !query.statuses || query.statuses.includes(ticket.status))
        .filter((ticket) => !term || ticket.searchText.includes(term) || ticket.protocol.toLowerCase().includes(term) || (query.searchCategoryIds ?? []).includes(ticket.categoryId))
        .filter((ticket) => !query.assignment || (query.assignment.kind === 'mine' ? ticket.assignedAgentId === query.assignment.userId : ticket.assignedAgentId === null))
        .filter((ticket) => !query.teams || query.teams.includes(ticket.assignedTeam))
        .filter((ticket) => !query.categoryIds || query.categoryIds.includes(ticket.categoryId))
        .filter((ticket) => !query.priorities || query.priorities.includes(ticket.priority))
        .filter((ticket) => !query.slaRisk || risky(ticket))
        .filter((ticket) => !query.unreadByStaff || store.messages.some((message) => message.ticketId === ticket.id && message.senderType === 'student' && !message.readAt))
        .sort((a, b) => (byDue ? key(a) - key(b) || (a.id < b.id ? -1 : 1) : key(b) - key(a) || (a.id < b.id ? 1 : -1)))
        .filter((ticket) => !cursor || (byDue ? key(ticket) > cursor.updatedAt.getTime() || (key(ticket) === cursor.updatedAt.getTime() && ticket.id > cursor.id) : key(ticket) < cursor.updatedAt.getTime() || (key(ticket) === cursor.updatedAt.getTime() && ticket.id < cursor.id)))
        .slice(0, query.limit)
        .map((ticket) => {
          const lastPublic = store.events.filter((event) => event.ticketId === ticket.id && event.visibility === 'public').at(-1);
          return {
            ...stripSearch(ticket),
            unreadCount: store.messages.filter((message) => message.ticketId === ticket.id && message.senderType === unreadSender && !message.readAt).length,
            lastActivity: lastPublic ? { title: lastPublic.title, createdAt: lastPublic.createdAt } : null,
          };
        });
    },
    async markReadByStaff(ticketId, now) {
      let changed = 0;
      for (const message of store.messages) {
        if (message.ticketId === ticketId && message.senderType === 'student' && !message.readAt) {
          message.readAt = now;
          changed += 1;
        }
      }
      return changed;
    },
    async countByStatus(studentId) {
      const counts: Partial<Record<SupportTicketStatus, number>> = {};
      for (const ticket of store.tickets) if (ticket.studentId === studentId) counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
      return counts;
    },
    async listEvents(ticketId, options) {
      return store.events.filter((event) => event.ticketId === ticketId && (options.includeInternal || event.visibility === 'public')).map(clone);
    },
    async listMessages(ticketId) {
      return store.messages.filter((message) => message.ticketId === ticketId).map(clone);
    },
    async findMessageByClientId(ticketId, clientMessageId) {
      const message = store.messages.find((item) => item.ticketId === ticketId && item.clientMessageId === clientMessageId);
      return message ? clone(message) : null;
    },
    async listAttachments(ticketId) {
      return store.attachments.filter((item) => item.ticketId === ticketId).map(unattach);
    },
    async findRating(ticketId) {
      const rating = store.ratings.find((item) => item.ticketId === ticketId);
      return rating ? clone(rating) : null;
    },
    async applyChanges(changes) {
      const ticket = store.tickets.find((item) => item.id === changes.ticketId);
      if (!ticket || ticket.version !== changes.expectedVersion) {
        throw new ConflictError('O chamado foi atualizado enquanto você agia. Atualize e tente novamente.', 'ticket_changed');
      }
      if (!changes.attachments.every((attachment) => canLink(attachment, changes.now))) throw unavailable();
      if (changes.rating && store.ratings.some((item) => item.ticketId === ticket.id)) throw new ConflictError('Você já avaliou este atendimento.', 'already_rated');
      Object.assign(ticket, clone(changes.patch), { version: ticket.version + 1, updatedAt: changes.now });
      for (const message of changes.messages) store.messages.push({ ...clone(message), ticketId: ticket.id, readAt: null, createdAt: changes.now });
      for (const attachment of changes.attachments) link(ticket.id, attachment);
      pushEvents(ticket.id, changes.events, changes.now);
      pushNotifications(ticket.id, ticket.studentId, changes.notifications, changes.now);
      if (changes.rating) store.ratings.push({ ticketId: ticket.id, rating: changes.rating.rating, comment: changes.rating.comment, createdAt: changes.now });
      return stripSearch(ticket);
    },
    async markRead(ticketId, studentId, now) {
      let changed = 0;
      for (const message of store.messages) {
        if (message.ticketId === ticketId && message.senderType === 'agent' && !message.readAt) {
          message.readAt = now;
          changed += 1;
        }
      }
      for (const notification of store.notifications) {
        if (notification.ticketId === ticketId && notification.studentId === studentId && !notification.readAt) notification.readAt = now;
      }
      return changed;
    },
    async createUpload(input) {
      store.attachments = store.attachments.filter((item) => item.ticketId !== null || (item.expiresAt !== null && item.expiresAt >= input.now));
      const record = {
        id: input.id,
        ticketId: null,
        messageId: null,
        uploadedByType: input.uploadedByType,
        uploadedByUserId: input.uploadedByUserId,
        uploaderName: input.uploaderName,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        createdAt: input.now,
        expiresAt: input.expiresAt,
        content: input.content,
      };
      store.attachments.push(record);
      return unattach(record);
    },
    async findAttachment(id) {
      const record = store.attachments.find((item) => item.id === id);
      return record ? unattach(record) : null;
    },
    async readAttachmentContent(id) {
      return store.attachments.find((item) => item.id === id)?.content ?? null;
    },
    async deletePendingUpload(id, ownerUserId) {
      const before = store.attachments.length;
      store.attachments = store.attachments.filter((item) => !(item.id === id && item.ticketId === null && item.uploadedByUserId === ownerUserId));
      return store.attachments.length < before;
    },
    async listNotifications(studentId, limit) {
      return store.notifications
        .filter((item) => item.studentId === studentId)
        .map((item) => ({ ...clone(item), protocol: store.tickets.find((ticket) => ticket.id === item.ticketId)?.protocol ?? '' }))
        .reverse()
        .slice(0, limit);
    },
    async countUnreadNotifications(studentId) {
      return store.notifications.filter((item) => item.studentId === studentId && !item.readAt).length;
    },
    async markNotificationsRead(studentId, ids, now) {
      for (const item of store.notifications) {
        if (item.studentId === studentId && !item.readAt && (!ids || ids.includes(item.id))) item.readAt = now;
      }
    },
  };
}
