import type {
  AdminHealth,
  AdminOverview,
  AdminSetting,
  AdminTicketMetadata,
  AdminUser,
  AuditEventView,
  AutomationList,
  AutomationRuleView,
  IntegrationView,
  PermissionMatrix,
  SlaPolicyView,
} from '@/types/api';

/** Dados fixos para os testes da Administração (datas fixas: nada depende do relógio). */

export const fixedSource: AdminOverview['source'] = {
  description: 'Contas, sessões, chamados, agendamentos e auditoria lidos agora do PostgreSQL; serviços consultados em tempo real.',
  generatedAt: '2026-10-15T12:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  dataMode: 'demo',
};

export function makeOverview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    users: { students: 120, staff: 6, admins: 2, inactive: 3, activeSessions: 41 },
    tickets: { open: 21, slaOverdue: 4, slaNearDeadline: 2, unassigned: 7 },
    appointmentsToday: 5,
    security: { failedLogins24h: 9, deniedAccess24h: 3 },
    integrations: [
      { id: 'agent-service', name: 'Agent Service (Agente para o Estudante)', state: 'operational' },
      { id: 'email', name: 'E-mail (recuperação de senha e convites)', state: 'not_configured' },
      { id: 'jev', name: 'JEV (provedor de IA)', state: 'planned' },
    ],
    services: { database: 'up', agentService: 'down', queue: 'disabled' },
    source: fixedSource,
    ...overrides,
  };
}

export function makeHealth(overrides: Partial<AdminHealth> = {}): AdminHealth {
  return {
    checkedAt: '2026-10-15T12:05:00.000Z',
    api: { version: '1.0.0', environment: 'development', uptimeSeconds: 3_900, node: 'v24.10.0', memoryMb: 151 },
    database: {
      status: 'degraded',
      latencyMs: 3,
      detail: '1 migration(s) pendente(s).',
      migrations: { applied: ['001_init_schema.sql', '002_assistant_interactions.sql'], pending: ['011_new_feature.sql'] },
    },
    agentService: { status: 'up', latencyMs: 12, detail: 'Respondendo.', agentVersion: '1.0.0', configVersion: '2026.10' },
    queue: { status: 'up', latencyMs: null, detail: 'Provedor mock; sincronização recente.', provider: 'mock', authorizedSource: true },
    mail: { status: 'disabled', latencyMs: null, detail: 'E-mail desligado.' },
    push: { status: 'disabled', latencyMs: null, detail: 'Push desligado ou em modo de log.', provider: 'log' },
    ...overrides,
  };
}

export function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-staff',
    fullName: 'Bruno Atendente',
    email: 'bruno.atendente@fecap.br',
    role: 'institutional_staff',
    roleLabel: 'Equipe ASA',
    isActive: true,
    isDemo: false,
    createdAt: '2026-09-01T12:00:00.000Z',
    lastLoginAt: '2026-10-14T18:00:00.000Z',
    invitedAt: '2026-09-01T12:00:00.000Z',
    student: null,
    activeSessions: 2,
    ...overrides,
  };
}

export const studentUser = makeAdminUser({
  id: 'u-student',
  fullName: 'Maria Souza',
  email: 'maria.souza@edu.fecap.br',
  role: 'student',
  roleLabel: 'Aluno',
  invitedAt: null,
  student: { id: 'student-1', registrationNumber: '26000001' },
  activeSessions: 1,
});

export const adminUser = makeAdminUser({
  id: 'u-admin-2',
  fullName: 'Carla Administração',
  email: 'carla.admin@fecap.br',
  role: 'technical_admin',
  roleLabel: 'Administração',
});

export const demoUser = makeAdminUser({ id: 'u-demo', fullName: 'Estudante Exemplo', email: 'estudante.exemplo@demo.asa', role: 'student', roleLabel: 'Aluno', isDemo: true, invitedAt: null, student: { id: 's-demo', registrationNumber: 'DEMO-2026-001' } });

export function makePermissionMatrix(): PermissionMatrix {
  return {
    roles: [
      { role: 'student', label: 'Aluno', permissions: ['account:read:own', 'tickets:create:own'] },
      { role: 'institutional_staff', label: 'Equipe ASA', permissions: ['account:read:own', 'tickets:read:any'] },
      { role: 'technical_admin', label: 'Administração', permissions: ['account:read:own', 'tickets:read:metadata', 'users:manage'] },
    ],
    permissions: [
      { key: 'account:read:own', group: 'Conta', label: 'Ver os próprios dados de conta' },
      { key: 'tickets:create:own', group: 'Atendimento', label: 'Abrir chamados' },
      { key: 'tickets:read:any', group: 'Atendimento', label: 'Ler chamados de qualquer aluno (fila ASA)' },
      { key: 'tickets:read:metadata', group: 'Atendimento', label: 'Ver indicadores e metadados de chamados, sem o conteúdo' },
      { key: 'users:manage', group: 'Governança', label: 'Convidar contas, mudar papéis e ativar/desativar' },
    ],
  };
}

export function makeSlaPolicies(): SlaPolicyView[] {
  return [
    { categoryId: 'academic', categoryLabel: 'Acadêmico', firstResponseHours: 24, resolutionBusinessDays: 3, isDefault: true, defaultResolutionBusinessDays: 3, updatedAt: null, updatedBy: null },
    {
      categoryId: 'financial',
      categoryLabel: 'Financeiro',
      firstResponseHours: 8,
      resolutionBusinessDays: 4,
      isDefault: false,
      defaultResolutionBusinessDays: 2,
      updatedAt: '2026-10-10T15:30:00.000Z',
      updatedBy: 'Carla Administração',
    },
  ];
}

export function makeRule(overrides: Partial<AutomationRuleView> = {}): AutomationRuleView {
  return {
    id: 'rule-1',
    name: 'Avisar a equipe sobre novos chamados de Matrícula',
    description: 'Matrícula tem prazos curtos.',
    trigger: 'ticket_created',
    conditions: { categoryIds: ['financial'] },
    action: 'notify_staff',
    actionParams: { audience: 'team' },
    enabled: false,
    updatedAt: '2026-10-14T12:00:00.000Z',
    runs: { applied: 3, skipped: 1, failed: 0, lastRunAt: '2026-10-14T13:00:00.000Z' },
    ...overrides,
  };
}

export function makeAutomationList(overrides: Partial<AutomationList> = {}): AutomationList {
  return { engineEnabled: true, items: [makeRule()], ...overrides };
}

export function makeIntegrations(): IntegrationView[] {
  const checkedAt = '2026-10-15T12:05:00.000Z';
  return [
    {
      id: 'agent-service',
      name: 'Agent Service (Agente para o Estudante)',
      description: 'Serviço Python/FastAPI com as regras explicáveis do agente.',
      state: 'operational',
      detail: 'Respondendo ao /health.',
      configuredBy: ['AGENT_SERVICE_URL', 'AGENT_SERVICE_TIMEOUT_MS'],
      checkedAt,
    },
    {
      id: 'email',
      name: 'E-mail (recuperação de senha e convites)',
      description: 'Envio por SMTP.',
      state: 'not_configured',
      detail: 'MAIL_TRANSPORT=disabled: recuperação de senha e convites ficam indisponíveis.',
      configuredBy: ['MAIL_TRANSPORT', 'SMTP_HOST'],
      checkedAt,
    },
    { id: 'jev', name: 'JEV (provedor de IA)', description: 'Integração futura do assistente.', state: 'planned', detail: 'Integração planejada e desligada (JEV_ENABLED=false).', configuredBy: ['AI_PROVIDER', 'JEV_ENABLED'], checkedAt },
    {
      id: 'fecap-sso',
      name: 'Login institucional (SSO/OIDC da FECAP)',
      description: 'Entrada com a conta institucional.',
      state: 'planned',
      detail: 'Não configurado: depende de credenciais e autorização da FECAP.',
      configuredBy: [],
      checkedAt,
    },
  ];
}

export function makeSettings(overrides: Partial<Record<string, Partial<AdminSetting>>> = {}): AdminSetting[] {
  const base: AdminSetting[] = [
    {
      key: 'institution.announcement',
      label: 'Aviso institucional',
      description: 'Mensagem exibida no topo do portal e do app.',
      public: true,
      value: null,
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    },
    {
      key: 'asa.business_hours',
      label: 'Horário de atendimento do ASA',
      description: 'Usado nos portais.',
      public: true,
      value: { days: [{ weekday: 1, intervals: [{ start: '08:00', end: '21:00' }] }], note: null },
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    },
    { key: 'asa.public_links', label: 'Links institucionais', description: 'Somente HTTPS.', public: true, value: [], isDefault: true, updatedAt: null, updatedBy: null },
    {
      key: 'appointments.policy',
      label: 'Política de agendamentos',
      description: 'Antecedência, horizonte, cancelamento e limite.',
      public: true,
      value: { minLeadHours: 2, maxDaysAhead: 30, cancellationMinHours: 2, maxActivePerStudent: 2 },
      isDefault: false,
      updatedAt: '2026-10-12T10:00:00.000Z',
      updatedBy: 'Carla Administração',
    },
    { key: 'knowledge.policy', label: 'Governança da base de conhecimento', description: 'Segunda pessoa para publicar.', public: false, value: { requireSecondReviewer: false }, isDefault: true, updatedAt: null, updatedBy: null },
    {
      key: 'features.toggles',
      label: 'Recursos ativos',
      description: 'Desliga recursos sem novo deploy.',
      public: true,
      value: { appointments: true, knowledgeBase: true, assistantKnowledgeAnswers: true, automations: true },
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    },
  ];
  return base.map((setting) => ({ ...setting, ...(overrides[setting.key] ?? {}) }));
}

export function makeAdminTicket(overrides: Partial<AdminTicketMetadata> = {}): AdminTicketMetadata {
  return {
    id: 'ticket-1',
    protocol: 'ASA-2026-00442',
    categoryId: 'documents',
    categoryLabel: 'Documentos',
    status: 'in_progress',
    priority: 'high',
    team: 'Atendimento ASA',
    channel: 'web',
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-15T09:00:00.000Z',
    sla: { status: 'overdue', dueAt: '2026-10-15T10:00:00.000Z' },
    ...overrides,
  };
}

export function makeAdminAuditEvent(overrides: Partial<AuditEventView> = {}): AuditEventView {
  return {
    id: 'a-1',
    occurredAt: '2026-10-15T11:00:00.000Z',
    action: 'user.role_changed',
    label: 'Mudou o papel de uma conta',
    outcome: 'success',
    channel: 'web',
    actor: { userId: 'u-admin-2', role: 'technical_admin', name: 'Carla Administração' },
    resource: { type: 'user', id: 'u-staff' },
    metadata: { from: 'institutional_staff', to: 'technical_admin', sessionsRevoked: 2 },
    requestId: 'req-admin-1',
    correlationId: 'corr-admin-1',
    ...overrides,
  };
}

/** Erro de API com detalhes de campo (o mockApi repassa o objeto como veio). */
export function apiError(status: number, code: string, message: string, extra: { reason?: string; details?: Array<{ field: string; message: string }> } = {}) {
  const error = { code, message, ...extra };
  return { status, error };
}
