import type {
  AsaDashboard,
  AuditEventView,
  StudentContext,
  SupportCatalog,
  SupportStaffTicket,
  SupportTicketList,
  SupportTicketSummary,
} from '@/types/api';

/** Dados fixos para os testes da Operação ASA (datas fixas: nada depende do relógio). */

export const fixedSla: SupportTicketSummary['sla'] = {
  status: 'near_deadline',
  targetBusinessDays: 3,
  startedAt: '2026-10-12T12:00:00.000Z',
  dueAt: '2026-10-15T18:00:00.000Z',
  pausedAt: null,
  resumedAt: null,
  completedAt: null,
};

export function makeSummary(overrides: Partial<SupportTicketSummary> = {}): SupportTicketSummary {
  return {
    id: 't-1',
    protocol: 'ASA-2026-000123',
    subject: 'Boleto da mensalidade com valor errado',
    categoryId: 'financial',
    categoryLabel: 'Financeiro',
    subcategoryId: null,
    subcategoryLabel: null,
    status: 'received',
    priority: 'normal',
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    lastActivity: { title: 'Chamado recebido', createdAt: '2026-10-12T12:00:00.000Z' },
    unreadCount: 0,
    requiresStudentAction: false,
    sla: fixedSla,
    staff: {
      studentId: 'student-1',
      studentName: 'Maria Souza',
      registrationNumber: 'RA-2026-001',
      assignedTeam: 'Financeiro',
      assignedAgentId: null,
      assignedAgentName: null,
      channel: 'web',
    },
    ...overrides,
  };
}

export function makeList(items: SupportTicketSummary[], nextCursor: string | null = null): SupportTicketList {
  return { items, nextCursor, counts: { all: items.length, active: items.length, waitingStudent: 0, finished: 0, byStatus: {} } };
}

export function makeStaffTicket(overrides: Partial<SupportStaffTicket> = {}): SupportStaffTicket {
  const { staff: _staff, ...summary } = makeSummary();
  return {
    ...summary,
    description: 'O boleto de outubro veio com valor diferente do contrato.',
    channel: 'web',
    assignedTeam: 'Financeiro',
    pendingAction: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    reopenedCount: 0,
    rating: null,
    canReply: true,
    canCancel: true,
    canReopen: false,
    canRate: false,
    reopenDeadline: null,
    events: [
      {
        id: 'e-1',
        type: 'ticket_created',
        title: 'Chamado aberto',
        description: null,
        createdAt: '2026-10-12T12:00:00.000Z',
        actorType: 'student',
        actorName: 'Maria Souza',
        fromStatus: null,
        toStatus: 'submitted',
        details: [],
        visibility: 'public',
      },
      {
        id: 'e-2',
        type: 'internal_note',
        title: 'Nota interna',
        description: 'Conferir contrato no sistema financeiro.',
        createdAt: '2026-10-13T12:00:00.000Z',
        actorType: 'agent',
        actorName: 'Atendente ASA',
        fromStatus: null,
        toStatus: null,
        details: [],
        visibility: 'internal',
      },
    ],
    messages: [
      {
        id: 'm-1',
        senderType: 'student',
        senderName: 'Maria Souza',
        content: 'Alguma novidade?',
        createdAt: '2026-10-13T15:00:00.000Z',
        readAt: null,
        attachments: [],
      },
    ],
    attachments: [],
    student: { id: 'student-1', fullName: 'Maria Souza', registrationNumber: 'RA-2026-001' },
    assignedAgent: null,
    unreadFromStudent: 1,
    ...overrides,
  };
}

export function makeCatalog(): SupportCatalog {
  return {
    categories: [
      { id: 'financial', label: 'Financeiro', description: 'Boletos', subcategories: [], slaBusinessDays: 3, defaultTeam: 'Financeiro', firstResponseHours: 8 },
      { id: 'academic', label: 'Acadêmico', description: 'Notas', subcategories: [], slaBusinessDays: 3, defaultTeam: 'Secretaria Acadêmica' },
    ],
    articles: [],
    limits: {
      subjectMinLength: 5,
      subjectMaxLength: 120,
      descriptionMinLength: 20,
      descriptionMaxLength: 4000,
      messageMaxLength: 4000,
      maxAttachmentsPerTicket: 10,
      maxAttachmentBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      reopenWindowDays: 7,
    },
    teams: ['Atendimento ASA', 'Secretaria Acadêmica', 'Financeiro'],
  };
}

export function makeDashboard(overrides: Partial<AsaDashboard> = {}): AsaDashboard {
  return {
    tickets: { open: 12, awaitingTeam: 4, waitingStudent: 3, unassigned: 5, assignedToMe: 2, unreadFromStudents: 6, slaNearDeadline: 1, slaOverdue: 2 },
    atRisk: [makeSummary({ id: 't-risk', subject: 'Revisão de prova atrasada', sla: { ...fixedSla, status: 'overdue' } })],
    appointmentsToday: null,
    source: { description: 'Chamados e mensagens do Atendimento ASA (support_tickets), calculados agora.', generatedAt: '2026-10-15T12:00:00.000Z', timezone: 'America/Sao_Paulo', dataMode: 'demo' },
    ...overrides,
  };
}

export function makeStudentContext(): StudentContext {
  return {
    student: {
      studentId: 'student-1',
      fullName: 'Maria Souza',
      registrationNumber: 'RA-2026-001',
      program: 'Administração',
      ticketsTotal: 2,
      ticketsOpen: 1,
      appointmentsUpcoming: 0,
      lastInteractionAt: '2026-10-14T12:00:00.000Z',
      email: 'maria.souza@edu.fecap.br',
    },
    tickets: [makeSummary({ staff: undefined })],
    accessLogged: true,
  };
}

export function makeAuditEvent(overrides: Partial<AuditEventView> = {}): AuditEventView {
  return {
    id: 'a-1',
    occurredAt: '2026-10-14T12:00:00.000Z',
    action: 'ticket.status_changed',
    label: 'Mudou a situação de um chamado',
    outcome: 'success',
    channel: 'web',
    actor: { userId: 'user-institutional_staff', role: 'institutional_staff', name: 'Atendente ASA' },
    resource: { type: 'ticket', id: 't-1' },
    metadata: { to: 'in_progress' },
    requestId: 'req-abc-123',
    correlationId: 'corr-1',
    ...overrides,
  };
}
