import type { DbPool } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import { ConflictError } from '../errors/AppError.js';
import type {
  AgentRecommendationRecord,
  AgentFeedbackRecord,
  AgentRunRecord,
  AgentRunWithRecommendations,
  AssessmentRecord,
  AssistantInteractionRecord,
  AttendanceAggregateRecord,
  DeviceCredentialRecord,
  EnrollmentRecord,
  PasswordResetRecord,
  PendingItemRecord,
  ProgramRecord,
  RefreshSessionRecord,
  SessionFamilyRecord,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '../types/domain.js';
import type { SessionChannel } from '../contracts/mobileApi.v1.js';
import type { UserAdminRecord, UserListQuery } from '../platform/types.js';
import type {
  AccountRepository,
  NewSessionInput,
  AgentRunRepository,
  AssistantInteractionRepository,
  DeviceCredentialRepository,
  PasswordResetRepository,
  ProgramRepository,
  Repositories,
  SessionRepository,
  StudentRepository,
  UserRepository,
} from './types.js';
// ---- support (Atendimento)
import { createPgSupportRepository } from './pgSupportRepository.js';
// ---- platform (portal web, auditoria, avisos)
import { createPgPlatformRepositories } from './pgPlatformRepositories.js';
import { PgAnalyticsRepository } from '../operations/analyticsRepository.js';
import { PgAppointmentRepository } from '../appointments/pgRepository.js';
import { PgKnowledgeRepository } from '../knowledge/pgRepository.js';
import { PgAdminRepository } from '../admin/repository.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRecord['role'];
  is_active: boolean;
  is_demo: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

const USER_COLUMNS = 'id, email, password_hash, full_name, role, is_active, is_demo, last_login_at, created_at';

const mapUser = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  isDemo: row.is_demo,
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
});

interface UserAdminRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRecord['role'];
  is_active: boolean;
  is_demo: boolean;
  created_at: Date;
  last_login_at: Date | null;
  invited_at: Date | null;
  student_id: string | null;
  registration_number: string | null;
  active_sessions: number;
  total?: number;
}

const mapUserAdmin = (row: UserAdminRow): UserAdminRecord => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  isDemo: row.is_demo,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
  invitedAt: row.invited_at,
  studentId: row.student_id,
  registrationNumber: row.registration_number,
  activeSessions: row.active_sessions,
});

/** Remove acentos em SQL para a busca por nome/e-mail (sem depender da extensão unaccent). */
const FOLD = (column: string) => `translate(lower(${column}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

const USER_ADMIN_SELECT = `
  select u.id, u.email, u.full_name, u.role, u.is_active, u.is_demo, u.created_at, u.last_login_at, u.invited_at,
         s.id as student_id, s.registration_number,
         (select count(distinct rs.family_id)::int from refresh_sessions rs
           where rs.user_id = u.id and rs.revoked_at is null and rs.expires_at > now()) as active_sessions`;

class PgUserRepository implements UserRepository {
  constructor(private readonly pool: DbPool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(`select ${USER_COLUMNS} from users where lower(email) = lower($1)`, [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1`, [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async touchLogin(userId: string, at: Date): Promise<void> {
    await this.pool.query('update users set last_login_at = $2 where id = $1', [userId, at]);
  }

  async list(query: UserListQuery): Promise<{ items: UserAdminRecord[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(${FOLD('u.full_name')} like $${params.length} or lower(u.email) like $${params.length})`);
    }
    if (query.role) {
      params.push(query.role);
      where.push(`u.role = $${params.length}`);
    }
    if (query.status) where.push(query.status === 'active' ? 'u.is_active' : 'not u.is_active');
    if (!query.includeDemo) where.push('not u.is_demo');
    const clause = where.length > 0 ? `where ${where.join(' and ')}` : '';
    params.push(query.limit, query.offset);
    const { rows } = await this.pool.query<UserAdminRow>(
      `${USER_ADMIN_SELECT}, count(*) over ()::int as total
         from users u left join students s on s.user_id = u.id
         ${clause}
         order by u.created_at desc, u.id
         limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return { items: rows.map(mapUserAdmin), total: rows[0]?.total ?? (query.offset > 0 ? await this.count(clause, params.slice(0, -2)) : 0) };
  }

  private async count(clause: string, params: unknown[]): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>(`select count(*)::int as total from users u ${clause}`, params);
    return rows[0]?.total ?? 0;
  }

  async findAdminById(id: string): Promise<UserAdminRecord | null> {
    const { rows } = await this.pool.query<UserAdminRow>(`${USER_ADMIN_SELECT} from users u left join students s on s.user_id = u.id where u.id = $1`, [id]);
    return rows[0] ? mapUserAdmin(rows[0]) : null;
  }

  async createInvited(input: Parameters<UserRepository['createInvited']>[0]): Promise<UserRecord> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `insert into users (email, password_hash, full_name, role, is_demo, invited_by, invited_at) values ($1, $2, $3, $4, $5, $6, $7)
         returning ${USER_COLUMNS}`,
        [input.email, input.passwordHash, input.fullName, input.role, input.isDemo, input.invitedBy, input.now],
      );
      return mapUser(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Já existe uma conta com este e-mail.', 'account_exists');
      throw error;
    }
  }

  async update(id: string, patch: { role?: UserRecord['role']; isActive?: boolean }, options: { keepActiveAdmin?: boolean } = {}): Promise<UserRecord | null> {
    return withTransaction(this.pool, async (client) => {
      if (options.keepActiveAdmin) {
        // trava as administrações ativas antes de contar: uma segunda transação concorrente espera e recalcula
        const { rows: admins } = await client.query<{ id: string }>("select id from users where role = 'technical_admin' and is_active order by id for update");
        if (admins.filter((row) => row.id !== id).length === 0) throw new ConflictError('É preciso manter pelo menos uma conta de administração ativa.', 'last_admin');
      }
      const { rows } = await client.query<UserRow>(
        `update users set role = coalesce($2, role), is_active = coalesce($3, is_active) where id = $1 returning ${USER_COLUMNS}`,
        [id, patch.role ?? null, patch.isActive ?? null],
      );
      return rows[0] ? mapUser(rows[0]) : null;
    });
  }

  async countActiveByRole(role: UserRecord['role']): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>('select count(*)::int as total from users where role = $1 and is_active', [role]);
    return rows[0]?.total ?? 0;
  }

  async listActiveIdsByRole(role: UserRecord['role'], includeDemo: boolean): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from users where role = $1 and is_active ${includeDemo ? '' : 'and not is_demo'} order by created_at`,
      [role],
    );
    return rows.map((row) => row.id);
  }
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  remember_me: boolean;
  channel: SessionChannel;
  family_id: string;
  device_label: string | null;
  last_used_at: Date | null;
  created_at: Date;
}

const SESSION_COLUMNS = 'id, user_id, token_hash, expires_at, revoked_at, remember_me, channel, family_id, device_label, last_used_at, created_at';

const mapSession = (row: SessionRow): RefreshSessionRecord => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  rememberMe: row.remember_me,
  channel: row.channel,
  familyId: row.family_id,
  deviceLabel: row.device_label,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
});

interface SessionFamilyRow {
  family_id: string;
  user_id: string;
  channel: SessionChannel;
  device_label: string | null;
  remember_me: boolean;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  active_session_id: string;
}

class PgSessionRepository implements SessionRepository {
  constructor(private readonly pool: DbPool) {}

  async create(input: NewSessionInput): Promise<RefreshSessionRecord> {
    const { rows } = await this.pool.query<SessionRow>(
      `insert into refresh_sessions (user_id, token_hash, expires_at, remember_me, channel, family_id, device_label, last_used_at)
       values ($1, $2, $3, $4, $5, coalesce($6::uuid, gen_random_uuid()), $7, now())
       returning ${SESSION_COLUMNS}`,
      [input.userId, input.tokenHash, input.expiresAt, input.rememberMe, input.channel ?? 'mobile', input.familyId ?? null, input.deviceLabel ?? null],
    );
    return mapSession(rows[0]!);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const { rows } = await this.pool.query<SessionRow>(`select ${SESSION_COLUMNS} from refresh_sessions where token_hash = $1`, [tokenHash]);
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async findById(id: string): Promise<RefreshSessionRecord | null> {
    const { rows } = await this.pool.query<SessionRow>(`select ${SESSION_COLUMNS} from refresh_sessions where id = $1`, [id]);
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query('update refresh_sessions set revoked_at = now() where id = $1 and revoked_at is null', [id]);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query('update refresh_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
  }

  async listFamilies(userId: string, now: Date): Promise<SessionFamilyRecord[]> {
    // linha ativa de cada família + início da família (primeira linha) para "conectado desde"
    const { rows } = await this.pool.query<SessionFamilyRow>(
      `select active.family_id, active.user_id, active.channel, active.device_label, active.remember_me,
              first.created_at, active.last_used_at, active.expires_at, active.id as active_session_id
         from refresh_sessions active
         join lateral (select min(created_at) as created_at from refresh_sessions f where f.family_id = active.family_id) first on true
        where active.user_id = $1 and active.revoked_at is null and active.expires_at > $2
        order by coalesce(active.last_used_at, active.created_at) desc`,
      [userId, now],
    );
    return rows.map((row) => ({
      familyId: row.family_id,
      userId: row.user_id,
      channel: row.channel,
      deviceLabel: row.device_label,
      rememberMe: row.remember_me,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      activeSessionId: row.active_session_id,
    }));
  }

  async revokeFamily(userId: string, familyId: string): Promise<number> {
    const result = await this.pool.query('update refresh_sessions set revoked_at = now() where user_id = $1 and family_id = $2 and revoked_at is null', [userId, familyId]);
    return result.rowCount ?? 0;
  }

  async revokeAllExcept(userId: string, keepFamilyId: string | null): Promise<number> {
    const { rows } = await this.pool.query<{ families: number }>(
      `with revoked as (
         update refresh_sessions set revoked_at = now()
          where user_id = $1 and revoked_at is null and ($2::uuid is null or family_id <> $2::uuid)
          returning family_id)
       select count(distinct family_id)::int as families from revoked`,
      [userId, keepFamilyId],
    );
    return rows[0]?.families ?? 0;
  }

  async revokeAllForDemoUsers(): Promise<number> {
    const result = await this.pool.query(
      'update refresh_sessions set revoked_at = now() where revoked_at is null and user_id in (select id from users where is_demo)',
    );
    return result.rowCount ?? 0;
  }
}

interface StudentRow {
  id: string;
  user_id: string;
  registration_number: string;
  program: string | null;
}

const mapStudent = (row: StudentRow): StudentRecord => ({
  id: row.id,
  userId: row.user_id,
  registrationNumber: row.registration_number,
  program: row.program,
});

class PgStudentRepository implements StudentRepository {
  constructor(private readonly pool: DbPool) {}

  async findByUserId(userId: string): Promise<StudentRecord | null> {
    const { rows } = await this.pool.query<StudentRow>(
      'select id, user_id, registration_number, program from students where user_id = $1',
      [userId],
    );
    return rows[0] ? mapStudent(rows[0]) : null;
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<StudentRecord | null> {
    const { rows } = await this.pool.query<StudentRow>(
      'select id, user_id, registration_number, program from students where registration_number = $1',
      [registrationNumber],
    );
    return rows[0] ? mapStudent(rows[0]) : null;
  }

  async findById(studentId: string): Promise<StudentRecord | null> {
    const { rows } = await this.pool.query<StudentRow>(
      'select id, user_id, registration_number, program from students where id = $1',
      [studentId],
    );
    return rows[0] ? mapStudent(rows[0]) : null;
  }

  async listEnrollments(studentId: string): Promise<EnrollmentRecord[]> {
    const { rows } = await this.pool.query<{ enrollment_id: string; subject_id: string; code: string; name: string; status: EnrollmentRecord['status'] }>(
      `select e.id as enrollment_id, s.id as subject_id, s.code, s.name, e.status
         from enrollments e join subjects s on s.id = e.subject_id
        where e.student_id = $1
        order by s.name`,
      [studentId],
    );
    return rows.map((row) => ({ enrollmentId: row.enrollment_id, subjectId: row.subject_id, code: row.code, name: row.name, status: row.status }));
  }

  async listAssessments(studentId: string): Promise<AssessmentRecord[]> {
    const { rows } = await this.pool.query<{
      id: string; subject_id: string; subject_name: string; title: string; type: AssessmentRecord['type']; score: number | null; max_score: number; applied_at: string | null;
    }>(
      `select a.id, s.id as subject_id, s.name as subject_name, a.title, a.type, a.score, a.max_score, a.applied_at
         from assessments a
         join enrollments e on e.id = a.enrollment_id
         join subjects s on s.id = e.subject_id
        where e.student_id = $1
        order by a.applied_at nulls last, a.id`,
      [studentId],
    );
    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      title: row.title,
      type: row.type,
      score: row.score,
      maxScore: row.max_score,
      appliedAt: row.applied_at,
    }));
  }

  async listAttendance(studentId: string): Promise<AttendanceAggregateRecord[]> {
    const { rows } = await this.pool.query<{ subject_id: string; subject_name: string; total_classes: number; attended_classes: number }>(
      `select s.id as subject_id, s.name as subject_name,
              count(a.id)::int as total_classes,
              count(a.id) filter (where a.present)::int as attended_classes
         from enrollments e
         join subjects s on s.id = e.subject_id
         left join attendance a on a.enrollment_id = e.id
        where e.student_id = $1
        group by s.id, s.name
        order by s.name`,
      [studentId],
    );
    return rows.map((row) => ({ subjectId: row.subject_id, subjectName: row.subject_name, totalClasses: row.total_classes, attendedClasses: row.attended_classes }));
  }

  async listSubjectCatalog(): Promise<SubjectRecord[]> {
    const { rows } = await this.pool.query<SubjectRecord>('select id, code, name from subjects order by name');
    return rows;
  }

  async listPendingItems(studentId: string): Promise<PendingItemRecord[]> {
    const { rows } = await this.pool.query<{
      id: string; subject_id: string | null; subject_name: string | null; type: string; description: string; due_date: string | null; status: PendingItemRecord['status'];
    }>(
      `select p.id, p.subject_id, s.name as subject_name, p.type, p.description, p.due_date, p.status
         from pending_items p left join subjects s on s.id = p.subject_id
        where p.student_id = $1
        order by p.due_date nulls last, p.id`,
      [studentId],
    );
    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      type: row.type,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
    }));
  }
}

interface RunRow {
  run_id: string;
  student_id: string;
  agent_name: string;
  agent_version: string;
  config_version: string;
  contract_version: string;
  request_id: string;
  correlation_id: string;
  status: AgentRunRecord['status'];
  summary: string;
  confidence: number | null;
  abstained: boolean;
  abstention_reason: string | null;
  requires_human_validation: boolean;
  duration_ms: number | null;
  evaluated_at: Date;
  created_at: Date;
}

const RUN_COLUMNS =
  'run_id, student_id, agent_name, agent_version, config_version, contract_version, request_id, correlation_id, status, summary, confidence, abstained, abstention_reason, requires_human_validation, duration_ms, evaluated_at, created_at';

const mapRun = (row: RunRow): AgentRunRecord => ({
  runId: row.run_id,
  studentId: row.student_id,
  agentName: row.agent_name,
  agentVersion: row.agent_version,
  configVersion: row.config_version,
  contractVersion: row.contract_version,
  requestId: row.request_id,
  correlationId: row.correlation_id,
  status: row.status,
  summary: row.summary,
  confidence: row.confidence,
  abstained: row.abstained,
  abstentionReason: row.abstention_reason,
  requiresHumanValidation: row.requires_human_validation,
  durationMs: row.duration_ms,
  evaluatedAt: row.evaluated_at,
  createdAt: row.created_at,
});

interface RecommendationRow {
  id: string;
  run_id: string;
  type: string;
  message: string;
  next_action: string | null;
  confidence: number | null;
  requires_human_validation: boolean;
  priority: number;
  subject_id: string | null;
}

interface EvidenceRow {
  recommendation_id: string;
  position: number;
  evidence_type: string;
  description: string;
  source_reference: string | null;
}

class PgAgentRunRepository implements AgentRunRepository {
  constructor(private readonly pool: DbPool) {}

  async save(run: AgentRunWithRecommendations): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `insert into agent_runs (${RUN_COLUMNS})
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          run.runId, run.studentId, run.agentName, run.agentVersion, run.configVersion, run.contractVersion,
          run.requestId, run.correlationId, run.status, run.summary, run.confidence, run.abstained,
          run.abstentionReason, run.requiresHumanValidation, run.durationMs, run.evaluatedAt, run.createdAt,
        ],
      );
      for (const rec of run.recommendations) {
        await client.query(
          `insert into agent_recommendations (id, run_id, type, message, next_action, confidence, requires_human_validation, priority, subject_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [rec.id, run.runId, rec.type, rec.message, rec.nextAction, rec.confidence, rec.requiresHumanValidation, rec.priority, rec.subjectId],
        );
        for (const evidence of rec.evidence) {
          await client.query(
            `insert into agent_evidence (recommendation_id, position, evidence_type, description, source_reference)
             values ($1,$2,$3,$4,$5)`,
            [rec.id, evidence.position, evidence.evidenceType, evidence.description, evidence.sourceReference],
          );
        }
      }
    });
  }

  private async loadRecommendations(runIds: string[]): Promise<Map<string, AgentRecommendationRecord[]>> {
    const map = new Map<string, AgentRecommendationRecord[]>();
    if (runIds.length === 0) return map;
    const { rows: recs } = await this.pool.query<RecommendationRow>(
      `select id, run_id, type, message, next_action, confidence, requires_human_validation, priority, subject_id
         from agent_recommendations where run_id = any($1) order by priority, id`,
      [runIds],
    );
    const { rows: evidences } = await this.pool.query<EvidenceRow>(
      `select recommendation_id, position, evidence_type, description, source_reference
         from agent_evidence where recommendation_id = any($1) order by position`,
      [recs.map((rec) => rec.id)],
    );
    const evidenceByRec = new Map<string, EvidenceRow[]>();
    for (const evidence of evidences) {
      const list = evidenceByRec.get(evidence.recommendation_id) ?? [];
      list.push(evidence);
      evidenceByRec.set(evidence.recommendation_id, list);
    }
    for (const rec of recs) {
      const list = map.get(rec.run_id) ?? [];
      list.push({
        id: rec.id,
        runId: rec.run_id,
        type: rec.type,
        message: rec.message,
        nextAction: rec.next_action,
        confidence: rec.confidence,
        requiresHumanValidation: rec.requires_human_validation,
        priority: rec.priority,
        subjectId: rec.subject_id,
        evidence: (evidenceByRec.get(rec.id) ?? []).map((row) => ({
          position: row.position,
          evidenceType: row.evidence_type,
          description: row.description,
          sourceReference: row.source_reference,
        })),
      });
      map.set(rec.run_id, list);
    }
    return map;
  }

  private async hydrate(row: RunRow | undefined): Promise<AgentRunWithRecommendations | null> {
    if (!row) return null;
    const run = mapRun(row);
    const recs = await this.loadRecommendations([run.runId]);
    return { ...run, recommendations: recs.get(run.runId) ?? [] };
  }

  async findLatestByStudent(studentId: string): Promise<AgentRunWithRecommendations | null> {
    const { rows } = await this.pool.query<RunRow>(
      `select ${RUN_COLUMNS} from agent_runs where student_id = $1 order by created_at desc limit 1`,
      [studentId],
    );
    return this.hydrate(rows[0]);
  }

  async findByRunId(runId: string): Promise<AgentRunWithRecommendations | null> {
    const { rows } = await this.pool.query<RunRow>(`select ${RUN_COLUMNS} from agent_runs where run_id = $1`, [runId]);
    return this.hydrate(rows[0]);
  }

  async findRecommendation(recommendationId: string): Promise<{ run: AgentRunRecord; recommendation: AgentRecommendationRecord } | null> {
    const { rows } = await this.pool.query<RecommendationRow>(
      'select id, run_id, type, message, next_action, confidence, requires_human_validation, priority, subject_id from agent_recommendations where id = $1',
      [recommendationId],
    );
    const rec = rows[0];
    if (!rec) return null;
    const run = await this.findByRunId(rec.run_id);
    if (!run) return null;
    const recommendation = run.recommendations.find((item) => item.id === rec.id);
    if (!recommendation) return null;
    return { run, recommendation };
  }

  async findFeedback(recommendationId: string, studentId: string): Promise<AgentFeedbackRecord | null> {
    const { rows } = await this.pool.query<{ feedback_type: string; comment: string | null; created_at: Date }>(
      'select feedback_type, comment, created_at from agent_feedback where recommendation_id = $1 and student_id = $2 order by created_at limit 1',
      [recommendationId, studentId],
    );
    const row = rows[0];
    return row ? { recommendationId, studentId, helpful: row.feedback_type === 'helpful', comment: row.comment, createdAt: row.created_at } : null;
  }

  async saveFeedback(input: { recommendationId: string; studentId: string; helpful: boolean; comment: string | null; now: Date }): Promise<AgentFeedbackRecord> {
    await this.pool.query(
      'insert into agent_feedback (recommendation_id, student_id, feedback_type, comment, created_at) values ($1, $2, $3, $4, $5)',
      [input.recommendationId, input.studentId, input.helpful ? 'helpful' : 'not_helpful', input.comment, input.now],
    );
    return { recommendationId: input.recommendationId, studentId: input.studentId, helpful: input.helpful, comment: input.comment, createdAt: input.now };
  }

  async listByStudent(studentId: string, limit: number): Promise<Array<AgentRunRecord & { recommendationsCount: number }>> {
    const { rows } = await this.pool.query<RunRow & { recommendations_count: number }>(
      `select r.${RUN_COLUMNS.split(', ').join(', r.')},
              (select count(*)::int from agent_recommendations ar where ar.run_id = r.run_id) as recommendations_count
         from agent_runs r where r.student_id = $1
        order by r.created_at desc limit $2`,
      [studentId, limit],
    );
    return rows.map((row) => ({ ...mapRun(row), recommendationsCount: row.recommendations_count }));
  }
}

class PgAssistantInteractionRepository implements AssistantInteractionRepository {
  constructor(private readonly pool: DbPool) {}

  async save(record: AssistantInteractionRecord): Promise<void> {
    await this.pool.query(
      `insert into assistant_interactions (interaction_id, student_id, input_type, intent, intent_confidence, status, run_id,
         request_id, correlation_id, speech_recognition_ms, intent_duration_ms, agent_duration_ms, total_duration_ms, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        record.interactionId, record.studentId, record.inputType, record.intent, record.intentConfidence, record.status,
        record.runId, record.requestId, record.correlationId, record.speechRecognitionMs, record.intentDurationMs,
        record.agentDurationMs, record.totalDurationMs, record.createdAt,
      ],
    );
  }
}

class PgProgramRepository implements ProgramRepository {
  constructor(private readonly pool: DbPool) {}

  async list(): Promise<ProgramRecord[]> {
    return (await this.pool.query<ProgramRecord>('select code, name from programs order by name')).rows;
  }

  async findByCode(code: string): Promise<ProgramRecord | null> {
    const { rows } = await this.pool.query<ProgramRecord>('select code, name from programs where code = $1', [code]);
    return rows[0] ?? null;
  }
}

class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: DbPool) {}

  async createStudentAccount(input: Parameters<AccountRepository['createStudentAccount']>[0]) {
    try {
      return await withTransaction(this.pool, async (client) => {
        const user = await client.query<UserRow>(
          `insert into users (email, password_hash, full_name, role, is_demo) values ($1, $2, $3, 'student', lower($1) like '%@demo.asa')
           returning ${USER_COLUMNS}`,
          [input.user.email, input.user.passwordHash, input.user.fullName],
        );
        const created = mapUser(user.rows[0]!);
        const student = await client.query<StudentRow>(
          `insert into students (id, user_id, registration_number, program) values ($1, $2, $3, $4)
           returning id, user_id, registration_number, program`,
          [input.student.id, created.id, input.student.registrationNumber, input.student.program],
        );
        return { user: created, student: mapStudent(student.rows[0]!) };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('Não foi possível criar a conta com esses dados.', 'account_exists');
      }
      throw error;
    }
  }
}

interface PasswordResetRow {
  id: string;
  user_id: string;
  code_hash: string;
  code_expires_at: Date;
  attempts: number;
  send_count: number;
  last_sent_at: Date;
  verified_at: Date | null;
  reset_token_hash: string | null;
  reset_token_expires_at: Date | null;
  used_at: Date | null;
  invalidated_at: Date | null;
  created_at: Date;
}

const RESET_COLUMNS =
  'id, user_id, code_hash, code_expires_at, attempts, send_count, last_sent_at, verified_at, reset_token_hash, reset_token_expires_at, used_at, invalidated_at, created_at';

const mapReset = (row: PasswordResetRow): PasswordResetRecord => ({
  id: row.id,
  userId: row.user_id,
  codeHash: row.code_hash,
  codeExpiresAt: row.code_expires_at,
  attempts: row.attempts,
  sendCount: row.send_count,
  lastSentAt: row.last_sent_at,
  verifiedAt: row.verified_at,
  resetTokenHash: row.reset_token_hash,
  resetTokenExpiresAt: row.reset_token_expires_at,
  usedAt: row.used_at,
  invalidatedAt: row.invalidated_at,
  createdAt: row.created_at,
});

class PgPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly pool: DbPool) {}

  async findActiveByUser(userId: string): Promise<PasswordResetRecord | null> {
    const { rows } = await this.pool.query<PasswordResetRow>(
      `select ${RESET_COLUMNS} from password_resets where user_id = $1 and used_at is null and invalidated_at is null`,
      [userId],
    );
    return rows[0] ? mapReset(rows[0]) : null;
  }

  async create(input: { userId: string; codeHash: string; codeExpiresAt: Date; now: Date }): Promise<PasswordResetRecord> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        'update password_resets set invalidated_at = $2 where user_id = $1 and used_at is null and invalidated_at is null',
        [input.userId, input.now],
      );
      const { rows } = await client.query<PasswordResetRow>(
        `insert into password_resets (user_id, code_hash, code_expires_at, last_sent_at, created_at) values ($1, $2, $3, $4, $4)
         returning ${RESET_COLUMNS}`,
        [input.userId, input.codeHash, input.codeExpiresAt, input.now],
      );
      return mapReset(rows[0]!);
    });
  }

  async replaceCode(id: string, input: { codeHash: string; codeExpiresAt: Date; now: Date }): Promise<void> {
    await this.pool.query(
      `update password_resets set code_hash = $2, code_expires_at = $3, attempts = 0, send_count = send_count + 1, last_sent_at = $4
       where id = $1 and used_at is null and invalidated_at is null and verified_at is null`,
      [id, input.codeHash, input.codeExpiresAt, input.now],
    );
  }

  async recordFailedAttempt(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ attempts: number }>(
      'update password_resets set attempts = attempts + 1 where id = $1 returning attempts',
      [id],
    );
    return rows[0]?.attempts ?? Number.MAX_SAFE_INTEGER;
  }

  async markVerified(id: string, input: { resetTokenHash: string; resetTokenExpiresAt: Date; now: Date }): Promise<void> {
    await this.pool.query(
      'update password_resets set verified_at = $2, reset_token_hash = $3, reset_token_expires_at = $4 where id = $1',
      [id, input.now, input.resetTokenHash, input.resetTokenExpiresAt],
    );
  }

  async findByResetTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const { rows } = await this.pool.query<PasswordResetRow>(`select ${RESET_COLUMNS} from password_resets where reset_token_hash = $1`, [tokenHash]);
    return rows[0] ? mapReset(rows[0]) : null;
  }

  async completeReset(input: { resetId: string; userId: string; passwordHash: string; now: Date }): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const consumed = await client.query(
        'update password_resets set used_at = $3 where id = $1 and user_id = $2 and used_at is null and invalidated_at is null',
        [input.resetId, input.userId, input.now],
      );
      if (consumed.rowCount !== 1) return false;
      await client.query('update users set password_hash = $2 where id = $1', [input.userId, input.passwordHash]);
      await client.query('update refresh_sessions set revoked_at = $2 where user_id = $1 and revoked_at is null', [input.userId, input.now]);
      await client.query('update device_credentials set revoked_at = $2 where user_id = $1 and revoked_at is null', [input.userId, input.now]);
      return true;
    });
  }
}

interface DeviceCredentialRow {
  id: string;
  user_id: string;
  token_hash: string;
  device_label: string | null;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
}

const CREDENTIAL_COLUMNS = 'id, user_id, token_hash, device_label, created_at, last_used_at, expires_at, revoked_at';

const mapCredential = (row: DeviceCredentialRow): DeviceCredentialRecord => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  deviceLabel: row.device_label,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
});

class PgDeviceCredentialRepository implements DeviceCredentialRepository {
  constructor(private readonly pool: DbPool) {}

  async create(input: { userId: string; tokenHash: string; deviceLabel: string | null; expiresAt: Date }): Promise<DeviceCredentialRecord> {
    const { rows } = await this.pool.query<DeviceCredentialRow>(
      `insert into device_credentials (user_id, token_hash, device_label, expires_at) values ($1, $2, $3, $4) returning ${CREDENTIAL_COLUMNS}`,
      [input.userId, input.tokenHash, input.deviceLabel, input.expiresAt],
    );
    return mapCredential(rows[0]!);
  }

  async findById(id: string): Promise<DeviceCredentialRecord | null> {
    const { rows } = await this.pool.query<DeviceCredentialRow>(`select ${CREDENTIAL_COLUMNS} from device_credentials where id = $1`, [id]);
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  async touch(id: string, input: { lastUsedAt: Date; expiresAt: Date }): Promise<void> {
    await this.pool.query('update device_credentials set last_used_at = $2, expires_at = $3 where id = $1', [id, input.lastUsedAt, input.expiresAt]);
  }

  async revoke(id: string, userId: string): Promise<void> {
    await this.pool.query('update device_credentials set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null', [id, userId]);
  }

  async revokeOldestBeyond(userId: string, max: number): Promise<void> {
    await this.pool.query(
      `update device_credentials set revoked_at = now()
        where id in (select id from device_credentials where user_id = $1 and revoked_at is null order by created_at desc offset $2)`,
      [userId, max],
    );
  }
}

export function createPgRepositories(pool: DbPool): Repositories {
  return {
    users: new PgUserRepository(pool),
    sessions: new PgSessionRepository(pool),
    students: new PgStudentRepository(pool),
    agentRuns: new PgAgentRunRepository(pool),
    assistantInteractions: new PgAssistantInteractionRepository(pool),
    programs: new PgProgramRepository(pool),
    accounts: new PgAccountRepository(pool),
    passwordResets: new PgPasswordResetRepository(pool),
    deviceCredentials: new PgDeviceCredentialRepository(pool),
    // ---- support (Atendimento)
    support: createPgSupportRepository(pool),
    // ---- platform (portal web, auditoria, avisos)
    ...createPgPlatformRepositories(pool),
    analytics: new PgAnalyticsRepository(pool),
    appointments: new PgAppointmentRepository(pool),
    knowledge: new PgKnowledgeRepository(pool),
    admin: new PgAdminRepository(pool),
    ping: async () => {
      try {
        await pool.query('select 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}
