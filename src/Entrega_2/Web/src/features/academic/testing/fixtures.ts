import type {
  AgentAnalysis,
  AgentHistoryItem,
  AgentRecommendation,
  AgentRecommendationDetail,
  PlatformInfo,
  StudentAssessment,
  StudentAttendance,
  StudentPendingItem,
  StudentProfile,
  StudentSubject,
  StudentSummary,
} from '@/types/api';

/**
 * Dados de teste da vida acadêmica e do Agente (usados só pelos *.test.tsx; nenhuma tela importa este arquivo).
 * Formato igual ao contrato em src/types/api.ts.
 */

export function makeProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'student-demo-001',
    userId: 'user-student',
    fullName: 'Estudante Exemplo',
    email: 'student@demo.asa',
    role: 'student',
    registrationNumber: 'DEMO-2026-001',
    program: 'Ciências da Computação',
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    subjectsCount: 2,
    pendingCount: 1,
    attentionCount: 1,
    averageScore: 7.6,
    averageAttendanceRate: 0.95,
    lastAnalysis: {
      runId: 'run-1',
      status: 'recommendation',
      summary: 'Foi identificada uma situação que merece atenção.',
      recommendationsCount: 1,
      requiresHumanValidation: false,
      abstained: false,
      createdAt: '2026-10-10T16:00:00.000Z',
    },
    ...overrides,
  };
}

export function makeSubjects(): StudentSubject[] {
  return [
    { id: 'subject-db', code: 'CC502', name: 'Banco de Dados', enrollmentStatus: 'active', averageScore: 7, attendanceRate: 0.78, pendingCount: 1, attention: true },
    { id: 'subject-ai', code: 'CC501', name: 'Inteligência Artificial', enrollmentStatus: 'active', averageScore: 8.2, attendanceRate: 0.9, pendingCount: 0, attention: false },
  ];
}

export function makeAssessments(): StudentAssessment[] {
  return [
    { id: 'as-1', subjectId: 'subject-ai', subjectName: 'Inteligência Artificial', title: 'Prova 1', type: 'exam', score: 8.2, maxScore: 10, appliedAt: '2026-08-28' },
    { id: 'as-2', subjectId: 'subject-db', subjectName: 'Banco de Dados', title: 'Prova 1 de BD', type: 'exam', score: 5, maxScore: 10, appliedAt: '2026-08-30' },
    { id: 'as-3', subjectId: 'subject-db', subjectName: 'Banco de Dados', title: 'Trabalho prático', type: 'assignment', score: null, maxScore: 10, appliedAt: '2026-09-22' },
  ];
}

export function makeAttendance(): StudentAttendance[] {
  return [
    { subjectId: 'subject-db', subjectName: 'Banco de Dados', totalClasses: 9, attendedClasses: 7, attendanceRate: 0.778 },
    { subjectId: 'subject-ai', subjectName: 'Inteligência Artificial', totalClasses: 10, attendedClasses: 9, attendanceRate: 0.9 },
  ];
}

export function makePendingItems(): StudentPendingItem[] {
  return [{ id: 'pending-1', subjectId: 'subject-db', subjectName: 'Banco de Dados', type: 'assignment', description: 'Entrega do trabalho prático de Banco de Dados', dueDate: '2026-10-20', status: 'pending' }];
}

export function makeRecommendation(overrides: Partial<AgentRecommendation> = {}): AgentRecommendation {
  return {
    id: 'rec-1',
    type: 'pending_activity',
    message: 'Existe uma atividade pendente que merece sua atenção.',
    evidence: ['Foi identificada uma atividade pendente.', 'Banco de Dados: Entrega do trabalho prático (prazo 2026-10-20, em 5 dias).'],
    nextAction: 'Consultar os detalhes da atividade.',
    confidence: 0.9,
    requiresHumanValidation: false,
    priority: 1,
    subjectId: 'subject-db',
    ...overrides,
  };
}

export function makeAnalysis(overrides: Partial<AgentAnalysis> = {}): AgentAnalysis {
  return {
    runId: 'run-1',
    agent: 'student_agent',
    version: '1.0.0',
    configVersion: '1.0.0',
    status: 'recommendation',
    summary: 'Foi identificada uma situação que merece atenção.',
    recommendations: [makeRecommendation()],
    confidence: 0.9,
    requiresHumanValidation: false,
    abstained: false,
    abstentionReason: null,
    correlationId: 'corr-1',
    createdAt: '2026-10-10T16:00:00.000Z',
    ...overrides,
  };
}

export function makeHistoryItem(overrides: Partial<AgentHistoryItem> = {}): AgentHistoryItem {
  return {
    runId: 'run-1',
    status: 'recommendation',
    summary: 'Foi identificada uma situação que merece atenção.',
    recommendationsCount: 1,
    requiresHumanValidation: false,
    abstained: false,
    confidence: 0.9,
    correlationId: 'corr-1',
    createdAt: '2026-10-10T16:00:00.000Z',
    ...overrides,
  };
}

export function makeRecommendationDetail(overrides: Partial<AgentRecommendationDetail> = {}): AgentRecommendationDetail {
  return { ...makeRecommendation(), runId: 'run-1', runStatus: 'recommendation', createdAt: '2026-10-10T16:00:00.000Z', feedback: null, ...overrides };
}

export function makePlatformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    name: 'ASA Conecta',
    institution: 'FECAP — Área do Sucesso Alvarista (ASA)',
    environment: 'test',
    apiVersion: '1.0.0',
    contractVersion: '1.8',
    dataMode: 'demo',
    dataModeLabel: 'DEMONSTRAÇÃO — Dados fictícios',
    academicSource: { provider: 'demo', status: 'demo', message: 'Disciplinas, notas, frequência e pendências fictícias, criadas para demonstração.' },
    features: { tickets: true, appointments: true, knowledgeBase: true, notifications: true, realtime: false, assistant: true },
    assistant: { provider: 'existing', providerLabel: 'Regras do ASA Conecta e base de conhecimento (sem LLM)', jev: { status: 'planned', enabled: false } },
    queue: { enabled: false, source: 'disabled', authorized: false },
    announcement: null,
    businessHours: { timezone: 'America/Sao_Paulo', days: [], note: null },
    links: [],
    timezone: 'America/Sao_Paulo',
    serverTime: '2026-10-15T12:00:00.000Z',
    ...overrides,
  };
}

/** 503 da plataforma sem fonte acadêmica (mensagem real do servidor). */
export const ACADEMIC_UNAVAILABLE = {
  status: 503,
  error: { code: 'DEPENDENCY_ERROR', message: 'Modo demonstração desligado e nenhuma fonte institucional configurada: dados acadêmicos indisponíveis.', reason: 'academic_source_unavailable' },
} as const;
