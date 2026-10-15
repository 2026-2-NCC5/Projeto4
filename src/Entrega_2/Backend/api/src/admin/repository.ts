import type { AutomationAction, AutomationTrigger, SupportSlaStatus, SupportTicketPriority, SupportTicketStatus, UserRole } from '../contracts/mobileApi.v1.js';
import type { DbPool } from '../db/pool.js';

export interface SlaPolicyRecord {
  categoryId: string;
  firstResponseHours: number;
  resolutionBusinessDays: number;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: Date;
}

export interface AutomationRuleRecord {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: { categoryIds?: string[]; priorities?: SupportTicketPriority[] };
  action: AutomationAction;
  actionParams: { audience?: 'team' | 'assigned'; priority?: 'high' | 'urgent' };
  enabled: boolean;
  updatedAt: Date;
}

export interface AutomationRunRecord {
  id: string;
  ruleId: string;
  ticketId: string;
  ticketProtocol: string;
  trigger: AutomationTrigger;
  status: 'applied' | 'skipped' | 'failed';
  detail: string | null;
  createdAt: Date;
}

export interface TicketMetadataRow {
  id: string;
  protocol: string;
  categoryId: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  team: string;
  channel: 'app' | 'web';
  createdAt: Date;
  updatedAt: Date;
  slaStartedAt: Date;
  slaDueAt: Date;
  slaPausedAt: Date | null;
  slaCompletedAt: Date | null;
}

export interface AdminRepository {
  appliedMigrations(): Promise<string[]>;
  userCounts(excludeDemo: boolean): Promise<Array<{ role: UserRole; active: boolean; total: number }>>;
  activeSessionFamilies(now: Date, excludeDemo: boolean): Promise<number>;
  auditOutcomeCounts(since: Date): Promise<{ failedLogins: number; denied: number }>;
  ticketMetadata(filter: { statuses?: SupportTicketStatus[]; categoryId?: string; excludeDemo: boolean; limit: number; offset: number }): Promise<{ items: TicketMetadataRow[]; total: number }>;
  // ---- SLA
  listSlaPolicies(): Promise<SlaPolicyRecord[]>;
  upsertSlaPolicy(input: { categoryId: string; firstResponseHours: number; resolutionBusinessDays: number; updatedBy: string; now: Date }): Promise<void>;
  // ---- automações
  listRules(): Promise<AutomationRuleRecord[]>;
  findRule(id: string): Promise<AutomationRuleRecord | null>;
  createRule(input: Omit<AutomationRuleRecord, 'id' | 'updatedAt'> & { createdBy: string }): Promise<AutomationRuleRecord>;
  updateRule(id: string, patch: Partial<Omit<AutomationRuleRecord, 'id' | 'updatedAt'>> & { updatedBy: string }): Promise<AutomationRuleRecord | null>;
  /** Reserva a execução (regra × chamado × gatilho). null = já executada antes (idempotência). */
  claimRun(input: { ruleId: string; ticketId: string; trigger: AutomationTrigger }): Promise<string | null>;
  finishRun(id: string, status: 'applied' | 'skipped' | 'failed', detail: string | null): Promise<void>;
  listRuns(ruleId: string, limit: number): Promise<AutomationRunRecord[]>;
  runStats(): Promise<Map<string, { applied: number; skipped: number; failed: number; lastRunAt: Date | null }>>;
}

const RULE_COLUMNS = 'id, name, description, trigger, conditions, action, action_params, enabled, updated_at';

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationRuleRecord['conditions'];
  action: AutomationAction;
  action_params: AutomationRuleRecord['actionParams'];
  enabled: boolean;
  updated_at: Date;
}

const mapRule = (row: RuleRow): AutomationRuleRecord => ({
  id: row.id,
  name: row.name,
  description: row.description,
  trigger: row.trigger,
  conditions: row.conditions ?? {},
  action: row.action,
  actionParams: row.action_params ?? {},
  enabled: row.enabled,
  updatedAt: row.updated_at,
});

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly pool: DbPool) {}

  async appliedMigrations(): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>('select name from schema_migrations order by name');
    return rows.map((row) => row.name);
  }

  async userCounts(excludeDemo: boolean): Promise<Array<{ role: UserRole; active: boolean; total: number }>> {
    const { rows } = await this.pool.query<{ role: UserRole; active: boolean; total: number }>(
      'select role, is_active as active, count(*)::int as total from users where not ($1::boolean and is_demo) group by 1, 2',
      [excludeDemo],
    );
    return rows;
  }

  async activeSessionFamilies(now: Date, excludeDemo: boolean): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>(
      `select count(distinct rs.family_id)::int as total from refresh_sessions rs join users u on u.id = rs.user_id
        where rs.revoked_at is null and rs.expires_at > $1 and not ($2::boolean and u.is_demo)`,
      [now, excludeDemo],
    );
    return rows[0]?.total ?? 0;
  }

  async auditOutcomeCounts(since: Date): Promise<{ failedLogins: number; denied: number }> {
    const { rows } = await this.pool.query<{ failed: number; denied: number }>(
      `select (count(*) filter (where action = 'auth.login_failed'))::int as failed, (count(*) filter (where outcome = 'denied'))::int as denied
         from audit_events where occurred_at >= $1`,
      [since],
    );
    return { failedLogins: rows[0]?.failed ?? 0, denied: rows[0]?.denied ?? 0 };
  }

  async ticketMetadata(filter: { statuses?: SupportTicketStatus[]; categoryId?: string; excludeDemo: boolean; limit: number; offset: number }) {
    const { rows } = await this.pool.query<{
      id: string; protocol: string; category_id: string; status: SupportTicketStatus; priority: SupportTicketPriority; assigned_team: string; channel: 'app' | 'web';
      created_at: Date; updated_at: Date; sla_started_at: Date; sla_due_at: Date; sla_paused_at: Date | null; sla_completed_at: Date | null; total: number;
    }>(
      `select t.id, t.protocol, t.category_id, t.status, t.priority, t.assigned_team, t.channel, t.created_at, t.updated_at,
              t.sla_started_at, t.sla_due_at, t.sla_paused_at, t.sla_completed_at, count(*) over ()::int as total
         from support_tickets t join students s on s.id = t.student_id join users u on u.id = s.user_id
        where ($1::text[] is null or t.status = any($1)) and ($2::text is null or t.category_id = $2) and not ($3::boolean and u.is_demo)
        order by t.updated_at desc, t.id limit $4 offset $5`,
      [filter.statuses ?? null, filter.categoryId ?? null, filter.excludeDemo, filter.limit, filter.offset],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        protocol: row.protocol,
        categoryId: row.category_id,
        status: row.status,
        priority: row.priority,
        team: row.assigned_team,
        channel: row.channel,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        slaStartedAt: row.sla_started_at,
        slaDueAt: row.sla_due_at,
        slaPausedAt: row.sla_paused_at,
        slaCompletedAt: row.sla_completed_at,
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async listSlaPolicies(): Promise<SlaPolicyRecord[]> {
    const { rows } = await this.pool.query<{ category_id: string; first_response_hours: number; resolution_business_days: number; updated_by: string | null; updated_by_name: string | null; updated_at: Date }>(
      `select p.category_id, p.first_response_hours, p.resolution_business_days, p.updated_by, u.full_name as updated_by_name, p.updated_at
         from sla_policies p left join users u on u.id = p.updated_by`,
    );
    return rows.map((row) => ({
      categoryId: row.category_id,
      firstResponseHours: row.first_response_hours,
      resolutionBusinessDays: row.resolution_business_days,
      updatedBy: row.updated_by,
      updatedByName: row.updated_by_name,
      updatedAt: row.updated_at,
    }));
  }

  async upsertSlaPolicy(input: { categoryId: string; firstResponseHours: number; resolutionBusinessDays: number; updatedBy: string; now: Date }): Promise<void> {
    await this.pool.query(
      `insert into sla_policies (category_id, first_response_hours, resolution_business_days, updated_by, updated_at) values ($1, $2, $3, $4, $5)
       on conflict (category_id) do update set first_response_hours = excluded.first_response_hours, resolution_business_days = excluded.resolution_business_days,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [input.categoryId, input.firstResponseHours, input.resolutionBusinessDays, input.updatedBy, input.now],
    );
  }

  async listRules(): Promise<AutomationRuleRecord[]> {
    const { rows } = await this.pool.query<RuleRow>(`select ${RULE_COLUMNS} from automation_rules order by created_at, id`);
    return rows.map(mapRule);
  }

  async findRule(id: string): Promise<AutomationRuleRecord | null> {
    const { rows } = await this.pool.query<RuleRow>(`select ${RULE_COLUMNS} from automation_rules where id = $1`, [id]);
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async createRule(input: Omit<AutomationRuleRecord, 'id' | 'updatedAt'> & { createdBy: string }): Promise<AutomationRuleRecord> {
    const { rows } = await this.pool.query<RuleRow>(
      `insert into automation_rules (name, description, trigger, conditions, action, action_params, enabled, created_by, updated_by)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $8) returning ${RULE_COLUMNS}`,
      [input.name, input.description, input.trigger, JSON.stringify(input.conditions), input.action, JSON.stringify(input.actionParams), input.enabled, input.createdBy],
    );
    return mapRule(rows[0]!);
  }

  async updateRule(id: string, patch: Partial<Omit<AutomationRuleRecord, 'id' | 'updatedAt'>> & { updatedBy: string }): Promise<AutomationRuleRecord | null> {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);
    const { rows } = await this.pool.query<RuleRow>(
      `update automation_rules set
          name = coalesce($2, name), description = case when $3 then $4 else description end, trigger = coalesce($5, trigger),
          conditions = coalesce($6::jsonb, conditions), action = coalesce($7, action), action_params = coalesce($8::jsonb, action_params),
          enabled = coalesce($9, enabled), updated_by = $10
        where id = $1 returning ${RULE_COLUMNS}`,
      [
        id,
        patch.name ?? null,
        has('description'),
        patch.description ?? null,
        patch.trigger ?? null,
        patch.conditions ? JSON.stringify(patch.conditions) : null,
        patch.action ?? null,
        patch.actionParams ? JSON.stringify(patch.actionParams) : null,
        patch.enabled ?? null,
        patch.updatedBy,
      ],
    );
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async claimRun(input: { ruleId: string; ticketId: string; trigger: AutomationTrigger }): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into automation_runs (rule_id, ticket_id, trigger, status) values ($1, $2, $3, 'applied')
       on conflict (rule_id, ticket_id, trigger) do nothing returning id`,
      [input.ruleId, input.ticketId, input.trigger],
    );
    return rows[0]?.id ?? null;
  }

  async finishRun(id: string, status: 'applied' | 'skipped' | 'failed', detail: string | null): Promise<void> {
    await this.pool.query('update automation_runs set status = $2, detail = $3 where id = $1', [id, status, detail?.slice(0, 300) ?? null]);
  }

  async listRuns(ruleId: string, limit: number): Promise<AutomationRunRecord[]> {
    const { rows } = await this.pool.query<{ id: string; rule_id: string; ticket_id: string; protocol: string; trigger: AutomationTrigger; status: AutomationRunRecord['status']; detail: string | null; created_at: Date }>(
      `select r.id, r.rule_id, r.ticket_id, t.protocol, r.trigger, r.status, r.detail, r.created_at
         from automation_runs r join support_tickets t on t.id = r.ticket_id where r.rule_id = $1 order by r.created_at desc limit $2`,
      [ruleId, limit],
    );
    return rows.map((row) => ({ id: row.id, ruleId: row.rule_id, ticketId: row.ticket_id, ticketProtocol: row.protocol, trigger: row.trigger, status: row.status, detail: row.detail, createdAt: row.created_at }));
  }

  async runStats(): Promise<Map<string, { applied: number; skipped: number; failed: number; lastRunAt: Date | null }>> {
    const { rows } = await this.pool.query<{ rule_id: string; applied: number; skipped: number; failed: number; last_at: Date | null }>(
      `select rule_id, (count(*) filter (where status = 'applied'))::int as applied, (count(*) filter (where status = 'skipped'))::int as skipped,
              (count(*) filter (where status = 'failed'))::int as failed, max(created_at) as last_at
         from automation_runs group by rule_id`,
    );
    return new Map(rows.map((row) => [row.rule_id, { applied: row.applied, skipped: row.skipped, failed: row.failed, lastRunAt: row.last_at }]));
  }
}

export type { SupportSlaStatus };
