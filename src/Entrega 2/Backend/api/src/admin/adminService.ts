import { readdirSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from '../auth/permissions.js';
import { randomToken } from '../auth/secrets.js';
import type { AgentClient } from '../clients/agentClient.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  AdminHealth,
  AdminOverview,
  AdminSetting,
  AdminTicketList,
  AdminUser,
  AdminUserCreateRequest,
  AdminUserCreateResult,
  AdminUserList,
  AdminUserUpdateRequest,
  AutomationList,
  AutomationRuleInput,
  AutomationRuleView,
  AutomationRunView,
  IntegrationView,
  PermissionMatrix,
  ServiceHealth,
  SlaPolicyUpdate,
  SlaPolicyView,
  SupportTicketStatus,
  UserRole,
} from '../contracts/mobileApi.v1.js';
import { resolveDatabaseDir } from '../db/paths.js';
import { ConflictError, DependencyError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';
import type { AiProviderRegistry } from '../ai/providers.js';
import type { Mailer } from '../mail/mailer.js';
import type { NotificationService } from '../notifications/notificationService.js';
import type { AuditActor, AuditService } from '../platform/auditService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { SettingsService } from '../platform/settingsService.js';
import type { UserAdminRecord } from '../platform/types.js';
import type { QueueService } from '../queue/service.js';
import type { Repositories } from '../repositories/types.js';
import { DEMO_EMAIL_DOMAIN, normalizeEmail } from '../services/authService.js';
import type { PasswordResetService } from '../services/passwordResetService.js';
import { findCategory, normalizeSearch, SUPPORT_CATEGORIES } from '../support/catalog.js';
import { slaStatus } from '../support/sla.js';
import { ALL_STATUSES } from '../support/statuses.js';
import { DEFAULT_FIRST_RESPONSE_HOURS } from '../support/supportService.js';
import type { AdminRepository, AutomationRuleRecord } from './repository.js';

const POLICY_CACHE_MS = 15_000;
const STAFF_ROLES: UserRole[] = ['institutional_staff', 'technical_admin'];

export type AdminActor = AuditActor & { userId: string; role: UserRole; familyId?: string | null };
type Actor = AdminActor;

export interface AdminServiceDeps {
  repos: Repositories;
  repo: AdminRepository | null;
  config: AppConfig;
  audit: AuditService;
  settings: SettingsService;
  platform: PlatformService;
  resets: PasswordResetService;
  mailer: Mailer;
  agentClient: AgentClient;
  ai: AiProviderRegistry;
  queue: QueueService;
  push: NotificationService;
  logger: Logger;
  apiVersion: string;
  startedAt: Date;
  now: () => Date;
}

/** Metas de SLA por categoria com cache curto (lidas na abertura de cada chamado). */
export class SlaPolicyResolver {
  private cache: { at: number; values: Map<string, { firstResponseHours: number; resolutionBusinessDays: number }> } | null = null;

  constructor(
    private readonly repo: AdminRepository | null,
    private readonly now: () => Date,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async load() {
    const at = this.now().getTime();
    if (this.cache && at - this.cache.at < POLICY_CACHE_MS) return this.cache.values;
    const values = new Map<string, { firstResponseHours: number; resolutionBusinessDays: number }>();
    if (this.repo) for (const policy of await this.repo.listSlaPolicies()) values.set(policy.categoryId, policy);
    this.cache = { at, values };
    return values;
  }

  /** Dias úteis para solução (meta gravada ou padrão do catálogo). Falha de leitura → padrão. */
  async resolutionDays(categoryId: string, fallback: number): Promise<number> {
    try {
      return (await this.load()).get(categoryId)?.resolutionBusinessDays ?? fallback;
    } catch {
      return fallback;
    }
  }

  async firstResponseHours(categoryId: string): Promise<number> {
    try {
      return (await this.load()).get(categoryId)?.firstResponseHours ?? DEFAULT_FIRST_RESPONSE_HOURS;
    } catch {
      return DEFAULT_FIRST_RESPONSE_HOURS;
    }
  }
}

/** Administração: contas, permissões, SLA, automações, integrações, saúde, parâmetros e auditoria. */
export class AdminService {
  readonly sla: SlaPolicyResolver;

  constructor(private readonly deps: AdminServiceDeps) {
    this.sla = new SlaPolicyResolver(deps.repo, deps.now);
  }

  private db(): AdminRepository {
    if (!this.deps.repo) throw new DependencyError('A administração exige o banco de dados PostgreSQL.', undefined, 'database_required');
    return this.deps.repo;
  }

  private get excludeDemo(): boolean {
    return !this.deps.config.demo.dataEnabled;
  }

  // ------------------------------------------------------------------ contas

  private toUser(record: UserAdminRecord): AdminUser {
    return {
      id: record.id,
      fullName: record.fullName,
      email: record.email,
      role: record.role,
      roleLabel: ROLE_LABELS[record.role],
      isActive: record.isActive,
      isDemo: record.isDemo,
      createdAt: record.createdAt.toISOString(),
      lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
      invitedAt: record.invitedAt?.toISOString() ?? null,
      student: record.studentId ? { id: record.studentId, registrationNumber: record.registrationNumber ?? '—' } : null,
      activeSessions: record.activeSessions,
    };
  }

  async listUsers(input: { search?: string; role?: string; status?: string; includeDemo?: boolean; page?: number; pageSize?: number }): Promise<AdminUserList> {
    const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const role = input.role && (['student', 'institutional_staff', 'technical_admin'] as string[]).includes(input.role) ? (input.role as UserRole) : undefined;
    const status = input.status === 'active' || input.status === 'inactive' ? input.status : undefined;
    const search = input.search ? normalizeSearch(input.search).slice(0, 80) : undefined;
    const result = await this.deps.repos.users.list({
      ...(search ? { search } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      includeDemo: this.excludeDemo ? false : (input.includeDemo ?? true),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items: result.items.map((item) => this.toUser(item)), total: result.total, page, pageSize };
  }

  async getUser(id: string): Promise<AdminUser> {
    const record = await this.deps.repos.users.findAdminById(id);
    if (!record) throw new NotFoundError('Conta não encontrada.');
    return this.toUser(record);
  }

  /** Convite de equipe/administração: senha aleatória inutilizável + código para a pessoa definir a própria senha. */
  async inviteUser(actor: Actor, input: AdminUserCreateRequest, logger: Logger): Promise<AdminUserCreateResult> {
    const email = normalizeEmail(input.email);
    const fullName = input.fullName.trim().replace(/\s+/g, ' ');
    const domain = email.split('@')[1] ?? '';
    const domains = this.deps.config.auth.allowedEmailDomains.filter((item) => this.deps.config.demo.dataEnabled || item !== DEMO_EMAIL_DOMAIN);
    if (domains.length > 0 && !domains.includes(domain)) {
      throw new ValidationError('Use um e-mail institucional.', [{ field: 'email', message: `domínios aceitos: ${domains.map((item) => `@${item}`).join(', ')}` }]);
    }
    if (!STAFF_ROLES.includes(input.role)) throw new ValidationError('Papel inválido para convite.', [{ field: 'role', message: 'equipe ASA ou administração' }]);
    const inviter = await this.deps.repos.users.findById(actor.userId);
    const created = await this.deps.repos.users.createInvited({
      email,
      fullName,
      role: input.role,
      passwordHash: await bcrypt.hash(randomToken(32), 10),
      invitedBy: actor.userId,
      isDemo: domain === DEMO_EMAIL_DOMAIN,
      now: this.deps.now(),
    });
    const invitation = await this.deps.resets.sendInvitation(created, { roleLabel: ROLE_LABELS[created.role], invitedBy: inviter?.fullName ?? 'A administração do ASA Conecta' }, logger);
    await this.deps.audit.record(actor, { action: 'user.invited', resourceType: 'user', resourceId: created.id, metadata: { role: created.role, invitationSent: invitation.sent } });
    return { user: await this.getUser(created.id), invitation };
  }

  async resendInvitation(actor: Actor, id: string, logger: Logger): Promise<{ sent: boolean; message: string }> {
    const user = await this.deps.repos.users.findById(id);
    if (!user) throw new NotFoundError('Conta não encontrada.');
    if (!STAFF_ROLES.includes(user.role) || !user.isActive) throw new ConflictError('Só contas ativas da equipe ou da administração recebem convite.', 'invalid_transition');
    const record = await this.deps.repos.users.findAdminById(id);
    if (record?.lastLoginAt) throw new ConflictError('Esta pessoa já entrou na plataforma; use "Esqueci minha senha" se precisar.', 'already_active');
    const result = await this.deps.resets.sendInvitation(user, { roleLabel: ROLE_LABELS[user.role], invitedBy: 'A administração do ASA Conecta' }, logger);
    await this.deps.audit.record(actor, { action: 'user.invited', resourceType: 'user', resourceId: id, metadata: { resend: true, invitationSent: result.sent } });
    return result;
  }

  /**
   * Papel e ativação. Regras: ninguém altera o próprio papel ou se desativa; a última conta de administração
   * ativa não pode sair; aluno não vira equipe (o vínculo acadêmico é do cadastro). Mudanças encerram as
   * sessões da conta na hora (o acesso antigo para de funcionar na próxima requisição).
   */
  async updateUser(actor: Actor, id: string, input: AdminUserUpdateRequest): Promise<AdminUser> {
    const current = await this.deps.repos.users.findById(id);
    if (!current) throw new NotFoundError('Conta não encontrada.');
    if (id === actor.userId) throw new ForbiddenError('Você não pode alterar o próprio papel ou desativar a própria conta.', 'self_change');
    if (input.role && current.role === 'student') throw new ConflictError('Contas de aluno não mudam de papel. Convide uma conta de equipe separada.', 'invalid_transition');
    const roleChanged = input.role !== undefined && input.role !== current.role;
    const activeChanged = input.isActive !== undefined && input.isActive !== current.isActive;
    if (!roleChanged && !activeChanged) return this.getUser(id);
    // checagem atômica no repositório (trava as administrações ativas): nunca fica sem administração
    const losesAdmin = current.role === 'technical_admin' && current.isActive && ((roleChanged && input.role !== 'technical_admin') || input.isActive === false);
    await this.deps.repos.users.update(id, { ...(roleChanged ? { role: input.role! } : {}), ...(activeChanged ? { isActive: input.isActive! } : {}) }, { keepActiveAdmin: losesAdmin });
    const revoked = await this.deps.repos.sessions.revokeAllExcept(id, null);
    if (roleChanged) await this.deps.audit.record(actor, { action: 'user.role_changed', resourceType: 'user', resourceId: id, metadata: { from: current.role, to: input.role!, sessionsRevoked: revoked } });
    if (activeChanged) await this.deps.audit.record(actor, { action: input.isActive ? 'user.activated' : 'user.deactivated', resourceType: 'user', resourceId: id, metadata: { sessionsRevoked: revoked } });
    return this.getUser(id);
  }

  async revokeSessions(actor: Actor, id: string): Promise<{ revoked: number }> {
    if (!(await this.deps.repos.users.findById(id))) throw new NotFoundError('Conta não encontrada.');
    const revoked = await this.deps.repos.sessions.revokeAllExcept(id, id === actor.userId ? (actor.familyId ?? null) : null);
    await this.deps.audit.record(actor, { action: 'user.sessions_revoked', resourceType: 'user', resourceId: id, metadata: { families: revoked } });
    return { revoked };
  }

  permissions(): PermissionMatrix {
    return {
      roles: (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => ({ role, label: ROLE_LABELS[role], permissions: [...ROLE_PERMISSIONS[role]] })),
      permissions: ALL_PERMISSIONS.map((key) => ({ key, ...PERMISSION_DESCRIPTIONS[key] })),
    };
  }

  // --------------------------------------------------------------------- SLA

  async slaPolicies(): Promise<SlaPolicyView[]> {
    const stored = new Map((await this.db().listSlaPolicies()).map((policy) => [policy.categoryId, policy]));
    return SUPPORT_CATEGORIES.map((category) => {
      const policy = stored.get(category.id);
      return {
        categoryId: category.id,
        categoryLabel: category.label,
        firstResponseHours: policy?.firstResponseHours ?? DEFAULT_FIRST_RESPONSE_HOURS,
        resolutionBusinessDays: policy?.resolutionBusinessDays ?? category.slaBusinessDays,
        isDefault: !policy,
        defaultResolutionBusinessDays: category.slaBusinessDays,
        updatedAt: policy?.updatedAt.toISOString() ?? null,
        updatedBy: policy?.updatedByName ?? null,
      };
    });
  }

  async updateSlaPolicy(actor: Actor, categoryId: string, input: SlaPolicyUpdate): Promise<SlaPolicyView[]> {
    if (!findCategory(categoryId)) throw new NotFoundError('Categoria não encontrada.');
    await this.db().upsertSlaPolicy({ categoryId, firstResponseHours: input.firstResponseHours, resolutionBusinessDays: input.resolutionBusinessDays, updatedBy: actor.userId, now: this.deps.now() });
    this.sla.invalidate();
    await this.deps.audit.record(actor, { action: 'sla.updated', resourceType: 'sla_policy', resourceId: categoryId, metadata: { firstResponseHours: input.firstResponseHours, resolutionBusinessDays: input.resolutionBusinessDays } });
    return this.slaPolicies();
  }

  // -------------------------------------------------------------- automações

  private async ruleView(rule: AutomationRuleRecord, stats?: Map<string, { applied: number; skipped: number; failed: number; lastRunAt: Date | null }>): Promise<AutomationRuleView> {
    const run = (stats ?? (await this.db().runStats())).get(rule.id);
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      trigger: rule.trigger,
      conditions: rule.conditions,
      action: rule.action,
      actionParams: rule.actionParams,
      enabled: rule.enabled,
      updatedAt: rule.updatedAt.toISOString(),
      runs: { applied: run?.applied ?? 0, skipped: run?.skipped ?? 0, failed: run?.failed ?? 0, lastRunAt: run?.lastRunAt?.toISOString() ?? null },
    };
  }

  async automations(): Promise<AutomationList> {
    const db = this.db();
    const [rules, stats, engineEnabled] = await Promise.all([db.listRules(), db.runStats(), this.deps.platform.isEnabled('automations')]);
    return { engineEnabled, items: await Promise.all(rules.map((rule) => this.ruleView(rule, stats))) };
  }

  private validateRule(input: Partial<AutomationRuleInput>): void {
    const details: Array<{ field: string; message: string }> = [];
    for (const id of input.conditions?.categoryIds ?? []) if (!findCategory(id)) details.push({ field: 'conditions.categoryIds', message: `categoria desconhecida: ${id}` });
    if (input.action === 'raise_priority' && input.actionParams?.priority && !['high', 'urgent'].includes(input.actionParams.priority)) details.push({ field: 'actionParams.priority', message: 'alta ou urgente' });
    if (input.action === 'notify_staff' && input.actionParams?.audience && !['team', 'assigned'].includes(input.actionParams.audience)) details.push({ field: 'actionParams.audience', message: 'team ou assigned' });
    if (details.length > 0) throw new ValidationError('Regra inválida.', details);
  }

  async createAutomation(actor: Actor, input: AutomationRuleInput): Promise<AutomationRuleView> {
    this.validateRule(input);
    const actionParams = input.action === 'raise_priority' ? { priority: input.actionParams?.priority ?? 'high' } : { audience: input.actionParams?.audience ?? 'team' };
    const rule = await this.db().createRule({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger: input.trigger,
      conditions: input.conditions ?? {},
      action: input.action,
      actionParams,
      enabled: input.enabled ?? false,
      createdBy: actor.userId,
    });
    await this.deps.audit.record(actor, { action: 'automation.created', resourceType: 'automation', resourceId: rule.id, metadata: { trigger: rule.trigger, action: rule.action, enabled: rule.enabled } });
    return this.ruleView(rule);
  }

  async updateAutomation(actor: Actor, id: string, input: Partial<AutomationRuleInput>): Promise<AutomationRuleView> {
    const current = await this.db().findRule(id);
    if (!current) throw new NotFoundError('Regra não encontrada.');
    this.validateRule({ ...current, ...input, actionParams: input.actionParams ?? current.actionParams });
    const rule = await this.db().updateRule(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.actionParams !== undefined ? { actionParams: input.actionParams } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedBy: actor.userId,
    });
    if (!rule) throw new NotFoundError('Regra não encontrada.');
    await this.deps.audit.record(actor, { action: 'automation.updated', resourceType: 'automation', resourceId: id, metadata: { enabled: rule.enabled } });
    return this.ruleView(rule);
  }

  async automationRuns(id: string): Promise<AutomationRunView[]> {
    if (!(await this.db().findRule(id))) throw new NotFoundError('Regra não encontrada.');
    return (await this.db().listRuns(id, 50)).map((run) => ({ id: run.id, ticketProtocol: run.ticketProtocol, trigger: run.trigger, status: run.status, detail: run.detail, createdAt: run.createdAt.toISOString() }));
  }

  // ----------------------------------------------------- integrações e saúde

  async integrations(): Promise<IntegrationView[]> {
    const { config } = this.deps;
    const checkedAt = this.deps.now().toISOString();
    const [agentUp, jev] = await Promise.all([this.deps.agentClient.health(), this.deps.ai.jev.health()]);
    const queueHealth = this.deps.queue.health().body;
    const academic = this.deps.platform.academicSource();
    const queueState = !config.queue.enabled ? 'disabled' : config.queue.provider === 'mock' ? 'demo' : queueHealth.status === 'healthy' ? 'operational' : queueHealth.status === 'degraded' ? 'degraded' : 'error';
    return [
      {
        id: 'agent-service',
        name: 'Agent Service (Agente para o Estudante)',
        description: 'Serviço Python/FastAPI com as regras explicáveis do agente.',
        state: agentUp ? 'operational' : 'error',
        detail: agentUp ? 'Respondendo ao /health.' : 'Sem resposta: análises ficam indisponíveis (503), nunca inventadas.',
        configuredBy: ['AGENT_SERVICE_URL', 'AGENT_SERVICE_TIMEOUT_MS'],
        checkedAt,
      },
      {
        id: 'academic-data',
        name: 'Dados acadêmicos (Portal do Aluno / TOTVS)',
        description: 'Fonte de disciplinas, notas, frequência e pendências.',
        state: academic.status === 'demo' ? 'demo' : 'not_configured',
        detail: academic.status === 'demo' ? 'Dados fictícios de demonstração (seed). Integração institucional depende de autorização da FECAP.' : academic.message,
        configuredBy: ['ACADEMIC_DATA_PROVIDER', 'DEMO_DATA_ENABLED'],
        checkedAt,
      },
      {
        id: 'asa-queue',
        name: 'Fila presencial do ASA',
        description: 'Senhas chamadas no atendimento presencial.',
        state: queueState,
        detail:
          config.queue.provider === 'mock'
            ? 'Simulador identificado como demonstração.'
            : `Painel público (presencial.fecap.br) — ${config.queue.sourceAuthorized ? 'uso autorizado registrado' : 'sem autorização institucional registrada'}. Monitor: ${queueHealth.status}.`,
        configuredBy: ['ASA_QUEUE_PROVIDER', 'ASA_QUEUE_SOURCE_AUTHORIZED', 'ASA_QUEUE_ENABLED'],
        checkedAt,
      },
      {
        id: 'email',
        name: 'E-mail (recuperação de senha e convites)',
        description: 'Envio por SMTP (Mailpit em desenvolvimento).',
        state: this.deps.mailer.available ? 'configured' : 'not_configured',
        detail: this.deps.mailer.available ? `Transporte ${config.mail.transport} configurado.` : 'MAIL_TRANSPORT=disabled: recuperação de senha e convites ficam indisponíveis.',
        configuredBy: ['MAIL_TRANSPORT', 'SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM'],
        checkedAt,
      },
      {
        id: 'push',
        name: 'Notificações push (Expo)',
        description: 'Avisos no celular quando o app está fechado.',
        state: config.push.provider === 'disabled' ? 'disabled' : config.push.provider === 'log' ? 'demo' : 'configured',
        detail:
          config.push.provider === 'expo'
            ? 'Expo Push configurado; a entrega exige build EAS e permissão no aparelho.'
            : config.push.provider === 'log'
              ? 'Modo de desenvolvimento: só registra no log.'
              : 'Desligado: os avisos ficam na central do portal/app.',
        configuredBy: ['PUSH_PROVIDER', 'EXPO_ACCESS_TOKEN'],
        checkedAt,
      },
      {
        id: 'jev',
        name: 'JEV (provedor de IA)',
        description: 'Integração futura do assistente. Contrato técnico ainda não definido.',
        state: jev.status === 'disabled' ? 'planned' : 'not_configured',
        detail: jev.detail,
        configuredBy: ['AI_PROVIDER', 'JEV_ENABLED'],
        checkedAt,
      },
      {
        id: 'fecap-sso',
        name: 'Login institucional (SSO/OIDC da FECAP)',
        description: 'Entrada com a conta institucional, sem senha própria.',
        state: 'planned',
        detail: 'Não configurado: depende de credenciais e autorização da FECAP.',
        configuredBy: [],
        checkedAt,
      },
    ];
  }

  async health(): Promise<AdminHealth> {
    const { config } = this.deps;
    const started = Date.now();
    const dbUp = await this.deps.repos.ping();
    const dbLatency = Date.now() - started;
    let applied: string[] = [];
    let pending: string[] = [];
    if (dbUp && this.deps.repo) {
      applied = await this.deps.repo.appliedMigrations();
      try {
        const onDisk = readdirSync(path.join(resolveDatabaseDir(), 'migrations')).filter((file) => file.endsWith('.sql')).sort();
        pending = onDisk.filter((file) => !applied.includes(file));
      } catch {
        pending = [];
      }
    }
    const agentStarted = Date.now();
    const [agentUp, agentConfig] = await Promise.all([this.deps.agentClient.health(), this.deps.agentClient.config?.() ?? Promise.resolve(null)]);
    const agentLatency = Date.now() - agentStarted;
    const queue = this.deps.queue.health().body;
    const queueStatus: ServiceHealth['status'] = !config.queue.enabled ? 'disabled' : queue.status === 'healthy' ? 'up' : queue.status === 'degraded' ? 'degraded' : 'down';
    const memory = process.memoryUsage();
    return {
      checkedAt: this.deps.now().toISOString(),
      api: {
        version: this.deps.apiVersion,
        environment: config.appEnv,
        uptimeSeconds: Math.round((this.deps.now().getTime() - this.deps.startedAt.getTime()) / 1000),
        node: process.version,
        memoryMb: Math.round(memory.rss / 1_048_576),
      },
      database: {
        status: dbUp ? (pending.length > 0 ? 'degraded' : 'up') : 'down',
        latencyMs: dbUp ? dbLatency : null,
        detail: !dbUp ? 'Sem conexão com o PostgreSQL.' : pending.length > 0 ? `${pending.length} migration(s) pendente(s).` : 'Conectado; migrations em dia.',
        migrations: { applied, pending },
      },
      agentService: {
        status: agentUp ? 'up' : 'down',
        latencyMs: agentUp ? agentLatency : null,
        detail: agentUp ? 'Respondendo.' : 'Sem resposta ao /health.',
        agentVersion: agentConfig?.agent_version ?? null,
        configVersion: agentConfig?.config_version ?? null,
      },
      queue: {
        status: queueStatus,
        latencyMs: null,
        detail: config.queue.enabled ? `Provedor ${queue.provider}; sincronização ${queue.lastSuccessfulSync ? 'recente' : 'ainda não concluída'}.` : (config.queue.disabledReason ?? 'Desativada.'),
        provider: config.queue.provider,
        authorizedSource: config.queue.provider === 'mock' ? true : config.queue.sourceAuthorized,
      },
      mail: { status: this.deps.mailer.available ? 'up' : 'disabled', latencyMs: null, detail: this.deps.mailer.available ? `Transporte ${config.mail.transport}.` : 'E-mail desligado.' },
      push: { status: this.deps.push.enabled ? 'up' : 'disabled', latencyMs: null, detail: this.deps.push.enabled ? 'Envio habilitado (Expo).' : 'Push desligado ou em modo de log.', provider: config.push.provider },
    };
  }

  // ------------------------------------------------------------- parâmetros

  async listSettings(): Promise<AdminSetting[]> {
    const views = await this.deps.settings.list();
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(views.map((view) => view.updatedBy).filter((value): value is string => Boolean(value)))].map(async (id) => {
        names.set(id, (await this.deps.repos.users.findById(id))?.fullName ?? 'Conta removida');
      }),
    );
    return views.map((view) => ({ ...view, updatedBy: view.updatedBy ? (names.get(view.updatedBy) ?? null) : null }));
  }

  async updateSetting(actor: Actor, key: string, value: unknown): Promise<AdminSetting[]> {
    const result = await this.deps.settings.update(key, value, actor.userId);
    await this.deps.audit.record(actor, { action: 'settings.updated', resourceType: 'setting', resourceId: result.key });
    return this.listSettings();
  }

  // --------------------------------------------------- chamados (metadados)

  /** Visão administrativa de chamados: só metadados (sem assunto, mensagens ou identificação de alunos). */
  async tickets(input: { status?: string; category?: string; page?: number; pageSize?: number }): Promise<AdminTicketList> {
    const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const statuses = input.status ? (input.status.split(',').filter((value) => (ALL_STATUSES as readonly string[]).includes(value)) as SupportTicketStatus[]) : undefined;
    const result = await this.db().ticketMetadata({ ...(statuses && statuses.length > 0 ? { statuses } : {}), ...(input.category ? { categoryId: input.category } : {}), excludeDemo: this.excludeDemo, limit: pageSize, offset: (page - 1) * pageSize });
    const now = this.deps.now();
    return {
      items: result.items.map((row) => ({
        id: row.id,
        protocol: row.protocol,
        categoryId: row.categoryId,
        categoryLabel: findCategory(row.categoryId)?.label ?? row.categoryId,
        status: row.status,
        priority: row.priority,
        team: row.team,
        channel: row.channel,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        sla: { status: slaStatus({ targetBusinessDays: 0, startedAt: row.slaStartedAt, dueAt: row.slaDueAt, pausedAt: row.slaPausedAt, resumedAt: null, completedAt: row.slaCompletedAt }, now), dueAt: row.slaDueAt.toISOString() },
      })),
      total: result.total,
      page,
      pageSize,
    };
  }

  // ---------------------------------------------------------------- visão geral

  async overview(input: { dashboard: () => Promise<{ tickets: { open: number; slaOverdue: number; slaNearDeadline: number; unassigned: number }; appointmentsToday: { total: number } | null }> }): Promise<AdminOverview> {
    const db = this.db();
    const now = this.deps.now();
    const [counts, sessions, security, dashboard, integrations, health] = await Promise.all([
      db.userCounts(this.excludeDemo),
      db.activeSessionFamilies(now, this.excludeDemo),
      db.auditOutcomeCounts(new Date(now.getTime() - 86_400_000)),
      input.dashboard(),
      this.integrations(),
      this.health(),
    ]);
    const sum = (role: UserRole) => counts.filter((row) => row.role === role && row.active).reduce((total, row) => total + row.total, 0);
    return {
      users: { students: sum('student'), staff: sum('institutional_staff'), admins: sum('technical_admin'), inactive: counts.filter((row) => !row.active).reduce((total, row) => total + row.total, 0), activeSessions: sessions },
      tickets: dashboard.tickets,
      appointmentsToday: dashboard.appointmentsToday?.total ?? null,
      security: { failedLogins24h: security.failedLogins, deniedAccess24h: security.denied },
      integrations: integrations.map((item) => ({ id: item.id, name: item.name, state: item.state })),
      services: { database: health.database.status, agentService: health.agentService.status, queue: health.queue.status },
      source: { description: 'Contas, sessões, chamados, agendamentos e auditoria lidos agora do PostgreSQL; serviços consultados em tempo real.', generatedAt: now.toISOString(), timezone: this.deps.config.assistant.timezone, dataMode: this.deps.platform.dataMode },
    };
  }
}
