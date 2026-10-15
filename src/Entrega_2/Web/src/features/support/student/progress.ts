import type { SupportTicket, SupportTicketEvent, SupportTicketStatus } from '@/types/api';
import { STATUS_META } from '../labels';

/**
 * As quatro etapas que o aluno entende (Recebido → Triagem → Análise/atendimento → Resolvido), derivadas da
 * situação e do histórico público — a mesma regra do app (Frontend/features/support/progress.ts).
 */
export type ProgressStepState = 'done' | 'current' | 'upcoming' | 'skipped';

export interface ProgressStep {
  key: 'received' | 'triage' | 'analysis' | 'resolution';
  label: string;
  state: ProgressStepState;
  completedAt: string | null;
}

export interface TicketProgress {
  steps: ProgressStep[];
  cancelled: boolean;
  /** o que está acontecendo agora (null quando concluído ou cancelado) */
  currentDescription: string | null;
  next: { label: string; description: string } | null;
}

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

const WORKING_LABEL: Partial<Record<SupportTicketStatus, string>> = {
  assigned: 'Encaminhado à equipe',
  in_analysis: 'Em análise',
  in_progress: 'Em atendimento',
  waiting_student: 'Aguardando você',
  waiting_department: 'Aguardando setor responsável',
  waiting_external: 'Aguardando retorno externo',
  reopened: 'Reaberto — em análise',
};

const TRIAGE_DONE = new Set(['ticket_triaged', 'ticket_assigned', 'department_forwarded']);
const WORKING = new Set<SupportTicketStatus>(['assigned', 'in_analysis', 'in_progress', 'waiting_student', 'waiting_department', 'waiting_external']);

const first = (events: SupportTicketEvent[], test: (event: SupportTicketEvent) => boolean): string | null => events.find(test)?.createdAt ?? null;
const last = (events: SupportTicketEvent[], test: (event: SupportTicketEvent) => boolean): string | null => [...events].reverse().find(test)?.createdAt ?? null;
const reachedTriage = (event: SupportTicketEvent) => TRIAGE_DONE.has(event.type) || (event.toStatus !== null && WORKING.has(event.toStatus));

/** Até onde um chamado cancelado chegou (para mostrar o caminho percorrido). */
function reachedStage(events: SupportTicketEvent[]): number {
  let stage = 0;
  for (const event of events) {
    if (event.type === 'ticket_received') stage = Math.max(stage, 1);
    if (reachedTriage(event)) stage = Math.max(stage, 2);
  }
  return stage;
}

export function buildProgress(ticket: Pick<SupportTicket, 'status' | 'events' | 'canRate' | 'resolvedAt' | 'closedAt'>): TicketProgress {
  const { status, events } = ticket;
  const cancelled = status === 'cancelled';
  const stage = cancelled ? reachedStage(events) : STAGE[status];
  const stateFor = (index: number): ProgressStepState => {
    if (index < stage) return 'done';
    if (cancelled) return 'skipped';
    return index === stage ? 'current' : 'upcoming';
  };
  const resolvedAt = ticket.resolvedAt ?? last(events, (event) => event.type === 'ticket_resolved') ?? ticket.closedAt;
  const finalLabel = status === 'closed' && !ticket.resolvedAt ? 'Encerrado' : 'Resolvido';
  const steps: ProgressStep[] = [
    { key: 'received', label: 'Recebido', state: stateFor(0), completedAt: stage > 0 ? first(events, (event) => event.type === 'ticket_received') : null },
    { key: 'triage', label: stage === 1 && !cancelled ? 'Em triagem' : 'Triagem', state: stateFor(1), completedAt: stage > 1 ? first(events, reachedTriage) : null },
    {
      key: 'analysis',
      label: stage === 2 && !cancelled ? (WORKING_LABEL[status] ?? 'Em análise') : 'Análise e atendimento',
      state: stateFor(2),
      completedAt: stage > 2 ? resolvedAt : null,
    },
    { key: 'resolution', label: finalLabel, state: stateFor(3), completedAt: stage > 3 ? resolvedAt : null },
  ];
  const running = !cancelled && stage < 4;
  return { steps, cancelled, currentDescription: running ? STATUS_META[status].description : null, next: nextStep(status, ticket.canRate) };
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
      return { label: 'Conclusão da análise', description: 'Depois disso, sua solicitação segue para a resolução.' };
    case 'resolved':
    case 'closed':
      return canRate ? { label: 'Sua avaliação', description: 'Conte como foi o atendimento. Isso ajuda o ASA a melhorar.' } : null;
    default:
      return null;
  }
}
