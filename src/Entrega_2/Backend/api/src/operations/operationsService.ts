import type {
  AgentInsights,
  AsaDashboard,
  AuditEventList,
  AuditEventView,
  MetricSource,
  StudentContext,
  StudentContextList,
  StudentContextSummary,
  TicketMetrics,
} from '../contracts/mobileApi.v1.js';
import { AppError, DependencyError, NotFoundError, ValidationError } from '../errors/AppError.js';
import type { AuditService } from '../platform/auditService.js';
import type { AuditQuery } from '../platform/types.js';
import type { Repositories } from '../repositories/types.js';
import { findCategory, findSubcategoryLabel, normalizeSearch } from '../support/catalog.js';
import { toSummary } from '../support/mappers.js';
import { slaStatus } from '../support/sla.js';
import { STATUS_LABELS } from '../support/statuses.js';
import type { SupportStaffService } from '../support/supportStaffService.js';
import { addDays, localDate, localMidnight } from '../lib/zonedTime.js';
import { auditLabel } from './auditLabels.js';
import type { AnalyticsRepository, Period } from './analyticsRepository.js';
import type { AppointmentRepository } from '../appointments/types.js';
import type { AgentClient } from '../clients/agentClient.js';
import type { AiProviderRegistry } from '../ai/providers.js';

const DAY_MS = 86_400_000;
// valores do CSV em português (a planilha é lida por pessoas da equipe, não por sistemas)
const PRIORITY_LABELS: Record<string, string> = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const SLA_STATUS_LABELS: Record<string, string> = {
  on_track: 'No prazo',
  attention: 'Atenção',
  near_deadline: 'Prazo próximo',
  overdue: 'Prazo excedido',
  paused: 'Pausado (aguardando aluno)',
  completed: 'Concluído',
};
const MAX_RANGE_DAYS = 366;
export const EXPORT_MAX_ROWS = 5000;

export interface OperationsConfig {
  timezone: string;
  excludeDemo: boolean;
  dataMode: 'demo' | 'institutional';
}

export { localDate, localMidnight } from '../lib/zonedTime.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Período inclusivo em datas locais (padrão: últimos 30 dias, incluindo hoje). */
export function parsePeriod(input: { from?: string; to?: string }, now: Date, timeZone: string): { from: string; to: string; fromInstant: Date; toInstant: Date } {
  const to = input.to ?? localDate(now, timeZone);
  const from = input.from ?? (DATE_PATTERN.test(to) ? addDays(to, -29) : to);
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw new ValidationError('Use datas no formato AAAA-MM-DD.', [{ field: 'from', message: 'formato inválido' }]);
  }
  if (to < from) throw new ValidationError('A data final deve ser igual ou posterior à inicial.', [{ field: 'to', message: 'antes do início' }]);
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw new ValidationError(`Escolha um período de até ${MAX_RANGE_DAYS} dias.`, [{ field: 'from', message: 'período longo demais' }]);
  }
  // intervalo [meia-noite local de "from", meia-noite local do dia seguinte a "to")
  return { from, to, fromInstant: localMidnight(from, timeZone), toInstant: localMidnight(addDays(to, 1), timeZone) };
}

/** Célula CSV segura: aspas escapadas e fórmulas neutralizadas (=, +, -, @) contra injeção em planilhas. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Operação do ASA: painel, métricas, relatório CSV, alunos atendidos e trilha de auditoria. */
export class OperationsService {
  constructor(
    private readonly repos: Repositories,
    private readonly analytics: AnalyticsRepository | null,
    private readonly staff: SupportStaffService,
    private readonly audit: AuditService,
    private readonly config: OperationsConfig,
    private readonly now: () => Date,
    private readonly appointments: AppointmentRepository | null = null,
  ) {}

  /** Contagens de agendamentos que começam no intervalo (null sem o módulo de agendamentos). */
  private async appointmentCounts(from: Date, to: Date) {
    if (!this.appointments) return null;
    const counts = await this.appointments.countByStatus(from, to, this.config.excludeDemo);
    return { counts, total: Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0) };
  }

  private db(): AnalyticsRepository {
    if (!this.analytics) throw new DependencyError('Indicadores exigem o banco de dados PostgreSQL.', undefined, 'database_required');
    return this.analytics;
  }

  private source(description: string): MetricSource {
    return { description, generatedAt: this.now().toISOString(), timezone: this.config.timezone, dataMode: this.config.dataMode };
  }

  private period(input: { from?: string; to?: string }) {
    const parsed = parsePeriod(input, this.now(), this.config.timezone);
    const period: Period = { from: parsed.fromInstant, to: parsed.toInstant, timezone: this.config.timezone, excludeDemo: this.config.excludeDemo };
    return { ...parsed, period };
  }

  async dashboard(viewerUserId: string): Promise<AsaDashboard> {
    const now = this.now();
    const today = localDate(now, this.config.timezone);
    const [counts, atRisk, appointments] = await Promise.all([
      this.db().dashboard({ now, viewerUserId, excludeDemo: this.config.excludeDemo }),
      this.staff.list({ sla: 'at_risk', sort: 'due', limit: 5 }, viewerUserId),
      this.appointmentCounts(localMidnight(today, this.config.timezone), localMidnight(addDays(today, 1), this.config.timezone)),
    ]);
    return {
      tickets: counts,
      atRisk: atRisk.items,
      appointmentsToday: appointments
        ? { total: appointments.total - (appointments.counts.cancelled ?? 0), confirmed: appointments.counts.confirmed ?? 0, completed: appointments.counts.completed ?? 0, noShow: appointments.counts.no_show ?? 0 }
        : null,
      source: this.source('Chamados, mensagens e agendamentos do ASA (support_tickets, support_ticket_messages, appointments), calculados agora.'),
    };
  }

  /** Só contagens (sem assunto nem lista de chamados): visão geral da administração. */
  async operationalCounts(viewerUserId: string): Promise<{ tickets: { open: number; slaOverdue: number; slaNearDeadline: number; unassigned: number }; appointmentsToday: { total: number } | null }> {
    const now = this.now();
    const today = localDate(now, this.config.timezone);
    const [counts, appointments] = await Promise.all([
      this.db().dashboard({ now, viewerUserId, excludeDemo: this.config.excludeDemo }),
      this.appointmentCounts(localMidnight(today, this.config.timezone), localMidnight(addDays(today, 1), this.config.timezone)),
    ]);
    return {
      tickets: { open: counts.open, slaOverdue: counts.slaOverdue, slaNearDeadline: counts.slaNearDeadline, unassigned: counts.unassigned },
      appointmentsToday: appointments ? { total: appointments.total - (appointments.counts.cancelled ?? 0) } : null,
    };
  }

  async metrics(input: { from?: string; to?: string }): Promise<TicketMetrics> {
    const { from, to, period } = this.period(input);
    const db = this.db();
    const [kpis, series, categories, statuses, teams, appointments] = await Promise.all([
      db.kpis(period),
      db.dailySeries(period),
      db.createdByCategory(period),
      db.backlogByStatus(period.excludeDemo),
      db.backlogByTeam(period.excludeDemo),
      this.appointmentCounts(period.from, period.to),
    ]);
    return {
      from,
      to,
      kpis,
      series,
      byCategory: categories.map((row) => ({ key: row.key, label: findCategory(row.key)?.label ?? row.key, count: row.count })),
      byStatus: statuses.map((row) => ({ key: row.key, label: STATUS_LABELS[row.key as keyof typeof STATUS_LABELS] ?? row.key, count: row.count })),
      byTeam: teams.map((row) => ({ key: row.key, label: row.key, count: row.count })),
      appointments: appointments
        ? { booked: appointments.total, completed: appointments.counts.completed ?? 0, cancelled: appointments.counts.cancelled ?? 0, noShow: appointments.counts.no_show ?? 0 }
        : null,
      source: this.source(
        'Chamados abertos no período (support_tickets). Primeira resposta = primeiro evento público da equipe; resolução = abertura até "resolvido"; SLA = prazos concluídos dentro do previsto (cancelados fora).',
      ),
    };
  }

  /** CSV sem dados pessoais (sem nome, RA ou e-mail): protocolo, categoria, situação, prazos e avaliação. */
  async exportTicketsCsv(input: { from?: string; to?: string }): Promise<{ filename: string; content: string; rows: number }> {
    const { from, to, period } = this.period(input);
    const rows = await this.db().exportTickets(period, EXPORT_MAX_ROWS);
    const tz = this.config.timezone;
    const stamp = (value: Date | null) => {
      if (!value) return '';
      const date = localDate(value, tz);
      const time = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
      return `${date} ${time}`;
    };
    const now = this.now();
    const header = ['protocolo', 'aberto_em', 'categoria', 'tipo', 'situacao', 'prioridade', 'equipe', 'canal', 'prazo_sla', 'situacao_sla', 'primeira_resposta_em', 'resolvido_em', 'avaliacao'];
    const lines = rows.map((row) =>
      [
        row.protocol,
        stamp(row.createdAt),
        findCategory(row.categoryId)?.label ?? row.categoryId,
        findSubcategoryLabel(row.categoryId, row.subcategoryId) ?? '',
        STATUS_LABELS[row.status],
        PRIORITY_LABELS[row.priority] ?? row.priority,
        row.assignedTeam,
        row.channel === 'web' ? 'Portal' : 'App',
        stamp(row.slaDueAt),
        SLA_STATUS_LABELS[slaStatus({ targetBusinessDays: 0, startedAt: row.slaStartedAt, dueAt: row.slaDueAt, pausedAt: row.slaPausedAt, resumedAt: null, completedAt: row.slaCompletedAt }, now)],
        stamp(row.firstResponseAt),
        stamp(row.resolvedAt),
        row.rating,
      ]
        .map(csvCell)
        .join(';'),
    );
    // BOM para o Excel abrir em UTF-8; ponto e vírgula como separador (padrão pt-BR)
    const content = `\uFEFF${header.join(';')}\r\n${lines.join('\r\n')}${lines.length > 0 ? '\r\n' : ''}`;
    return { filename: `chamados_${from}_a_${to}.csv`, content, rows: rows.length };
  }

  async students(input: { search?: string; page?: number; pageSize?: number }): Promise<StudentContextList> {
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 50);
    const page = Math.max(input.page ?? 1, 1);
    const search = input.search ? normalizeSearch(input.search).slice(0, 60) : null;
    const result = await this.db().studentContexts({ search: search || null, limit: pageSize, offset: (page - 1) * pageSize, excludeDemo: this.config.excludeDemo });
    const upcoming = this.appointments ? await this.appointments.upcomingCountByStudent(result.items.map((row) => row.studentId), this.now()) : new Map<string, number>();
    return { items: result.items.map((row) => ({ ...this.toContextSummary(row), appointmentsUpcoming: upcoming.get(row.studentId) ?? 0 })), total: result.total };
  }

  private toContextSummary(row: Awaited<ReturnType<AnalyticsRepository['studentContext']>> & object): StudentContextSummary {
    return {
      studentId: row.studentId,
      fullName: row.fullName,
      registrationNumber: row.registrationNumber,
      program: row.program,
      ticketsTotal: row.ticketsTotal,
      ticketsOpen: row.ticketsOpen,
      appointmentsUpcoming: 0,
      lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    };
  }

  /**
   * Contexto de um aluno para o atendimento. Só existe para quem já interagiu com o ASA (finalidade) e
   * cada acesso é registrado na auditoria. Notas, frequência e análises do agente não fazem parte.
   */
  async student(studentId: string, actor: Parameters<AuditService['record']>[0]): Promise<StudentContext> {
    const row = await this.db().studentContext(studentId, this.config.excludeDemo);
    if (!row) throw new NotFoundError('Aluno sem atendimentos registrados.');
    const tickets = await this.repos.support.listTickets({ studentId, limit: 50, perspective: 'staff' });
    await this.audit.record(actor, { action: 'student_context.viewed', resourceType: 'student', resourceId: studentId, metadata: { purpose: 'atendimento' } });
    const now = this.now();
    return { student: { ...this.toContextSummary(row), email: row.email }, tickets: tickets.map((ticket) => toSummary(ticket, ticket, now)), accessLogged: true };
  }

  /** Trilha de auditoria: a própria (equipe) ou completa (administração). */
  async auditEvents(query: { actorUserId?: string; action?: string; outcome?: string; resourceType?: string; resourceId?: string; from?: string; to?: string; page?: number; pageSize?: number }): Promise<AuditEventList> {
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const filter: AuditQuery = { limit: pageSize, offset: (page - 1) * pageSize };
    if (query.actorUserId) filter.actorUserId = query.actorUserId;
    if (query.action) filter.actionPrefix = query.action.slice(0, 60);
    if (query.outcome === 'success' || query.outcome === 'failure' || query.outcome === 'denied') filter.outcome = query.outcome;
    if (query.resourceType) filter.resourceType = query.resourceType.slice(0, 40);
    if (query.resourceId) filter.resourceId = query.resourceId.slice(0, 120);
    if (query.from || query.to) {
      const parsed = parsePeriod({ ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) }, this.now(), this.config.timezone);
      filter.from = parsed.fromInstant;
      filter.to = parsed.toInstant;
    }
    const result = await this.audit.list(filter);
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(result.items.map((item) => item.actorUserId).filter((id): id is string => Boolean(id)))].map(async (id) => {
        names.set(id, (await this.repos.users.findById(id))?.fullName ?? 'Conta removida');
      }),
    );
    const items: AuditEventView[] = result.items.map((item) => ({
      id: item.id,
      occurredAt: item.occurredAt.toISOString(),
      action: item.action,
      label: auditLabel(item.action),
      outcome: item.outcome,
      channel: item.channel,
      actor: { userId: item.actorUserId, role: item.actorRole, name: item.actorUserId ? (names.get(item.actorUserId) ?? null) : null },
      resource: item.resourceType ? { type: item.resourceType, id: item.resourceId } : null,
      metadata: item.metadata,
      requestId: item.requestId,
      correlationId: item.correlationId,
    }));
    return { items, total: result.total, page, pageSize };
  }

  /** Agente e assistente: números agregados, versões/limiares do Agent Service e provedor de IA ativo. */
  async agentInsights(input: { from?: string; to?: string }, deps: { agentClient: AgentClient; ai: AiProviderRegistry }): Promise<AgentInsights> {
    const { from, to, period } = this.period(input);
    const [row, config, jevHealth] = await Promise.all([this.db().agentInsights(period), deps.agentClient.config?.() ?? Promise.resolve(null), deps.ai.jev.health()]);
    const byStatus = { recommendation: 0, no_action: 0, abstained: 0 } as AgentInsights['runs']['byStatus'];
    for (const item of row.runsByStatus) if (item.key in byStatus) byStatus[item.key as keyof typeof byStatus] = item.count;
    const total = byStatus.recommendation + byStatus.no_action + byStatus.abstained;
    const intentLabels: Record<string, string> = { knowledge_question: 'Base de conhecimento', unknown: 'Não entendida', request_human_help: 'Pedido de atendimento humano' };
    return {
      from,
      to,
      runs: {
        total,
        byStatus,
        requiresHumanValidation: row.requiresHumanValidation,
        averageConfidence: row.averageConfidence === null ? null : Math.round(row.averageConfidence * 1000) / 1000,
        abstentionRate: total > 0 ? Math.round((byStatus.abstained / total) * 1000) / 1000 : null,
      },
      recommendationsByType: row.recommendationsByType.map((item) => ({ key: item.key, label: item.key, count: item.count })),
      feedback: { helpful: row.helpful, notHelpful: row.notHelpful },
      assistant: {
        interactions: row.interactionsByStatus.reduce((sum, item) => sum + item.count, 0),
        byIntent: row.interactionsByIntent.map((item) => ({ key: item.key, label: intentLabels[item.key] ?? item.key, count: item.count })),
        byStatus: row.interactionsByStatus.map((item) => ({ key: item.key, label: item.key, count: item.count })),
        knowledgeAnswered: row.knowledgeAnswered,
        knowledgeAbstained: row.knowledgeAbstained,
      },
      agentConfig: {
        available: config !== null,
        agentVersion: config?.agent_version ?? null,
        configVersion: config?.config_version ?? null,
        contractVersion: config?.contract_version ?? null,
        minimumConfidence: config && Number.isFinite(config.thresholds.minimum_confidence) ? config.thresholds.minimum_confidence : null,
        rules: config?.rules ?? [],
      },
      provider: {
        requested: deps.ai.selection.requested,
        active: deps.ai.selection.active,
        fallbackReason: deps.ai.selection.fallbackReason,
        label: deps.ai.active.label,
        jev: { status: jevHealth.status, detail: jevHealth.detail },
      },
      source: this.source('Execuções do Agente (agent_runs, agent_recommendations, agent_feedback) e metadados do assistente (assistant_interactions, sem texto). Estudantes nunca são identificados.'),
    };
  }

  assertExportable(rows: number): void {
    if (rows >= EXPORT_MAX_ROWS) throw new AppError(422, 'VALIDATION_ERROR', `O relatório passa de ${EXPORT_MAX_ROWS} linhas. Escolha um período menor.`, { reason: 'export_too_large' });
  }
}
