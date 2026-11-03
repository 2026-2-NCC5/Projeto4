import type { SupportCanonicalEventType, SupportEventAudience, SupportEventEnvelope, SupportTicketEventType } from '../../contracts/mobileApi.v1.js';
import { STATUS_LABELS } from '../statuses.js';
import type { NewSupportEvent, NewSupportMessage } from '../types.js';

/** Linha a gravar no log de eventos, na mesma transação da mudança. */
export interface EventLogEntry {
  type: SupportCanonicalEventType;
  audience: SupportEventAudience;
  actorType: string;
  actorUserId: string | null;
  data: SupportEventEnvelope['data'];
}

/** null = já coberto por outro evento (a mensagem gera `support.message.created`). */
const CANONICAL_BY_EVENT: Record<SupportTicketEventType, SupportCanonicalEventType | null> = {
  ticket_created: 'support.ticket.created',
  ticket_received: 'support.ticket.status_changed',
  ticket_triaged: 'support.ticket.status_changed',
  ticket_assigned: 'support.ticket.assigned',
  status_changed: 'support.ticket.status_changed',
  message_received: null,
  message_sent: null,
  file_uploaded: 'support.message.attachment_added',
  student_action_required: 'support.document.requested',
  student_response_received: 'support.document.received',
  department_forwarded: 'support.ticket.transferred',
  resolution_proposed: 'support.ticket.status_changed',
  ticket_resolved: 'support.ticket.resolved',
  ticket_closed: 'support.ticket.status_changed',
  ticket_reopened: 'support.ticket.reopened',
  ticket_cancelled: 'support.ticket.status_changed',
  rating_submitted: 'support.ticket.rated',
  priority_changed: 'support.ticket.priority_changed',
  internal_note: 'support.ticket.note_added',
};

/**
 * Evento do histórico → evento canônico. Regra de privacidade: `data` nunca recebe `description` nem `details`
 * (ali ficam notas, nomes de arquivo e observações); eventos internos não levam nem o título ao público errado.
 */
export function logEntryForEvent(event: NewSupportEvent): EventLogEntry | null {
  const type = CANONICAL_BY_EVENT[event.type];
  if (!type) return null;
  const audience: SupportEventAudience = event.visibility === 'public' ? 'STUDENT_VISIBLE' : 'STAFF_ONLY';
  const data: SupportEventEnvelope['data'] = { title: event.title };
  if (event.fromStatus) data.from = event.fromStatus;
  if (event.toStatus) {
    data.to = event.toStatus;
    data.publicLabel = STATUS_LABELS[event.toStatus];
  }
  return { type, audience, actorType: event.actorType, actorUserId: event.actorUserId, data };
}

export function logEntryForMessage(message: NewSupportMessage): EventLogEntry {
  const fields = message.transportFields ?? {};
  return {
    type: 'support.message.created',
    audience: fields.studentVisible === false ? 'STAFF_ONLY' : 'STUDENT_VISIBLE',
    actorType: message.senderType,
    actorUserId: message.senderUserId,
    data: { messageId: message.id, transport: fields.transport ?? 'in_app', senderType: message.senderType === 'contact' ? 'student' : message.senderType },
  };
}

/** Entradas de uma alteração, na ordem em que aconteceram. */
export function logEntriesFor(input: { events: NewSupportEvent[]; messages: NewSupportMessage[]; extra?: EventLogEntry[] }): EventLogEntry[] {
  return [...input.messages.map(logEntryForMessage), ...input.events.map(logEntryForEvent).filter((entry): entry is EventLogEntry => entry !== null), ...(input.extra ?? [])];
}
