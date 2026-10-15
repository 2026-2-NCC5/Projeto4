import type { DbPool } from '../db/pool.js';
import type { SupportTicketPriority, SupportTicketStatus } from '../contracts/mobileApi.v1.js';

/**
 * Consultas agregadas da operação do ASA (somente PostgreSQL: percentis, séries por dia no fuso da
 * instituição). Contas de demonstração ficam de fora quando `excludeDemo` (modo demonstração desligado).
 */
export interface Period {
  from: Date;
  /** exclusivo */
  to: Date;
  timezone: string;
  excludeDemo: boolean;
}

export interface DashboardCounts {
  open: number;
  awaitingTeam: number;
  waitingStudent: number;
  unassigned: number;
  assignedToMe: number;
  unreadFromStudents: number;
  slaNearDeadline: number;
  slaOverdue: number;
}

export interface MetricsKpiRow {
  created: number;
  resolved: number;
  backlog: number;
  firstResponseMedianMinutes: number | null;
  firstResponseOnTime: number | null;
  firstResponseMeasured: number;
  resolutionMedianMinutes: number | null;
  slaCompliance: number | null;
  slaCompletedCount: number;
  ratingAverage: number | null;
  ratingCount: number;
}

export interface ExportRow {
  protocol: string;
  createdAt: Date;
  categoryId: string;
  subcategoryId: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedTeam: string;
  channel: string;
  slaStartedAt: Date;
  slaDueAt: Date;
  slaPausedAt: Date | null;
  slaCompletedAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  rating: number | null;
}

export interface StudentContextRow {
  studentId: string;
  fullName: string;
  email: string;
  registrationNumber: string;
  program: string | null;
  ticketsTotal: number;
  ticketsOpen: number;
  lastInteractionAt: Date | null;
}

export interface AnalyticsRepository {
  dashboard(input: { now: Date; viewerUserId: string; excludeDemo: boolean }): Promise<DashboardCounts>;
  kpis(period: Period): Promise<MetricsKpiRow>;
  dailySeries(period: Period): Promise<Array<{ date: string; created: number; resolved: number }>>;
  createdByCategory(period: Period): Promise<Array<{ key: string; count: number }>>;
  backlogByStatus(excludeDemo: boolean): Promise<Array<{ key: string; count: number }>>;
  backlogByTeam(excludeDemo: boolean): Promise<Array<{ key: string; count: number }>>;
  exportTickets(period: Period, limit: number): Promise<ExportRow[]>;
  studentContexts(input: { search: string | null; limit: number; offset: number; excludeDemo: boolean }): Promise<{ items: StudentContextRow[]; total: number }>;
  studentContext(studentId: string, excludeDemo: boolean): Promise<StudentContextRow | null>;
  agentInsights(period: Period): Promise<AgentInsightsRow>;
}

export interface AgentInsightsRow {
  runsByStatus: Array<{ key: string; count: number }>;
  requiresHumanValidation: number;
  averageConfidence: number | null;
  recommendationsByType: Array<{ key: string; count: number }>;
  helpful: number;
  notHelpful: number;
  interactionsByIntent: Array<{ key: string; count: number }>;
  interactionsByStatus: Array<{ key: string; count: number }>;
  knowledgeAnswered: number;
  knowledgeAbstained: number;
}

const FINISHED = "('resolved', 'closed', 'cancelled')";
/** chamados considerados (sem contas fictícias quando a demonstração está desligada) */
const TICKETS = (excludeParam: string) => `
  select t.* from support_tickets t
    join students s on s.id = t.student_id
    join users u on u.id = s.user_id
   where not (${excludeParam}::boolean and u.is_demo)`;

const FOLD = (column: string) => `translate(lower(${column}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

export class PgAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: DbPool) {}

  async dashboard(input: { now: Date; viewerUserId: string; excludeDemo: boolean }): Promise<DashboardCounts> {
    const { rows } = await this.pool.query<DashboardCounts>(
      `with t as (${TICKETS('$1')})
       select
         count(*) filter (where status not in ${FINISHED})::int as "open",
         count(*) filter (where status in ('submitted', 'received', 'triage', 'reopened'))::int as "awaitingTeam",
         count(*) filter (where status = 'waiting_student')::int as "waitingStudent",
         count(*) filter (where status not in ${FINISHED} and assigned_agent_id is null)::int as "unassigned",
         count(*) filter (where status not in ${FINISHED} and assigned_agent_id = $2::uuid)::int as "assignedToMe",
         count(*) filter (where status not in ${FINISHED} and exists (
           select 1 from support_ticket_messages m where m.ticket_id = t.id and m.sender_type = 'student' and m.read_at is null))::int as "unreadFromStudents",
         count(*) filter (where sla_completed_at is null and sla_paused_at is null and sla_due_at > $3
           and sla_due_at - $3 <= greatest((sla_due_at - sla_started_at) * 0.25, interval '8 hours'))::int as "slaNearDeadline",
         count(*) filter (where sla_completed_at is null and sla_paused_at is null and sla_due_at <= $3)::int as "slaOverdue"
       from t`,
      [input.excludeDemo, input.viewerUserId, input.now],
    );
    return rows[0]!;
  }

  async kpis(period: Period): Promise<MetricsKpiRow> {
    const { rows } = await this.pool.query<MetricsKpiRow>(
      `with t as (${TICKETS('$3')})
       select
         (select count(*) from t where created_at >= $1 and created_at < $2)::int as created,
         (select count(*) from t where resolved_at >= $1 and resolved_at < $2)::int as resolved,
         (select count(*) from t where status not in ${FINISHED})::int as backlog,
         (select percentile_cont(0.5) within group (order by extract(epoch from (fr.first_at - t.created_at)) / 60)
            from t join lateral (
              select min(e.created_at) as first_at from support_ticket_events e
               where e.ticket_id = t.id and e.visibility = 'public' and e.actor_type in ('agent', 'department')
            ) fr on fr.first_at is not null
           where t.created_at >= $1 and t.created_at < $2) as "firstResponseMedianMinutes",
         (select (count(*) filter (where fr.first_at is not null and fr.first_at <= t.first_response_due_at))::float / nullif(count(*), 0)
            from t left join lateral (
              select min(e.created_at) as first_at from support_ticket_events e
               where e.ticket_id = t.id and e.visibility = 'public' and e.actor_type in ('agent', 'department')
            ) fr on true
           where t.created_at >= $1 and t.created_at < $2 and t.first_response_due_at is not null
             and (fr.first_at is not null or t.first_response_due_at < now())) as "firstResponseOnTime",
         (select count(*) from t left join lateral (
              select min(e.created_at) as first_at from support_ticket_events e
               where e.ticket_id = t.id and e.visibility = 'public' and e.actor_type in ('agent', 'department')
            ) fr on true
           where t.created_at >= $1 and t.created_at < $2 and t.first_response_due_at is not null
             and (fr.first_at is not null or t.first_response_due_at < now()))::int as "firstResponseMeasured",
         (select percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - created_at)) / 60)
            from t where resolved_at >= $1 and resolved_at < $2) as "resolutionMedianMinutes",
         (select (count(*) filter (where sla_completed_at <= sla_due_at))::float / nullif(count(*), 0)
            from t where sla_completed_at >= $1 and sla_completed_at < $2 and status <> 'cancelled') as "slaCompliance",
         (select count(*) from t where sla_completed_at >= $1 and sla_completed_at < $2 and status <> 'cancelled')::int as "slaCompletedCount",
         (select avg(r.rating)::float from support_ticket_ratings r join t on t.id = r.ticket_id where r.created_at >= $1 and r.created_at < $2) as "ratingAverage",
         (select count(*) from support_ticket_ratings r join t on t.id = r.ticket_id where r.created_at >= $1 and r.created_at < $2)::int as "ratingCount"`,
      [period.from, period.to, period.excludeDemo],
    );
    const row = rows[0]!;
    return {
      ...row,
      firstResponseMedianMinutes: row.firstResponseMedianMinutes === null ? null : Math.round(Number(row.firstResponseMedianMinutes)),
      resolutionMedianMinutes: row.resolutionMedianMinutes === null ? null : Math.round(Number(row.resolutionMedianMinutes)),
    };
  }

  async dailySeries(period: Period): Promise<Array<{ date: string; created: number; resolved: number }>> {
    const { rows } = await this.pool.query<{ date: string; created: number; resolved: number }>(
      `with t as (${TICKETS('$4')}),
            days as (
              select to_char(d, 'YYYY-MM-DD') as date from generate_series(
                ($1::timestamptz at time zone $3)::date, (($2::timestamptz - interval '1 second') at time zone $3)::date, interval '1 day') d),
            created as (select to_char((created_at at time zone $3)::date, 'YYYY-MM-DD') as date, count(*)::int as n from t where created_at >= $1 and created_at < $2 group by 1),
            resolved as (select to_char((resolved_at at time zone $3)::date, 'YYYY-MM-DD') as date, count(*)::int as n from t where resolved_at >= $1 and resolved_at < $2 group by 1)
       select days.date, coalesce(created.n, 0) as created, coalesce(resolved.n, 0) as resolved
         from days left join created using (date) left join resolved using (date) order by days.date`,
      [period.from, period.to, period.timezone, period.excludeDemo],
    );
    return rows;
  }

  async createdByCategory(period: Period): Promise<Array<{ key: string; count: number }>> {
    const { rows } = await this.pool.query<{ key: string; count: number }>(
      `with t as (${TICKETS('$3')}) select category_id as key, count(*)::int as count from t where created_at >= $1 and created_at < $2 group by 1 order by 2 desc, 1`,
      [period.from, period.to, period.excludeDemo],
    );
    return rows;
  }

  async backlogByStatus(excludeDemo: boolean): Promise<Array<{ key: string; count: number }>> {
    const { rows } = await this.pool.query<{ key: string; count: number }>(
      `with t as (${TICKETS('$1')}) select status as key, count(*)::int as count from t where status not in ${FINISHED} group by 1 order by 2 desc, 1`,
      [excludeDemo],
    );
    return rows;
  }

  async backlogByTeam(excludeDemo: boolean): Promise<Array<{ key: string; count: number }>> {
    const { rows } = await this.pool.query<{ key: string; count: number }>(
      `with t as (${TICKETS('$1')}) select assigned_team as key, count(*)::int as count from t where status not in ${FINISHED} group by 1 order by 2 desc, 1`,
      [excludeDemo],
    );
    return rows;
  }

  async exportTickets(period: Period, limit: number): Promise<ExportRow[]> {
    const { rows } = await this.pool.query<ExportRow>(
      `with t as (${TICKETS('$3')})
       select t.protocol, t.created_at as "createdAt", t.category_id as "categoryId", t.subcategory_id as "subcategoryId", t.status, t.priority,
              t.assigned_team as "assignedTeam", t.channel, t.sla_started_at as "slaStartedAt", t.sla_due_at as "slaDueAt",
              t.sla_paused_at as "slaPausedAt", t.sla_completed_at as "slaCompletedAt",
              (select min(e.created_at) from support_ticket_events e where e.ticket_id = t.id and e.visibility = 'public' and e.actor_type in ('agent', 'department')) as "firstResponseAt",
              t.resolved_at as "resolvedAt", r.rating
         from t left join support_ticket_ratings r on r.ticket_id = t.id
        where t.created_at >= $1 and t.created_at < $2
        order by t.created_at, t.id
        limit $4`,
      [period.from, period.to, period.excludeDemo, limit],
    );
    return rows;
  }

  private contextSql(where: string): string {
    return `select s.id as "studentId", u.full_name as "fullName", u.email, s.registration_number as "registrationNumber", s.program,
              coalesce(t.total, 0)::int as "ticketsTotal", coalesce(t.open, 0)::int as "ticketsOpen",
              nullif(greatest(coalesce(t.last_at, '-infinity'), coalesce(ap.last_at, '-infinity')), '-infinity') as "lastInteractionAt"
         from students s
         join users u on u.id = s.user_id
         left join lateral (
           select count(*) as total, count(*) filter (where status not in ${FINISHED}) as open, max(updated_at) as last_at
             from support_tickets where student_id = s.id) t on true
         left join lateral (
           select count(*) as total, max(updated_at) as last_at from appointments where student_id = s.id) ap on true
        where (coalesce(t.total, 0) > 0 or coalesce(ap.total, 0) > 0) ${where}`;
  }

  async studentContexts(input: { search: string | null; limit: number; offset: number; excludeDemo: boolean }): Promise<{ items: StudentContextRow[]; total: number }> {
    const { rows } = await this.pool.query<StudentContextRow & { total: number }>(
      `select *, count(*) over ()::int as total from (
         ${this.contextSql(`and not ($1::boolean and u.is_demo) and ($2::text is null or ${FOLD('u.full_name')} like $2 or lower(s.registration_number) like $2)`)}
       ) contexts
       order by "lastInteractionAt" desc nulls last, "studentId"
       limit $3 offset $4`,
      [input.excludeDemo, input.search ? `%${input.search}%` : null, input.limit, input.offset],
    );
    return { items: rows.map(({ total: _total, ...row }) => row), total: rows[0]?.total ?? 0 };
  }

  async studentContext(studentId: string, excludeDemo: boolean): Promise<StudentContextRow | null> {
    const { rows } = await this.pool.query<StudentContextRow>(this.contextSql('and s.id = $1 and not ($2::boolean and u.is_demo)'), [studentId, excludeDemo]);
    return rows[0] ?? null;
  }

  /** Indicadores agregados do Agente e do Assistente (sem identificar estudantes). */
  async agentInsights(period: Period): Promise<AgentInsightsRow> {
    const demo = 'join students s on s.id = x.student_id join users u on u.id = s.user_id where not ($3::boolean and u.is_demo)';
    const args = [period.from, period.to, period.excludeDemo];
    const [runs, totals, recommendations, feedback, intents, statuses, knowledge] = await Promise.all([
      this.pool.query<{ key: string; count: number }>(`select x.status as key, count(*)::int as count from agent_runs x ${demo} and x.created_at >= $1 and x.created_at < $2 group by 1`, args),
      this.pool.query<{ human: number; confidence: number | null }>(
        `select (count(*) filter (where x.requires_human_validation))::int as human, avg(x.confidence)::float as confidence from agent_runs x ${demo} and x.created_at >= $1 and x.created_at < $2`,
        args,
      ),
      this.pool.query<{ key: string; count: number }>(
        `select r.type as key, count(*)::int as count from agent_recommendations r join agent_runs x on x.run_id = r.run_id ${demo} and x.created_at >= $1 and x.created_at < $2 group by 1 order by 2 desc`,
        args,
      ),
      this.pool.query<{ helpful: number; not_helpful: number }>(
        `select (count(*) filter (where x.feedback_type = 'helpful'))::int as helpful, (count(*) filter (where x.feedback_type = 'not_helpful'))::int as not_helpful
           from agent_feedback x ${demo} and x.created_at >= $1 and x.created_at < $2`,
        args,
      ),
      this.pool.query<{ key: string; count: number }>(
        `select x.intent as key, count(*)::int as count from assistant_interactions x ${demo} and x.created_at >= $1 and x.created_at < $2 group by 1 order by 2 desc limit 12`,
        args,
      ),
      this.pool.query<{ key: string; count: number }>(
        `select x.status as key, count(*)::int as count from assistant_interactions x ${demo} and x.created_at >= $1 and x.created_at < $2 group by 1 order by 2 desc`,
        args,
      ),
      this.pool.query<{ answered: number; abstained: number }>(
        `select (count(*) filter (where x.intent = 'knowledge_question' and x.status = 'success'))::int as answered,
                (count(*) filter (where x.intent = 'unknown' and x.status = 'abstained'))::int as abstained
           from assistant_interactions x ${demo} and x.created_at >= $1 and x.created_at < $2`,
        args,
      ),
    ]);
    return {
      runsByStatus: runs.rows,
      requiresHumanValidation: totals.rows[0]?.human ?? 0,
      averageConfidence: totals.rows[0]?.confidence ?? null,
      recommendationsByType: recommendations.rows,
      helpful: feedback.rows[0]?.helpful ?? 0,
      notHelpful: feedback.rows[0]?.not_helpful ?? 0,
      interactionsByIntent: intents.rows,
      interactionsByStatus: statuses.rows,
      knowledgeAnswered: knowledge.rows[0]?.answered ?? 0,
      knowledgeAbstained: knowledge.rows[0]?.abstained ?? 0,
    };
  }
}
