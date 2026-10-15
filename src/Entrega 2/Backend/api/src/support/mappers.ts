import type {
  SupportAttachment,
  SupportFirstResponse,
  SupportNotification,
  SupportStaffTicket,
  SupportStaffTicketEvent,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketMessage,
  SupportTicketSla,
  SupportTicketSummary,
} from '../contracts/mobileApi.v1.js';
import { findCategory, findSubcategoryLabel, SUPPORT_LIMITS } from './catalog.js';
import { slaStatus } from './sla.js';
import { isActiveStatus } from './statuses.js';
import type {
  SupportAttachmentRecord,
  SupportEventRecord,
  SupportMessageRecord,
  SupportNotificationRecord,
  SupportRatingRecord,
  SupportSlaRecord,
  SupportTicketRecord,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toSla(sla: SupportSlaRecord, now: Date): SupportTicketSla {
  return {
    status: slaStatus(sla, now),
    targetBusinessDays: sla.targetBusinessDays,
    startedAt: sla.startedAt.toISOString(),
    dueAt: sla.dueAt.toISOString(),
    pausedAt: iso(sla.pausedAt),
    resumedAt: iso(sla.resumedAt),
    completedAt: iso(sla.completedAt),
  };
}

export interface TicketActivity {
  unreadCount: number;
  lastActivity: { title: string; createdAt: Date } | null;
}

export function toSummary(ticket: SupportTicketRecord, activity: TicketActivity, now: Date): SupportTicketSummary {
  return {
    id: ticket.id,
    protocol: ticket.protocol,
    subject: ticket.subject,
    categoryId: ticket.categoryId,
    categoryLabel: findCategory(ticket.categoryId)?.label ?? 'Outro',
    subcategoryId: ticket.subcategoryId,
    subcategoryLabel: findSubcategoryLabel(ticket.categoryId, ticket.subcategoryId),
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastActivity: activity.lastActivity ? { title: activity.lastActivity.title, createdAt: activity.lastActivity.createdAt.toISOString() } : null,
    unreadCount: activity.unreadCount,
    requiresStudentAction: ticket.status === 'waiting_student',
    sla: toSla(ticket.sla, now),
  };
}

export function toAttachment(record: SupportAttachmentRecord): SupportAttachment {
  return {
    id: record.id,
    name: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt.toISOString(),
    uploadedBy: record.uploadedByType,
    uploaderName: record.uploaderName,
    messageId: record.messageId,
  };
}

export function toEvent(record: SupportEventRecord): SupportTicketEvent {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    actorType: record.actorType,
    actorName: record.actorName,
    fromStatus: record.fromStatus,
    toStatus: record.toStatus,
    details: record.details.map((detail) => ({ ...detail })),
  };
}

export function toStaffEvent(record: SupportEventRecord): SupportStaffTicketEvent {
  return { ...toEvent(record), visibility: record.visibility };
}

export function toMessage(record: SupportMessageRecord, attachments: SupportAttachmentRecord[]): SupportTicketMessage {
  return {
    id: record.id,
    senderType: record.senderType,
    senderName: record.senderName,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    readAt: iso(record.readAt),
    attachments: attachments.filter((item) => item.messageId === record.id).map(toAttachment),
  };
}

export function toNotification(record: SupportNotificationRecord): SupportNotification {
  return {
    id: record.id,
    ticketId: record.ticketId,
    protocol: record.protocol,
    kind: record.kind,
    title: record.title,
    body: record.body,
    createdAt: record.createdAt.toISOString(),
    readAt: iso(record.readAt),
  };
}

/** Atividade (não lidas + última atualização pública) a partir do que o detalhe já carregou. */
export function activityFrom(events: SupportEventRecord[], messages: SupportMessageRecord[]): TicketActivity {
  const publicEvents = events.filter((event) => event.visibility === 'public');
  const last = publicEvents.reduce<SupportEventRecord | null>((latest, event) => (!latest || event.createdAt >= latest.createdAt ? event : latest), null);
  return {
    unreadCount: messages.filter((message) => message.senderType === 'agent' && !message.readAt).length,
    lastActivity: last ? { title: last.title, createdAt: last.createdAt } : null,
  };
}

export interface TicketBundle {
  ticket: SupportTicketRecord;
  events: SupportEventRecord[];
  messages: SupportMessageRecord[];
  attachments: SupportAttachmentRecord[];
  rating: SupportRatingRecord | null;
}

/** Até quando o estudante pode reabrir (null quando a reabertura não se aplica). */
export function reopenDeadline(ticket: SupportTicketRecord): Date | null {
  if (ticket.status !== 'resolved' || !ticket.resolvedAt) return null;
  return new Date(ticket.resolvedAt.getTime() + SUPPORT_LIMITS.reopenWindowDays * DAY_MS);
}

/** Visão do estudante: somente eventos públicos; permissões decididas aqui, não no app. */
/**
 * Primeira resposta da equipe: a primeira ação PÚBLICA da equipe no histórico (mensagem, assumir, encaminhar,
 * pedir ação, resolver). Mesma regra do indicador de métricas e do CSV.
 */
export function firstResponseOf(ticket: SupportTicketRecord, publicEvents: SupportEventRecord[], now: Date): SupportFirstResponse | null {
  if (!ticket.firstResponseDueAt) return null;
  const due = ticket.firstResponseDueAt;
  const responded = publicEvents
    .filter((event) => event.actorType === 'agent' || event.actorType === 'department')
    .reduce<Date | null>((first, event) => (!first || event.createdAt < first ? event.createdAt : first), null);
  const status: SupportFirstResponse['status'] = responded
    ? responded.getTime() <= due.getTime()
      ? 'met'
      : 'late'
    : !isActiveStatus(ticket.status)
      ? 'not_applicable'
      : now.getTime() > due.getTime()
        ? 'overdue'
        : 'pending';
  return { dueAt: due.toISOString(), respondedAt: responded?.toISOString() ?? null, status };
}

export function toTicket(bundle: TicketBundle, now: Date): SupportTicket {
  const { ticket, events, messages, attachments, rating } = bundle;
  const publicEvents = events.filter((event) => event.visibility === 'public');
  const deadline = reopenDeadline(ticket);
  const active = isActiveStatus(ticket.status);
  return {
    ...toSummary(ticket, activityFrom(publicEvents, messages), now),
    description: ticket.description,
    channel: bundle.ticket.channel,
    assignedTeam: ticket.assignedTeam,
    pendingAction:
      ticket.status === 'waiting_student' && ticket.pendingAction
        ? { title: ticket.pendingAction.title, description: ticket.pendingAction.description, requestedAt: ticket.pendingAction.requestedAt.toISOString(), expectsAttachment: ticket.pendingAction.expectsAttachment }
        : null,
    resolution: ticket.resolution,
    resolvedAt: iso(ticket.resolvedAt),
    closedAt: iso(ticket.closedAt),
    cancelledAt: iso(ticket.cancelledAt),
    reopenedCount: ticket.reopenedCount,
    rating: rating ? { rating: rating.rating, comment: rating.comment, createdAt: rating.createdAt.toISOString() } : null,
    canReply: active,
    canCancel: active,
    canReopen: deadline !== null && deadline.getTime() > now.getTime(),
    canRate: (ticket.status === 'resolved' || ticket.status === 'closed') && !rating,
    reopenDeadline: deadline ? deadline.toISOString() : null,
    firstResponse: firstResponseOf(ticket, publicEvents, now),
    events: publicEvents.map(toEvent),
    messages: messages.map((message) => toMessage(message, attachments)),
    attachments: attachments.map(toAttachment),
  };
}

export function toStaffTicket(bundle: TicketBundle, student: SupportStaffTicket['student'], now: Date): SupportStaffTicket {
  const { events: _publicEvents, ...base } = toTicket(bundle, now);
  return { ...base, student, events: bundle.events.map(toStaffEvent) };
}
