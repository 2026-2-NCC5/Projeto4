import type { SupportTicketStatus } from '../contracts/mobileApi.v1.js';

export const ALL_STATUSES: readonly SupportTicketStatus[] = [
  'submitted',
  'received',
  'triage',
  'assigned',
  'in_analysis',
  'in_progress',
  'waiting_student',
  'waiting_department',
  'waiting_external',
  'resolved',
  'closed',
  'cancelled',
  'reopened',
];

/** Encerrados para o estudante (não aceitam mensagens nem cancelamento). */
export const FINISHED_STATUSES: ReadonlySet<SupportTicketStatus> = new Set(['resolved', 'closed', 'cancelled']);

export const isActiveStatus = (status: SupportTicketStatus): boolean => !FINISHED_STATUSES.has(status);

/** Situações que a equipe define diretamente. `waiting_student` exige pedido de ação e `resolved`, a solução. */
export const STAFF_SETTABLE_STATUSES: ReadonlySet<SupportTicketStatus> = new Set([
  'triage',
  'assigned',
  'in_analysis',
  'in_progress',
  'waiting_department',
  'waiting_external',
  'closed',
  'cancelled',
]);

/** Textos humanos (também usados nas notificações, que precisam sair prontas do servidor). */
export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  submitted: 'Enviado',
  received: 'Recebido pelo ASA',
  triage: 'Em triagem',
  assigned: 'Encaminhado para a equipe responsável',
  in_analysis: 'Em análise',
  in_progress: 'Em atendimento',
  waiting_student: 'Aguardando você',
  waiting_department: 'Aguardando setor responsável',
  waiting_external: 'Aguardando retorno externo',
  resolved: 'Resolvido',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
  reopened: 'Reaberto',
};

/** Título e descrição pública do evento registrado quando a equipe muda a situação. */
export const STATUS_EVENT_TEXT: Partial<Record<SupportTicketStatus, { title: string; description: string }>> = {
  triage: { title: 'Chamado em triagem', description: 'O ASA está verificando qual equipe deve cuidar da sua solicitação.' },
  assigned: { title: 'Encaminhado para a equipe responsável', description: 'Sua solicitação já está com a equipe que vai cuidar dela.' },
  in_analysis: { title: 'Chamado em análise', description: 'A equipe responsável está verificando sua solicitação.' },
  in_progress: { title: 'Atendimento em andamento', description: 'A equipe já está trabalhando na solução.' },
  waiting_department: { title: 'Aguardando setor responsável', description: 'O ASA consultou outro setor e aguarda o retorno.' },
  waiting_external: { title: 'Aguardando retorno externo', description: 'A solicitação depende de um retorno de fora da instituição.' },
  closed: { title: 'Chamado encerrado', description: 'O atendimento foi finalizado.' },
  cancelled: { title: 'Chamado cancelado', description: 'O chamado foi cancelado pela equipe.' },
};

/** Situações de trabalho ativo depois da triagem. */
const WORKING: ReadonlySet<SupportTicketStatus> = new Set(['assigned', 'in_analysis', 'in_progress', 'waiting_department', 'waiting_external']);

export const completesTriage = (from: SupportTicketStatus, to: SupportTicketStatus): boolean => from === 'triage' && WORKING.has(to);
