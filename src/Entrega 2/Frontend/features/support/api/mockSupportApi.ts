import { ApiClientError } from '../../../services/apiClient';
import type {
  SupportAttachment,
  SupportNotification,
  SupportNotificationKind,
  SupportSlaStatus,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketList,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketSummary,
  SupportUpload,
} from '../../../types/api';

import { MOCK_CATALOG } from './mockCatalog';
import type { SupportApi } from './types';

/**
 * Atendimento de demonstração (EXPO_PUBLIC_USE_MOCK_TICKETS=true): mesmos contratos e regras da API, dados
 * fictícios centralizados aqui. Chamados novos avançam sozinhos (triagem → análise → resposta do ASA) conforme o
 * tempo passa — a evolução é aplicada na leitura, sem timers rodando em segundo plano.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ACTIVE: readonly SupportTicketStatus[] = ['submitted', 'received', 'triage', 'assigned', 'in_analysis', 'in_progress', 'waiting_student', 'waiting_department', 'waiting_external', 'reopened'];
const isActive = (status: SupportTicketStatus) => ACTIVE.includes(status);

interface ScheduledStep {
  at: number;
  apply: (ticket: MockTicket, at: Date) => void;
}

interface MockTicket {
  dto: SupportTicket;
  clientRequestId: string | null;
  slaStartedAt: number;
  slaDueAt: number;
  slaPausedAt: number | null;
  slaCompletedAt: number | null;
  scheduled: ScheduledStep[];
}

interface MockUpload extends SupportUpload {
  used: boolean;
}

export interface MockSupportOptions {
  now?: () => Date;
  /** atraso simulado de rede (0 nos testes) */
  latencyMs?: number;
  /** false → começa sem chamados (estado vazio) */
  seed?: boolean;
}

let sequence = 0;
const nextId = (prefix: string) => {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
};

function notFound(): ApiClientError {
  return new ApiClientError({ kind: 'not_found', status: 404, code: 'NOT_FOUND', message: 'Chamado não encontrado.' });
}

function conflict(message: string, reason: string): ApiClientError {
  return new ApiClientError({ kind: 'unknown', status: 409, code: 'CONFLICT', message, reason });
}

function invalid(message: string, field: string): ApiClientError {
  return new ApiClientError({ kind: 'validation', status: 400, code: 'VALIDATION_ERROR', message, details: [{ field, message }] });
}

const iso = (ms: number) => new Date(ms).toISOString();

function event(type: SupportTicketEvent['type'], title: string, at: number, extra: Partial<SupportTicketEvent> = {}): SupportTicketEvent {
  return { id: nextId('evt'), type, title, description: null, createdAt: iso(at), actorType: 'agent', actorName: 'Atendimento ASA', fromStatus: null, toStatus: null, details: [], ...extra };
}

function message(senderType: 'student' | 'agent', senderName: string, content: string, at: number, readAt: number | null, attachments: SupportAttachment[] = []): SupportTicketMessage {
  return { id: nextId('msg'), senderType, senderName, content, createdAt: iso(at), readAt: readAt === null ? null : iso(readAt), attachments };
}

function file(name: string, mimeType: string, sizeBytes: number, at: number, by: 'student' | 'agent', messageId: string | null = null): SupportAttachment {
  return { id: nextId('att'), name, mimeType, sizeBytes, createdAt: iso(at), uploadedBy: by, uploaderName: by === 'student' ? 'Você' : 'Equipe ASA', messageId };
}

function categoryLabels(categoryId: string, subcategoryId: string | null) {
  const category = MOCK_CATALOG.categories.find((item) => item.id === categoryId);
  return { category, categoryLabel: category?.label ?? 'Outro', subcategoryLabel: category?.subcategories.find((item) => item.id === subcategoryId)?.label ?? null };
}

function slaStatus(ticket: MockTicket, now: number): SupportSlaStatus {
  if (ticket.slaCompletedAt !== null) return 'completed';
  if (ticket.slaPausedAt !== null) return 'paused';
  const total = Math.max(1, ticket.slaDueAt - ticket.slaStartedAt);
  const remaining = ticket.slaDueAt - now;
  if (remaining <= 0) return 'overdue';
  if (remaining <= total * 0.25 || remaining <= 8 * HOUR) return 'near_deadline';
  if (remaining <= total * 0.5) return 'attention';
  return 'on_track';
}

/** Recalcula os campos derivados (as mesmas regras do servidor). */
function refresh(ticket: MockTicket, now: number): SupportTicket {
  const dto = ticket.dto;
  const lastEvent = dto.events[dto.events.length - 1];
  const resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt).getTime() : null;
  const deadline = dto.status === 'resolved' && resolvedAt !== null ? resolvedAt + MOCK_CATALOG.limits.reopenWindowDays * DAY : null;
  dto.lastActivity = lastEvent ? { title: lastEvent.title, createdAt: lastEvent.createdAt } : null;
  dto.unreadCount = dto.messages.filter((item) => item.senderType === 'agent' && !item.readAt).length;
  dto.requiresStudentAction = dto.status === 'waiting_student';
  if (dto.status !== 'waiting_student') dto.pendingAction = null;
  dto.attachments = [...dto.attachments.filter((item) => !item.messageId), ...dto.messages.flatMap((item) => item.attachments)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  dto.sla = {
    status: slaStatus(ticket, now),
    targetBusinessDays: dto.sla.targetBusinessDays,
    startedAt: iso(ticket.slaStartedAt),
    dueAt: iso(ticket.slaDueAt),
    pausedAt: ticket.slaPausedAt === null ? null : iso(ticket.slaPausedAt),
    resumedAt: dto.sla.resumedAt,
    completedAt: ticket.slaCompletedAt === null ? null : iso(ticket.slaCompletedAt),
  };
  dto.canReply = isActive(dto.status);
  dto.canCancel = isActive(dto.status);
  dto.canReopen = deadline !== null && deadline > now;
  dto.canRate = (dto.status === 'resolved' || dto.status === 'closed') && !dto.rating;
  dto.reopenDeadline = deadline === null ? null : iso(deadline);
  return dto;
}

interface SeedInput {
  protocol: string;
  subject: string;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  status: SupportTicketStatus;
  createdAt: number;
  updatedAt: number;
  team: string;
  priority?: SupportTicket['priority'];
  events: SupportTicketEvent[];
  messages?: SupportTicketMessage[];
  attachments?: SupportAttachment[];
  pendingAction?: SupportTicket['pendingAction'];
  resolution?: string;
  resolvedAt?: number;
  closedAt?: number;
  cancelledAt?: number;
  rating?: SupportTicket['rating'];
  slaPausedAt?: number;
}

function build(input: SeedInput, now: number): MockTicket {
  const { category, categoryLabel, subcategoryLabel } = categoryLabels(input.categoryId, input.subcategoryId);
  const days = category?.slaBusinessDays ?? 3;
  const dto: SupportTicket = {
    id: nextId('ticket'),
    protocol: input.protocol,
    subject: input.subject,
    categoryId: input.categoryId,
    categoryLabel,
    subcategoryId: input.subcategoryId,
    subcategoryLabel,
    status: input.status,
    priority: input.priority ?? 'normal',
    createdAt: iso(input.createdAt),
    updatedAt: iso(input.updatedAt),
    lastActivity: null,
    unreadCount: 0,
    requiresStudentAction: false,
    sla: { status: 'on_track', targetBusinessDays: days, startedAt: iso(input.createdAt), dueAt: iso(input.createdAt), pausedAt: null, resumedAt: null, completedAt: null },
    description: input.description,
    channel: 'app',
    assignedTeam: input.team,
    pendingAction: input.pendingAction ?? null,
    resolution: input.resolution ?? null,
    resolvedAt: input.resolvedAt ? iso(input.resolvedAt) : null,
    closedAt: input.closedAt ? iso(input.closedAt) : null,
    cancelledAt: input.cancelledAt ? iso(input.cancelledAt) : null,
    reopenedCount: 0,
    rating: input.rating ?? null,
    canReply: false,
    canCancel: false,
    canReopen: false,
    canRate: false,
    reopenDeadline: null,
    events: input.events,
    messages: input.messages ?? [],
    attachments: input.attachments ?? [],
  };
  const finishedAt = input.resolvedAt ?? input.closedAt ?? input.cancelledAt ?? null;
  const ticket: MockTicket = {
    dto,
    clientRequestId: null,
    slaStartedAt: input.createdAt,
    slaDueAt: input.createdAt + days * DAY,
    slaPausedAt: input.slaPausedAt ?? null,
    slaCompletedAt: finishedAt,
    scheduled: [],
  };
  refresh(ticket, now);
  return ticket;
}

const STUDENT = 'Você';
const created = (at: number, category: string, subcategory: string | null) =>
  event('ticket_created', 'Chamado aberto', at, { actorType: 'student', actorName: STUDENT, toStatus: 'submitted', details: [{ label: 'Categoria', value: category }, ...(subcategory ? [{ label: 'Tipo', value: subcategory }] : [])] });
const received = (at: number, days: number) =>
  event('ticket_received', 'Solicitação recebida pelo ASA', at, {
    actorType: 'system',
    description: 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.',
    fromStatus: 'submitted',
    toStatus: 'received',
    details: [
      { label: 'Equipe responsável', value: 'Atendimento ASA' },
      { label: 'Prazo de resposta', value: `até ${days} ${days === 1 ? 'dia útil' : 'dias úteis'}` },
    ],
  });
const forwarded = (at: number, team: string, from: SupportTicketStatus) =>
  event('department_forwarded', `Encaminhado para ${team}`, at, { actorType: 'department', actorName: team, description: 'A equipe responsável vai cuidar da sua solicitação.', fromStatus: from, toStatus: 'assigned', details: [{ label: 'Responsável', value: team }] });

/** Cenários: recém-aberto, triagem, análise, aguardando você, aguardando setor, atrasado, mensagens novas, anexos, resolvido. */
function seedTickets(now: number): MockTicket[] {
  const year = new Date(now).getFullYear();
  const protocol = (n: number) => `ASA-${year}-${String(n).padStart(5, '0')}`;
  const proofRequest = message('agent', 'Financeiro', 'Olá! Para continuarmos a análise, precisamos do comprovante de pagamento da parcela de setembro. Pode anexar aqui?', now - 40 * MIN, null);
  const tiFirst = message('agent', 'Tecnologia da Informação', 'Recebemos sua solicitação e já estamos verificando o seu cadastro no ambiente virtual.', now - 2 * HOUR, null);
  const tiSecond = message('agent', 'Tecnologia da Informação', 'Identificamos uma inconsistência no seu cadastro e já estamos corrigindo. Avisaremos por aqui assim que o acesso for liberado.', now - 35 * MIN, null);
  const reviewOpinion = file('parecer-revisao-prova1.pdf', 'application/pdf', 284_000, now - 1 * DAY - 2 * HOUR, 'agent');
  const reviewMessage = message('agent', 'Coordenação de Curso', 'Segue o parecer da revisão. A nota já foi atualizada no portal.', now - 1 * DAY - 2 * HOUR, now - 1 * DAY, [reviewOpinion]);
  reviewOpinion.messageId = reviewMessage.id;

  return [
    build({
      protocol: protocol(426),
      subject: 'Inclusão de disciplina optativa',
      description: 'Gostaria de incluir a optativa de Ciência de Dados na minha grade deste semestre. A turma de quinta à noite ainda tem vagas?',
      categoryId: 'enrollment',
      subcategoryId: 'add_drop',
      status: 'received',
      createdAt: now - 3 * MIN,
      updatedAt: now - 3 * MIN,
      team: 'Atendimento ASA',
      events: [created(now - 3 * MIN, 'Matrícula', 'Inclusão ou exclusão de disciplina'), received(now - 3 * MIN, 2)],
    }, now),
    build({
      protocol: protocol(425),
      subject: 'Dúvida sobre a rematrícula do próximo semestre',
      description: 'Não encontrei a opção de rematrícula no portal. Preciso fazer algo antes do prazo?',
      categoryId: 'enrollment',
      subcategoryId: 'reenrollment',
      status: 'triage',
      createdAt: now - 25 * MIN,
      updatedAt: now - 10 * MIN,
      team: 'Atendimento ASA',
      events: [
        created(now - 25 * MIN, 'Matrícula', 'Rematrícula'),
        received(now - 25 * MIN, 2),
        event('status_changed', 'Chamado em triagem', now - 10 * MIN, { description: 'O ASA está verificando qual equipe deve cuidar da sua solicitação.', fromStatus: 'received', toStatus: 'triage' }),
      ],
    }, now),
    build({
      protocol: protocol(421),
      subject: 'Solicitação de declaração de matrícula',
      description: 'Preciso de uma declaração de matrícula atualizada para apresentar no meu estágio, de preferência com o horário das aulas.',
      categoryId: 'documents',
      subcategoryId: 'enrollment_certificate',
      status: 'in_analysis',
      createdAt: now - 70 * MIN,
      updatedAt: now - 18 * MIN,
      team: 'Secretaria Acadêmica',
      events: [
        created(now - 70 * MIN, 'Documentos', 'Declaração de matrícula'),
        received(now - 70 * MIN, 3),
        event('ticket_triaged', 'Triagem concluída', now - 52 * MIN, { description: 'Sua solicitação já está com a equipe que vai cuidar dela.', fromStatus: 'triage', toStatus: 'assigned' }),
        forwarded(now - 52 * MIN, 'Secretaria Acadêmica', 'triage'),
        event('status_changed', 'Chamado em análise', now - 18 * MIN, { actorName: 'Secretaria Acadêmica', description: 'A equipe responsável está verificando sua solicitação.', fromStatus: 'assigned', toStatus: 'in_analysis' }),
      ],
    }, now),
    build({
      protocol: protocol(418),
      subject: 'Pagamento ainda não consta no sistema',
      description: 'Paguei o boleto da parcela de setembro no dia 2, mas o portal ainda mostra a parcela em aberto.',
      categoryId: 'financial',
      subcategoryId: 'unidentified_payment',
      status: 'waiting_student',
      createdAt: now - 1 * DAY - 3 * HOUR,
      updatedAt: now - 40 * MIN,
      team: 'Financeiro',
      slaPausedAt: now - 40 * MIN,
      pendingAction: { title: 'Comprovante de pagamento', description: 'Envie o comprovante de pagamento da parcela de setembro para continuarmos sua solicitação.', requestedAt: iso(now - 40 * MIN), expectsAttachment: true },
      messages: [proofRequest],
      events: [
        created(now - 1 * DAY - 3 * HOUR, 'Financeiro', 'Pagamento não identificado'),
        received(now - 1 * DAY - 3 * HOUR, 2),
        forwarded(now - 1 * DAY - 1 * HOUR, 'Financeiro', 'received'),
        event('status_changed', 'Chamado em análise', now - 22 * HOUR, { actorName: 'Financeiro', description: 'A equipe responsável está verificando sua solicitação.', fromStatus: 'assigned', toStatus: 'in_analysis' }),
        event('message_received', 'Nova mensagem de Financeiro', now - 40 * MIN, { actorName: 'Financeiro' }),
        event('student_action_required', 'Precisamos de uma informação sua', now - 40 * MIN, { actorName: 'Financeiro', description: 'Envie o comprovante de pagamento da parcela de setembro para continuarmos sua solicitação.', fromStatus: 'in_analysis', toStatus: 'waiting_student', details: [{ label: 'O que enviar', value: 'Comprovante de pagamento' }] }),
      ],
    }, now),
    build({
      protocol: protocol(410),
      subject: 'Não consigo acessar o ambiente virtual',
      description: 'Desde segunda-feira o ambiente virtual mostra "usuário sem disciplinas" e não consigo ver as atividades.',
      categoryId: 'systems_access',
      subcategoryId: 'lms',
      status: 'in_progress',
      priority: 'high',
      createdAt: now - 2 * DAY - 5 * HOUR,
      updatedAt: now - 35 * MIN,
      team: 'Tecnologia da Informação',
      messages: [tiFirst, tiSecond],
      events: [
        created(now - 2 * DAY - 5 * HOUR, 'Acesso aos sistemas', 'Ambiente virtual de aprendizagem'),
        received(now - 2 * DAY - 5 * HOUR, 1),
        forwarded(now - 2 * DAY, 'Tecnologia da Informação', 'received'),
        event('status_changed', 'Atendimento em andamento', now - 1 * DAY, { actorName: 'Tecnologia da Informação', description: 'A equipe já está trabalhando na solução.', fromStatus: 'assigned', toStatus: 'in_progress' }),
        event('message_received', 'Nova mensagem de Tecnologia da Informação', now - 2 * HOUR, { actorName: 'Tecnologia da Informação' }),
        event('message_received', 'Nova mensagem de Tecnologia da Informação', now - 35 * MIN, { actorName: 'Tecnologia da Informação' }),
      ],
    }, now),
    build({
      protocol: protocol(402),
      subject: 'Validação das horas de estágio',
      description: 'Enviei o relatório final do estágio e preciso que as 120 horas sejam validadas antes do fechamento do semestre.',
      categoryId: 'internship',
      subcategoryId: 'hours',
      status: 'waiting_department',
      createdAt: now - 4 * DAY,
      updatedAt: now - 1 * DAY - 4 * HOUR,
      team: 'Carreiras e Estágios',
      attachments: [file('relatorio-final-estagio.pdf', 'application/pdf', 1_240_000, now - 4 * DAY, 'student')],
      events: [
        created(now - 4 * DAY, 'Estágio', 'Validação de horas'),
        event('file_uploaded', 'Arquivo anexado', now - 4 * DAY, { actorType: 'student', actorName: STUDENT, description: 'relatorio-final-estagio.pdf' }),
        received(now - 4 * DAY, 3),
        forwarded(now - 3 * DAY, 'Carreiras e Estágios', 'received'),
        event('status_changed', 'Aguardando setor responsável', now - 1 * DAY - 4 * HOUR, { actorName: 'Carreiras e Estágios', description: 'O ASA consultou outro setor e aguarda o retorno.', fromStatus: 'assigned', toStatus: 'waiting_department', details: [{ label: 'Observação', value: 'Consultamos a coordenação do curso para confirmar a carga horária.' }] }),
      ],
    }, now),
    build({
      protocol: protocol(395),
      subject: 'Revisão da Prova 1 de Banco de Dados',
      description: 'Gostaria de pedir a revisão da questão 4 da Prova 1. Acredito que a resposta está de acordo com o gabarito divulgado.',
      categoryId: 'academic',
      subcategoryId: 'exam_review',
      status: 'resolved',
      createdAt: now - 5 * DAY,
      updatedAt: now - 1 * DAY,
      team: 'Coordenação de Curso',
      attachments: [file('prova1-banco-de-dados.pdf', 'application/pdf', 1_820_000, now - 5 * DAY, 'student')],
      messages: [reviewMessage],
      resolution: 'A coordenação revisou a questão 4 da Prova 1. A nota foi ajustada de 6,5 para 7,0 e já aparece no portal do aluno.',
      resolvedAt: now - 1 * DAY,
      events: [
        created(now - 5 * DAY, 'Acadêmico', 'Revisão de prova'),
        event('file_uploaded', 'Arquivo anexado', now - 5 * DAY, { actorType: 'student', actorName: STUDENT, description: 'prova1-banco-de-dados.pdf' }),
        received(now - 5 * DAY, 3),
        forwarded(now - 4 * DAY, 'Coordenação de Curso', 'received'),
        event('status_changed', 'Chamado em análise', now - 3 * DAY, { actorName: 'Coordenação de Curso', description: 'A equipe responsável está verificando sua solicitação.', fromStatus: 'assigned', toStatus: 'in_analysis' }),
        event('message_received', 'Nova mensagem de Coordenação de Curso', now - 1 * DAY - 2 * HOUR, { actorName: 'Coordenação de Curso' }),
        event('file_uploaded', 'Arquivo disponibilizado pelo ASA', now - 1 * DAY - 2 * HOUR, { actorName: 'Coordenação de Curso', description: 'parecer-revisao-prova1.pdf' }),
        event('ticket_resolved', 'Solicitação resolvida', now - 1 * DAY, { actorName: 'Coordenação de Curso', description: 'A coordenação revisou a questão 4 da Prova 1. A nota foi ajustada de 6,5 para 7,0 e já aparece no portal do aluno.', fromStatus: 'in_analysis', toStatus: 'resolved' }),
      ],
    }, now),
    build({
      protocol: protocol(377),
      subject: 'Wi-Fi instável no laboratório 3',
      description: 'A conexão cai a cada poucos minutos durante as aulas práticas no laboratório 3.',
      categoryId: 'infrastructure',
      subcategoryId: 'rooms',
      status: 'closed',
      createdAt: now - 26 * DAY,
      updatedAt: now - 18 * DAY,
      team: 'Infraestrutura',
      resolution: 'O ponto de acesso do laboratório 3 foi substituído e a rede foi testada durante uma aula prática.',
      resolvedAt: now - 20 * DAY,
      closedAt: now - 18 * DAY,
      rating: { rating: 5, comment: 'Resolveram rápido!', createdAt: iso(now - 19 * DAY) },
      events: [
        created(now - 26 * DAY, 'Infraestrutura', 'Salas e laboratórios'),
        received(now - 26 * DAY, 5),
        forwarded(now - 25 * DAY, 'Infraestrutura', 'received'),
        event('ticket_resolved', 'Solicitação resolvida', now - 20 * DAY, { actorName: 'Infraestrutura', description: 'O ponto de acesso do laboratório 3 foi substituído e a rede foi testada durante uma aula prática.', fromStatus: 'assigned', toStatus: 'resolved' }),
        event('rating_submitted', 'Atendimento avaliado', now - 19 * DAY, { actorType: 'student', actorName: STUDENT, details: [{ label: 'Nota', value: '5 de 5' }] }),
        event('ticket_closed', 'Chamado encerrado', now - 18 * DAY, { actorName: 'Infraestrutura', description: 'O atendimento foi finalizado.', fromStatus: 'resolved', toStatus: 'closed' }),
      ],
    }, now),
    build({
      protocol: protocol(369),
      subject: 'Agendamento de conversa com o ASA',
      description: 'Gostaria de conversar sobre a organização dos meus estudos neste semestre.',
      categoryId: 'asa_service',
      subcategoryId: 'appointment',
      status: 'cancelled',
      createdAt: now - 12 * DAY,
      updatedAt: now - 10 * DAY,
      team: 'Atendimento ASA',
      cancelledAt: now - 10 * DAY,
      events: [
        created(now - 12 * DAY, 'Atendimento ASA', 'Agendamento com o ASA'),
        received(now - 12 * DAY, 2),
        event('ticket_cancelled', 'Chamado cancelado pelo estudante', now - 10 * DAY, { actorType: 'student', actorName: STUDENT, description: 'Consegui conversar com o ASA presencialmente.', fromStatus: 'received', toStatus: 'cancelled' }),
      ],
    }, now),
  ];
}

function seedNotifications(tickets: MockTicket[], now: number): SupportNotification[] {
  const find = (subject: string) => tickets.find((ticket) => ticket.dto.subject === subject)?.dto;
  const items: [SupportTicket | undefined, SupportNotificationKind, string, string, number, boolean][] = [
    [find('Pagamento ainda não consta no sistema'), 'action_required', 'O ASA precisa de você', 'Comprovante de pagamento', now - 40 * MIN, false],
    [find('Não consigo acessar o ambiente virtual'), 'new_message', 'Nova mensagem de Tecnologia da Informação', 'Identificamos uma inconsistência no seu cadastro e já estamos corrigindo.', now - 35 * MIN, false],
    [find('Solicitação de declaração de matrícula'), 'status_changed', 'Chamado atualizado', 'Agora ele está: Em análise.', now - 18 * MIN, true],
    [find('Revisão da Prova 1 de Banco de Dados'), 'ticket_resolved', 'Seu chamado foi resolvido', 'Veja a solução e conte como foi o atendimento.', now - 1 * DAY, true],
  ];
  return items
    .filter((item): item is [SupportTicket, SupportNotificationKind, string, string, number, boolean] => Boolean(item[0]))
    .map(([ticket, kind, title, body, at, read]) => ({ id: nextId('ntf'), ticketId: ticket.id, protocol: ticket.protocol, kind, title, body, createdAt: iso(at), readAt: read ? iso(at) : null }));
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function summary(dto: SupportTicket): SupportTicketSummary {
  const { id, protocol, subject, categoryId, categoryLabel, subcategoryId, subcategoryLabel, status, priority, createdAt, updatedAt, lastActivity, unreadCount, requiresStudentAction, sla } = dto;
  return clone({ id, protocol, subject, categoryId, categoryLabel, subcategoryId, subcategoryLabel, status, priority, createdAt, updatedAt, lastActivity, unreadCount, requiresStudentAction, sla });
}

export function createMockSupportApi(options: MockSupportOptions = {}): SupportApi {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 350;
  const start = now().getTime();
  const tickets: MockTicket[] = options.seed === false ? [] : seedTickets(start);
  const notifications: SupportNotification[] = options.seed === false ? [] : seedNotifications(tickets, start);
  const uploads = new Map<string, MockUpload>();
  let protocolCounter = 427;

  const wait = () => (latency > 0 ? new Promise<void>((resolve) => setTimeout(resolve, latency)) : Promise.resolve());

  const notify = (ticket: MockTicket, kind: SupportNotificationKind, title: string, body: string, at: number) => {
    notifications.unshift({ id: nextId('ntf'), ticketId: ticket.dto.id, protocol: ticket.dto.protocol, kind, title, body, createdAt: iso(at), readAt: null });
  };

  const touch = (ticket: MockTicket, at: number, status?: SupportTicketStatus) => {
    if (status) ticket.dto.status = status;
    ticket.dto.updatedAt = iso(at);
  };

  /** Aplica a evolução agendada (triagem, análise, respostas do ASA) cujo horário já passou. */
  const advance = (ticket: MockTicket) => {
    const current = now().getTime();
    const due = ticket.scheduled.filter((step) => step.at <= current).sort((a, b) => a.at - b.at);
    ticket.scheduled = ticket.scheduled.filter((step) => step.at > current);
    for (const step of due) if (isActive(ticket.dto.status)) step.apply(ticket, new Date(step.at));
    return refresh(ticket, current);
  };

  const findTicket = (id: string) => {
    const ticket = tickets.find((item) => item.dto.id === id);
    if (!ticket) throw notFound();
    advance(ticket);
    return ticket;
  };

  const scheduleProgress = (ticket: MockTicket, from: number) => {
    const team = MOCK_CATALOG.categories.find((item) => item.id === ticket.dto.categoryId)?.defaultTeam ?? 'Atendimento ASA';
    ticket.scheduled.push(
      {
        at: from + 20_000,
        apply: (target, at) => {
          target.dto.events.push(event('status_changed', 'Chamado em triagem', at.getTime(), { description: 'O ASA está verificando qual equipe deve cuidar da sua solicitação.', fromStatus: target.dto.status, toStatus: 'triage' }));
          touch(target, at.getTime(), 'triage');
          notify(target, 'status_changed', 'Chamado atualizado', 'Agora ele está: Em triagem.', at.getTime());
        },
      },
      {
        at: from + 45_000,
        apply: (target, at) => {
          target.dto.assignedTeam = team;
          target.dto.events.push(event('ticket_triaged', 'Triagem concluída', at.getTime(), { description: 'Sua solicitação já está com a equipe que vai cuidar dela.', fromStatus: 'triage', toStatus: 'assigned' }));
          target.dto.events.push(forwarded(at.getTime(), team, 'triage'));
          target.dto.events.push(event('status_changed', 'Chamado em análise', at.getTime(), { actorName: team, description: 'A equipe responsável está verificando sua solicitação.', fromStatus: 'assigned', toStatus: 'in_analysis' }));
          touch(target, at.getTime(), 'in_analysis');
          notify(target, 'status_changed', 'Chamado atualizado', 'Agora ele está: Em análise.', at.getTime());
        },
      },
      {
        at: from + 80_000,
        apply: (target, at) => {
          target.dto.messages.push(message('agent', team, 'Olá! Já estamos analisando sua solicitação. Se precisarmos de algo, avisaremos por aqui.', at.getTime(), null));
          target.dto.events.push(event('message_received', `Nova mensagem de ${team}`, at.getTime(), { actorName: team }));
          touch(target, at.getTime());
          notify(target, 'new_message', `Nova mensagem de ${team}`, 'Já estamos analisando sua solicitação.', at.getTime());
        },
      },
    );
  };

  const takeUploads = (ids: string[] | undefined, at: number, messageId: string | null): SupportAttachment[] => {
    const result: SupportAttachment[] = [];
    for (const id of ids ?? []) {
      const upload = uploads.get(id);
      if (!upload || upload.used) throw invalid('Um dos arquivos expirou ou não está mais disponível. Envie-o novamente.', 'attachmentIds');
      upload.used = true;
      result.push({ id: upload.id, name: upload.name, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes, createdAt: iso(at), uploadedBy: 'student', uploaderName: STUDENT, messageId });
    }
    return result;
  };

  const api: SupportApi = {
    mode: 'mock',
    async getCatalog() {
      await wait();
      return clone(MOCK_CATALOG);
    },
    async getOverview() {
      await wait();
      const current = now().getTime();
      const views = tickets.map(advance);
      const active = views.filter((dto) => isActive(dto.status));
      const rank = (dto: SupportTicket) => (dto.status === 'waiting_student' ? 2 : dto.unreadCount > 0 ? 1 : 0);
      const ranked = [...active].sort((a, b) => rank(b) - rank(a) || b.updatedAt.localeCompare(a.updatedAt));
      const recentResolved = views.filter((dto) => dto.status === 'resolved' && dto.resolvedAt && current - new Date(dto.resolvedAt).getTime() <= 3 * DAY).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const highlight = ranked[0] ?? recentResolved ?? null;
      return {
        activeCount: active.length,
        waitingStudentCount: active.filter((dto) => dto.status === 'waiting_student').length,
        unreadMessagesCount: active.reduce((sum, dto) => sum + dto.unreadCount, 0),
        unreadNotificationsCount: notifications.filter((item) => !item.readAt).length,
        highlight: highlight ? summary(highlight) : null,
      };
    },
    async listTickets(params) {
      await wait();
      const views = tickets.map(advance);
      const term = (params.search ?? '').trim().replace(/^#/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const filtered = views
        .filter((dto) => !params.statuses || params.statuses.length === 0 || params.statuses.includes(dto.status))
        .filter((dto) => !term || normalize(`${dto.protocol} ${dto.subject} ${dto.categoryLabel} ${dto.subcategoryLabel ?? ''}`).includes(term))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const offset = params.cursor ? Number(params.cursor) || 0 : 0;
      const limit = params.limit ?? 20;
      const page = filtered.slice(offset, offset + limit);
      const byStatus: Partial<Record<SupportTicketStatus, number>> = {};
      for (const dto of views) byStatus[dto.status] = (byStatus[dto.status] ?? 0) + 1;
      const active = views.filter((dto) => isActive(dto.status)).length;
      const counts: SupportTicketList['counts'] = { all: views.length, active, waitingStudent: byStatus.waiting_student ?? 0, finished: views.length - active, byStatus };
      return { items: page.map(summary), nextCursor: offset + limit < filtered.length ? String(offset + limit) : null, counts };
    },
    async getTicket(id) {
      await wait();
      return clone(findTicket(id).dto);
    },
    async createTicket(body) {
      await wait();
      const existing = tickets.find((item) => item.clientRequestId === body.clientRequestId);
      if (existing) return clone(advance(existing));
      const { category, categoryLabel, subcategoryLabel } = categoryLabels(body.categoryId, body.subcategoryId ?? null);
      if (!category) throw invalid('Categoria inválida.', 'categoryId');
      const at = now().getTime();
      const attachments = takeUploads(body.attachmentIds, at, null);
      protocolCounter += 1;
      const ticket = build(
        {
          protocol: `ASA-${new Date(at).getFullYear()}-${String(protocolCounter).padStart(5, '0')}`,
          subject: body.subject.trim(),
          description: body.description.trim(),
          categoryId: category.id,
          subcategoryId: body.subcategoryId ?? null,
          status: 'received',
          createdAt: at,
          updatedAt: at,
          team: 'Atendimento ASA',
          attachments,
          events: [
            created(at, categoryLabel, subcategoryLabel),
            ...attachments.map((item) => event('file_uploaded', 'Arquivo anexado', at, { actorType: 'student', actorName: STUDENT, description: item.name })),
            received(at, category.slaBusinessDays),
          ],
        },
        at,
      );
      ticket.clientRequestId = body.clientRequestId;
      scheduleProgress(ticket, at);
      tickets.unshift(ticket);
      notify(ticket, 'ticket_received', 'Chamado recebido', `"${ticket.dto.subject}" entrou na fila do ASA. Avisaremos a cada atualização.`, at);
      return clone(refresh(ticket, at));
    },
    async sendMessage(ticketId, body) {
      await wait();
      const ticket = findTicket(ticketId);
      if (ticket.dto.messages.some((item) => item.id === body.clientMessageId)) return clone(ticket.dto);
      if (!isActive(ticket.dto.status)) throw conflict('Este chamado não recebe novas mensagens.', 'ticket_not_open');
      const at = now().getTime();
      const sent = message('student', STUDENT, body.content.trim(), at, null);
      sent.id = body.clientMessageId;
      sent.attachments = takeUploads(body.attachmentIds, at, sent.id);
      ticket.dto.messages.push(sent);
      ticket.dto.events.push(event('message_sent', 'Mensagem enviada', at, { actorType: 'student', actorName: STUDENT }));
      for (const item of sent.attachments) ticket.dto.events.push(event('file_uploaded', 'Arquivo anexado', at, { actorType: 'student', actorName: STUDENT, description: item.name }));
      const team = ticket.dto.assignedTeam;
      if (ticket.dto.status === 'waiting_student') {
        ticket.dto.events.push(event('student_response_received', 'Resposta enviada ao ASA', at, { actorType: 'student', actorName: STUDENT, description: 'O atendimento continua a partir da sua resposta.', fromStatus: 'waiting_student', toStatus: 'in_analysis' }));
        if (ticket.slaPausedAt !== null) {
          ticket.slaDueAt += at - ticket.slaPausedAt;
          ticket.slaPausedAt = null;
          ticket.dto.sla.resumedAt = iso(at);
        }
        touch(ticket, at, 'in_analysis');
        // Demonstração do fluxo completo: o ASA confirma e resolve pouco depois.
        ticket.scheduled.push(
          {
            at: at + 25_000,
            apply: (target, when) => {
              target.dto.messages.push(message('agent', team, 'Recebemos, obrigado! Já estamos conferindo as informações.', when.getTime(), null));
              target.dto.events.push(event('message_received', `Nova mensagem de ${team}`, when.getTime(), { actorName: team }));
              touch(target, when.getTime());
              notify(target, 'new_message', `Nova mensagem de ${team}`, 'Recebemos, obrigado!', when.getTime());
            },
          },
          {
            at: at + 60_000,
            apply: (target, when) => {
              const resolution = 'Conferimos as informações enviadas e sua solicitação foi concluída. Se algo ainda não estiver certo, é só reabrir o chamado.';
              target.dto.resolution = resolution;
              target.dto.resolvedAt = iso(when.getTime());
              target.slaCompletedAt = when.getTime();
              target.dto.events.push(event('ticket_resolved', 'Solicitação resolvida', when.getTime(), { actorName: team, description: resolution, fromStatus: target.dto.status, toStatus: 'resolved' }));
              touch(target, when.getTime(), 'resolved');
              notify(target, 'ticket_resolved', 'Seu chamado foi resolvido', 'Veja a solução e conte como foi o atendimento.', when.getTime());
            },
          },
        );
      } else {
        touch(ticket, at);
      }
      return clone(refresh(ticket, at));
    },
    async markRead(ticketId) {
      await wait();
      const ticket = findTicket(ticketId);
      const at = iso(now().getTime());
      for (const item of ticket.dto.messages) if (item.senderType === 'agent' && !item.readAt) item.readAt = at;
      for (const item of notifications) if (item.ticketId === ticketId && !item.readAt) item.readAt = at;
      return clone(refresh(ticket, now().getTime()));
    },
    async cancelTicket(ticketId, body) {
      await wait();
      const ticket = findTicket(ticketId);
      if (!isActive(ticket.dto.status)) throw conflict('Este chamado não pode mais ser cancelado.', 'cancel_not_allowed');
      const at = now().getTime();
      ticket.dto.events.push(event('ticket_cancelled', 'Chamado cancelado pelo estudante', at, { actorType: 'student', actorName: STUDENT, description: body.reason?.trim() || null, fromStatus: ticket.dto.status, toStatus: 'cancelled' }));
      ticket.dto.cancelledAt = iso(at);
      ticket.slaCompletedAt = at;
      ticket.scheduled = [];
      touch(ticket, at, 'cancelled');
      return clone(refresh(ticket, at));
    },
    async reopenTicket(ticketId, body) {
      await wait();
      const ticket = findTicket(ticketId);
      if (!ticket.dto.canReopen) throw conflict('Somente chamados resolvidos podem ser reabertos.', 'reopen_not_allowed');
      const at = now().getTime();
      ticket.dto.events.push(event('ticket_reopened', 'Chamado reaberto pelo estudante', at, { actorType: 'student', actorName: STUDENT, description: body.reason.trim(), fromStatus: 'resolved', toStatus: 'reopened', details: ticket.dto.resolution ? [{ label: 'Resolução anterior', value: ticket.dto.resolution }] : [] }));
      ticket.dto.messages.push(message('student', STUDENT, body.reason.trim(), at, null));
      ticket.dto.reopenedCount += 1;
      ticket.slaStartedAt = at;
      ticket.slaDueAt = at + ticket.dto.sla.targetBusinessDays * DAY;
      ticket.slaCompletedAt = null;
      ticket.slaPausedAt = null;
      touch(ticket, at, 'reopened');
      return clone(refresh(ticket, at));
    },
    async rateTicket(ticketId, body) {
      await wait();
      const ticket = findTicket(ticketId);
      if (!ticket.dto.canRate) throw conflict(ticket.dto.rating ? 'Você já avaliou este atendimento.' : 'A avaliação fica disponível depois que o chamado é resolvido.', ticket.dto.rating ? 'already_rated' : 'rating_not_allowed');
      const at = now().getTime();
      ticket.dto.rating = { rating: body.rating, comment: body.comment?.trim() || null, createdAt: iso(at) };
      ticket.dto.events.push(event('rating_submitted', 'Atendimento avaliado', at, { actorType: 'student', actorName: STUDENT, details: [{ label: 'Nota', value: `${body.rating} de 5` }] }));
      touch(ticket, at);
      return clone(refresh(ticket, at));
    },
    async uploadFile(body) {
      await wait();
      const limits = MOCK_CATALOG.limits;
      if (!limits.allowedMimeTypes.includes(body.mimeType)) throw invalid('Tipo de arquivo não permitido. Envie PDF, imagem ou documento.', 'mimeType');
      const sizeBytes = Math.floor((body.contentBase64.length * 3) / 4);
      if (sizeBytes > limits.maxAttachmentBytes) throw invalid('O arquivo é maior que 5 MB.', 'contentBase64');
      const at = now().getTime();
      const upload: MockUpload = { id: nextId('upl'), name: body.name, mimeType: body.mimeType, sizeBytes, createdAt: iso(at), expiresAt: iso(at + DAY), used: false };
      uploads.set(upload.id, upload);
      const { used: _used, ...result } = upload;
      return result;
    },
    async deleteUpload(uploadId) {
      await wait();
      uploads.delete(uploadId);
    },
    async getAttachmentLink() {
      await wait();
      return null;
    },
    async getNotifications(limit = 20) {
      await wait();
      tickets.forEach(advance);
      return { items: clone(notifications.slice(0, limit)), unreadCount: notifications.filter((item) => !item.readAt).length };
    },
    async markNotificationsRead(ids) {
      await wait();
      const at = iso(now().getTime());
      for (const item of notifications) if (!item.readAt && (!ids || ids.length === 0 || ids.includes(item.id))) item.readAt = at;
      return { items: clone(notifications.slice(0, 20)), unreadCount: notifications.filter((item) => !item.readAt).length };
    },
  };
  return api;
}
