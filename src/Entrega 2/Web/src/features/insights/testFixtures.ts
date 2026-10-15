import type { AgentInsights, MetricSource, TicketMetrics } from '@/types/api';

/** Dados fixos para os testes de indicadores (datas fixas: nada depende do relógio). */

export const fixedSource: MetricSource = {
  description: 'Chamados abertos no período (support_tickets).',
  generatedAt: '2026-10-15T12:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  dataMode: 'demo',
};

export function makeMetrics(overrides: Partial<TicketMetrics> = {}): TicketMetrics {
  return {
    from: '2026-10-13',
    to: '2026-10-15',
    kpis: {
      created: 6,
      resolved: 3,
      backlog: 21,
      firstResponseMedianMinutes: 125,
      resolutionMedianMinutes: 1440,
      slaCompliance: 0.5238,
      slaCompletedCount: 21,
      ratingAverage: 4.5,
      ratingCount: 10,
    },
    series: [
      { date: '2026-10-13', created: 1, resolved: 0 },
      { date: '2026-10-14', created: 2, resolved: 1 },
      { date: '2026-10-15', created: 3, resolved: 2 },
    ],
    byCategory: [
      { key: 'documents', label: 'Documentos', count: 4 },
      { key: 'financial', label: 'Financeiro', count: 2 },
    ],
    byStatus: [
      { key: 'in_analysis', label: 'Em análise', count: 11 },
      { key: 'waiting_student', label: 'Aguardando você', count: 9 },
    ],
    byTeam: [{ key: 'Financeiro', label: 'Financeiro', count: 10 }],
    appointments: { booked: 4, completed: 2, cancelled: 1, noShow: 1 },
    source: fixedSource,
    ...overrides,
  };
}

export function makeAgentInsights(overrides: Partial<AgentInsights> = {}): AgentInsights {
  return {
    from: '2026-09-16',
    to: '2026-10-15',
    runs: { total: 8, byStatus: { recommendation: 2, no_action: 0, abstained: 6 }, requiresHumanValidation: 1, averageConfidence: 0.875, abstentionRate: 0.75 },
    recommendationsByType: [
      { key: 'pending_activity', label: 'pending_activity', count: 2 },
      { key: 'attendance_attention', label: 'attendance_attention', count: 1 },
    ],
    feedback: { helpful: 3, notHelpful: 1 },
    assistant: {
      interactions: 74,
      byIntent: [
        { key: 'get_pending_items', label: 'get_pending_items', count: 22 },
        { key: 'unknown', label: 'Não entendida', count: 16 },
      ],
      byStatus: [
        { key: 'success', label: 'success', count: 38 },
        { key: 'needs_clarification', label: 'needs_clarification', count: 16 },
      ],
      knowledgeAnswered: 5,
      knowledgeAbstained: 2,
    },
    agentConfig: {
      available: true,
      agentVersion: '1.0.0',
      configVersion: '1.0.0',
      contractVersion: '1.0',
      minimumConfidence: 0.7,
      rules: ['attendance_attention', 'pending_activity'],
    },
    provider: {
      requested: 'existing',
      active: 'existing',
      fallbackReason: null,
      label: 'Regras do ASA Conecta e base de conhecimento (sem LLM)',
      jev: { status: 'disabled', detail: 'Integração planejada e desligada (JEV_ENABLED=false).' },
    },
    source: { ...fixedSource, description: 'Execuções do Agente (agent_runs) e metadados do assistente (sem texto).' },
    ...overrides,
  };
}
