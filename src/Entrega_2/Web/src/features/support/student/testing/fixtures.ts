import type { SupportCatalog, SupportTicket, SupportTicketCounts, SupportTicketList, SupportTicketSummary } from '@/types/api';

/**
 * Dados de teste do Atendimento (usados só pelos *.test.tsx; nenhuma tela importa este arquivo).
 * Formato igual ao contrato em src/types/api.ts.
 */

export function makeCatalog(): SupportCatalog {
  return {
    categories: [
      {
        id: 'documents',
        label: 'Documentos',
        description: 'Declarações, histórico escolar, certificados e diploma.',
        subcategories: [
          { id: 'enrollment_certificate', label: 'Declaração de matrícula' },
          { id: 'transcript', label: 'Histórico escolar' },
        ],
        slaBusinessDays: 3,
        defaultTeam: 'Secretaria Acadêmica',
      },
      {
        id: 'financial',
        label: 'Financeiro',
        description: 'Boletos, mensalidades, negociação e pagamentos.',
        subcategories: [{ id: 'bill', label: 'Boleto' }],
        slaBusinessDays: 2,
        defaultTeam: 'Financeiro',
      },
      { id: 'other', label: 'Outro', description: 'Não encontrou a categoria? Conte para o ASA.', subcategories: [], slaBusinessDays: 3, defaultTeam: 'Atendimento ASA' },
    ],
    articles: [
      { id: 'documents-enrollment-certificate', categoryId: 'documents', title: 'Como solicitar uma declaração de matrícula?', summary: 'A declaração simples pode ser emitida no portal.', steps: ['Entre no portal do aluno.', 'Abra Documentos → Declarações.'] },
      { id: 'documents-transcript', categoryId: 'documents', title: 'Como obter o histórico escolar?', summary: 'O histórico parcial é emitido pela Secretaria Acadêmica.', steps: ['Abra um chamado em Documentos → Histórico escolar.', 'Informe se precisa de versão assinada.'] },
      { id: 'documents-diploma', categoryId: 'documents', title: 'Quando recebo o diploma?', summary: 'O diploma é registrado após a colação.', steps: ['Aguarde a colação de grau.'] },
      { id: 'documents-syllabus', categoryId: 'documents', title: 'Onde encontro o plano de ensino?', summary: 'Planos de ensino ficam com a coordenação.', steps: ['Peça pela categoria Documentos.'] },
      { id: 'financial-bill-copy', categoryId: 'financial', title: 'Como emitir a segunda via do boleto?', summary: 'A segunda via fica na área financeira.', steps: ['Entre no portal do aluno.', 'Abra a área Financeiro.'] },
    ],
    limits: {
      subjectMinLength: 5,
      subjectMaxLength: 120,
      descriptionMinLength: 20,
      descriptionMaxLength: 1500,
      messageMaxLength: 2000,
      maxAttachmentsPerTicket: 10,
      maxAttachmentBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      reopenWindowDays: 7,
    },
    teams: ['Atendimento ASA', 'Secretaria Acadêmica', 'Financeiro'],
  };
}

const NOW = '2026-10-15T12:00:00.000Z';

export function makeSummary(overrides: Partial<SupportTicketSummary> = {}): SupportTicketSummary {
  return {
    id: 'ticket-1',
    protocol: 'ASA-2026-000123',
    subject: 'Declaração para estágio',
    categoryId: 'documents',
    categoryLabel: 'Documentos',
    subcategoryId: 'enrollment_certificate',
    subcategoryLabel: 'Declaração de matrícula',
    status: 'in_analysis',
    priority: 'normal',
    createdAt: '2026-10-13T12:00:00.000Z',
    updatedAt: NOW,
    lastActivity: { title: 'Em análise pela Secretaria Acadêmica', createdAt: NOW },
    unreadCount: 0,
    requiresStudentAction: false,
    sla: { status: 'on_track', targetBusinessDays: 3, startedAt: '2026-10-13T12:00:00.000Z', dueAt: '2026-10-16T21:00:00.000Z', pausedAt: null, resumedAt: null, completedAt: null },
    ...overrides,
  };
}

export function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    ...makeSummary(),
    description: 'Preciso da declaração de matrícula para apresentar na empresa do estágio.',
    channel: 'web',
    assignedTeam: 'Secretaria Acadêmica',
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
      { id: 'ev-1', type: 'ticket_created', title: 'Chamado aberto', description: null, createdAt: '2026-10-13T12:00:00.000Z', actorType: 'student', actorName: 'Estudante Exemplo', fromStatus: null, toStatus: 'submitted', details: [] },
      { id: 'ev-2', type: 'ticket_received', title: 'Solicitação recebida pelo ASA', description: null, createdAt: '2026-10-13T12:00:01.000Z', actorType: 'system', actorName: 'Atendimento ASA', fromStatus: 'submitted', toStatus: 'received', details: [] },
      { id: 'ev-3', type: 'ticket_assigned', title: 'Encaminhado para Secretaria Acadêmica', description: null, createdAt: '2026-10-14T12:00:00.000Z', actorType: 'agent', actorName: 'Atendimento ASA', fromStatus: 'received', toStatus: 'in_analysis', details: [] },
    ],
    messages: [
      { id: 'msg-1', senderType: 'agent', senderName: 'Secretaria Acadêmica', content: 'Olá! Já estamos verificando.', createdAt: '2026-10-14T12:00:00.000Z', readAt: null, attachments: [] },
    ],
    attachments: [],
    ...overrides,
  };
}

export function makeCounts(overrides: Partial<SupportTicketCounts> = {}): SupportTicketCounts {
  return { all: 3, active: 2, waitingStudent: 1, finished: 1, byStatus: {}, ...overrides };
}

export function makeList(items: SupportTicketSummary[], overrides: Partial<SupportTicketList> = {}): SupportTicketList {
  return { items, nextCursor: null, counts: makeCounts(), ...overrides };
}
