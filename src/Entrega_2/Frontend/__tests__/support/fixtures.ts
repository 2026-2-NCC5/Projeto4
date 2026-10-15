import type { AgentAnalysis, AgentHistoryItem, AgentRecommendation, AssistantResponse, AuthSession, StudentSummary } from '../../types/api';

export const demoSession: AuthSession = {
  accessToken: 'access-token-demo',
  refreshToken: 'refresh-token-demo',
  expiresIn: 900,
  refreshExpiresIn: 2_592_000,
  rememberMe: true,
  tokenType: 'Bearer',
  user: { id: 'user-demo-001', fullName: 'Maria Silva Souza', email: 'estudante.exemplo@demo.asa', role: 'student' },
  student: { id: 'student-demo-001', registrationNumber: '20261234', program: 'Ciência da Computação' },
};

export const recommendationFixture: AgentRecommendation = {
  id: 'rec-001',
  type: 'pending_activity',
  message: 'Você tem uma atividade pendente em Banco de Dados com prazo próximo.',
  evidence: ['Trabalho prático sem entrega registrada', 'Prazo em 21/09/2026'],
  nextAction: 'Entregue o trabalho prático até 21/09/2026 pelo portal acadêmico.',
  confidence: 0.9,
  requiresHumanValidation: false,
  priority: 1,
  subjectId: 'subject-demo-002',
};

export function makeAnalysis(overrides: Partial<AgentAnalysis> = {}): AgentAnalysis {
  return {
    runId: 'run-001',
    agent: 'student_agent',
    version: '1.0.0',
    configVersion: '2026-09',
    status: 'recommendation',
    summary: 'Identificamos 1 ponto de atenção na sua situação acadêmica.',
    recommendations: [recommendationFixture],
    confidence: 0.9,
    requiresHumanValidation: false,
    abstained: false,
    abstentionReason: null,
    correlationId: 'corr-analysis-001',
    createdAt: '2026-09-16T21:05:00.000Z',
    ...overrides,
  };
}

export const summaryFixture: StudentSummary = {
  subjectsCount: 2,
  pendingCount: 1,
  attentionCount: 1,
  averageScore: 8.2,
  averageAttendanceRate: 0.9,
  lastAnalysis: {
    runId: 'run-001',
    status: 'recommendation',
    summary: 'Identificamos 1 ponto de atenção na sua situação acadêmica.',
    recommendationsCount: 1,
    requiresHumanValidation: false,
    abstained: false,
    createdAt: '2026-09-16T21:05:00.000Z',
  },
};

export const emptySummaryFixture: StudentSummary = {
  subjectsCount: 0,
  pendingCount: 0,
  attentionCount: 0,
  averageScore: null,
  averageAttendanceRate: null,
  lastAnalysis: null,
};

export const historyFixture: AgentHistoryItem[] = [
  {
    runId: 'run-002',
    status: 'recommendation',
    summary: 'Identificamos 1 ponto de atenção na sua situação acadêmica.',
    recommendationsCount: 1,
    requiresHumanValidation: false,
    abstained: false,
    confidence: 0.9,
    correlationId: 'corr-002',
    createdAt: '2026-09-16T21:05:00.000Z',
  },
  {
    runId: 'run-001',
    status: 'no_action',
    summary: 'Nenhuma situação que mereça atenção foi identificada.',
    recommendationsCount: 0,
    requiresHumanValidation: false,
    abstained: false,
    confidence: 0.95,
    correlationId: 'corr-001',
    createdAt: '2026-09-10T10:00:00.000Z',
  },
];

export function makeAssistantResponse(overrides: Partial<AssistantResponse> = {}): AssistantResponse {
  return {
    interactionId: 'int-001',
    requestId: 'req-assistant-001',
    correlationId: 'corr-assistant-001',
    inputType: 'text',
    intent: 'get_pending_items',
    intentConfidence: 0.92,
    entities: {},
    status: 'success',
    display: {
      title: 'Suas pendências',
      message: 'Você tem 1 atividade pendente.',
      items: [
        {
          id: 'item-001',
          title: 'Trabalho prático de Banco de Dados',
          description: 'Entrega pelo portal acadêmico',
          meta: 'Prazo: 21/09/2026',
          badge: 'Pendente',
          tone: 'attention',
          subjectId: 'subject-demo-002',
        },
      ],
      recommendations: [],
    },
    speech: { text: 'Você tem uma atividade pendente em Banco de Dados.' },
    nextActions: [],
    clientCommand: null,
    requiresHumanValidation: false,
    abstained: false,
    abstentionReason: null,
    runId: null,
    context: { lastIntent: 'get_pending_items' },
    createdAt: '2026-09-16T21:10:00.000Z',
    ...overrides,
  };
}
