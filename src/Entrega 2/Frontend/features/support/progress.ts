import type { SupportTicket, SupportTicketEvent, SupportTicketStatus } from '../../types/api';

import { STATUS_META } from './labels';

export type ProgressStepState = 'done' | 'current' | 'upcoming' | 'skipped';
export type ProgressStepKey = 'received' | 'triage' | 'analysis' | 'resolution';

export interface ProgressStep {
  key: ProgressStepKey;
  label: string;
  /** só na etapa atual: o que está acontecendo agora */
  description: string | null;
  state: ProgressStepState;
  completedAt: string | null;
}

export interface TicketProgress {
  steps: ProgressStep[];
  /** índice da etapa atual (steps.length quando tudo foi concluído) */
  currentIndex: number;
  cancelled: boolean;
  /** "Próxima etapa" (null quando não há) */
  next: { label: string; description: string } | null;
}

/** Em qual das quatro etapas visíveis cada situação técnica está. */
const STAGE: Record<SupportTicketStatus, number> = {
  submitted: 0,
  received: 1,
  triage: 1,
  assigned: 2,
  in_analysis: 2,
  in_progress: 2,
  waiting_student: 2,
  waiting_department: 2,
  waiting_external: 2,
  reopened: 2,
  resolved: 4,
  closed: 4,
  cancelled: -1,
};

const TRIAGE_DONE_TYPES = new Set(['ticket_triaged', 'ticket_assigned', 'department_forwarded']);
const WORKING = new Set<SupportTicketStatus>(['assigned', 'in_analysis', 'in_progress', 'waiting_student', 'waiting_department', 'waiting_external']);

function firstEvent(events: SupportTicketEvent[], predicate: (event: SupportTicketEvent) => boolean): string | null {
  return events.find(predicate)?.createdAt ?? null;
}

function lastEvent(events: SupportTicketEvent[], predicate: (event: SupportTicketEvent) => boolean): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as SupportTicketEvent;
    if (predicate(event)) return event.createdAt;
  }
  return null;
}

/** Etapa alcançada por um chamado cancelado (para mostrar até onde ele chegou). */
function reachedStage(events: SupportTicketEvent[]): number {
  let stage = 0;
  for (const event of events) {
    if (event.type === 'ticket_received') stage = Math.max(stage, 1);
    if (TRIAGE_DONE_TYPES.has(event.type) || (event.toStatus && WORKING.has(event.toStatus))) stage = Math.max(stage, 2);
  }
  return stage;
}

/**
 * Converte a situação + o histórico nas quatro etapas que o estudante entende:
 * Solicitação recebida → Triagem → Análise → Resolução.
 */
export function buildProgress(ticket: Pick<SupportTicket, 'status' | 'events' | 'canRate'>): TicketProgress {
  const { status, events } = ticket;
  const cancelled = status === 'cancelled';
  const stage = cancelled ? reachedStage(events) : STAGE[status];
  const receivedAt = firstEvent(events, (event) => event.type === 'ticket_received');
  const triagedAt = firstEvent(events, (event) => TRIAGE_DONE_TYPES.has(event.type) || (event.toStatus !== null && WORKING.has(event.toStatus)));
  const resolvedAt = lastEvent(events, (event) => event.type === 'ticket_resolved');
  const meta = STATUS_META[status];

  const stateFor = (index: number): ProgressStepState => {
    if (index < stage) return 'done';
    if (cancelled) return 'skipped';
    return index === stage ? 'current' : 'upcoming';
  };
  const describe = (index: number) => (stateFor(index) === 'current' ? meta.description : null);

  const steps: ProgressStep[] = [
    { key: 'received', label: stage > 0 ? 'Solicitação recebida' : 'Envio da solicitação', description: describe(0), state: stateFor(0), completedAt: stage > 0 ? receivedAt : null },
    { key: 'triage', label: stage > 1 ? 'Triagem concluída' : stage === 1 && !cancelled ? 'Em triagem' : 'Triagem', description: describe(1), state: stateFor(1), completedAt: stage > 1 ? triagedAt : null },
    {
      key: 'analysis',
      label: stage > 2 ? 'Análise concluída' : stage === 2 && !cancelled ? meta.short : 'Análise',
      description: describe(2),
      state: stateFor(2),
      completedAt: stage > 2 ? resolvedAt : null,
    },
    { key: 'resolution', label: stage > 3 ? 'Resolvido' : 'Resolução', description: describe(3), state: stateFor(3), completedAt: stage > 3 ? resolvedAt : null },
  ];

  return { steps, currentIndex: cancelled ? -1 : Math.min(stage, steps.length), cancelled, next: nextStep(status, ticket.canRate) };
}

export function nextStep(status: SupportTicketStatus, canRate: boolean): TicketProgress['next'] {
  switch (status) {
    case 'submitted':
    case 'received':
    case 'triage':
      return { label: 'Encaminhamento para a equipe responsável', description: 'Depois da triagem, a equipe certa vai analisar sua solicitação.' };
    case 'waiting_student':
      return { label: 'Sua resposta', description: 'Assim que você responder, a análise continua e o prazo volta a contar.' };
    case 'in_progress':
      return { label: 'Resolução', description: 'A equipe vai concluir o atendimento e registrar a solução para você.' };
    case 'assigned':
    case 'in_analysis':
    case 'waiting_department':
    case 'waiting_external':
    case 'reopened':
      return { label: 'Conclusão da análise', description: 'Depois disso, sua solicitação será encaminhada para resolução.' };
    case 'resolved':
      return canRate ? { label: 'Sua avaliação', description: 'Conte como foi o atendimento. Isso ajuda o ASA a melhorar.' } : null;
    default:
      return null;
  }
}
