import type { Permission, UserRole } from '../contracts/mobileApi.v1.js';

/**
 * Matriz de permissões (ação:recurso[:escopo]) por papel. É a ÚNICA fonte de autorização da plataforma:
 * rotas usam `requirePermission` e os serviços conferem titularidade (ex.: o chamado é do aluno da sessão).
 * Os clientes recebem a lista em GET /api/auth/me apenas para montar menus.
 *
 * Princípios (ADR-008):
 * - aluno vê só os próprios dados;
 * - equipe ASA atende chamados e agendamentos, mas não altera dados acadêmicos de origem;
 * - administração gerencia contas, parâmetros e auditoria SEM ler o conteúdo de chamados (só metadados).
 */
const OWN_ACCOUNT: Permission[] = ['account:read:own', 'account:sessions:own', 'notifications:read:own'];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  student: [
    ...OWN_ACCOUNT,
    'academic:read:own',
    'agent:run:own',
    'agent:feedback:own',
    'assistant:use',
    'tickets:create:own',
    'tickets:read:own',
    'appointments:book:own',
    'kb:read:published',
  ],
  institutional_staff: [
    ...OWN_ACCOUNT,
    'tickets:read:any',
    'tickets:manage',
    'tickets:internal_note',
    'appointments:read:any',
    'appointments:manage',
    'availability:manage:own',
    'kb:read:published',
    'kb:read:all',
    'kb:write',
    'kb:publish',
    'students:read:support_context',
    'metrics:read',
    'reports:export',
    'agent:insights:read',
    'audit:read:own',
  ],
  technical_admin: [
    ...OWN_ACCOUNT,
    'tickets:read:metadata',
    'availability:manage:any',
    'kb:read:published',
    'kb:read:all',
    'kb:write',
    'kb:publish',
    'metrics:read',
    'reports:export',
    'agent:insights:read',
    'audit:read:own',
    'audit:read:any',
    'users:manage',
    'sessions:revoke:any',
    'settings:manage',
    'sla:manage',
    'automations:manage',
    'integrations:read',
    'health:read',
    'permissions:read',
  ],
};

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  student: 'Aluno',
  institutional_staff: 'Equipe ASA',
  technical_admin: 'Administração',
};

/** Descrição legível de cada permissão (página de permissões do portal). */
export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, { group: string; label: string }>> = {
  'account:read:own': { group: 'Conta', label: 'Ver os próprios dados de conta' },
  'account:sessions:own': { group: 'Conta', label: 'Listar e encerrar as próprias sessões' },
  'notifications:read:own': { group: 'Conta', label: 'Ler a própria central de avisos' },
  'academic:read:own': { group: 'Acadêmico', label: 'Ver disciplinas, notas, frequência e pendências próprias' },
  'agent:run:own': { group: 'Acadêmico', label: 'Pedir análise ao Agente para o Estudante' },
  'agent:feedback:own': { group: 'Acadêmico', label: 'Avaliar as próprias recomendações' },
  'assistant:use': { group: 'Acadêmico', label: 'Conversar com o Assistente ASA' },
  'tickets:create:own': { group: 'Atendimento', label: 'Abrir chamados' },
  'tickets:read:own': { group: 'Atendimento', label: 'Acompanhar os próprios chamados' },
  'tickets:read:any': { group: 'Atendimento', label: 'Ler chamados de qualquer aluno (fila ASA)' },
  'tickets:read:metadata': { group: 'Atendimento', label: 'Ver indicadores e metadados de chamados, sem o conteúdo' },
  'tickets:manage': { group: 'Atendimento', label: 'Responder, atribuir, mudar situação e prioridade' },
  'tickets:internal_note': { group: 'Atendimento', label: 'Registrar notas internas (nunca visíveis ao aluno)' },
  'appointments:book:own': { group: 'Agendamentos', label: 'Agendar, remarcar e cancelar os próprios atendimentos' },
  'appointments:read:any': { group: 'Agendamentos', label: 'Ver a agenda do ASA' },
  'appointments:manage': { group: 'Agendamentos', label: 'Confirmar, concluir, cancelar e registrar ausência' },
  'availability:manage:own': { group: 'Agendamentos', label: 'Gerenciar a própria disponibilidade' },
  'availability:manage:any': { group: 'Agendamentos', label: 'Gerenciar a disponibilidade de qualquer atendente' },
  'kb:read:published': { group: 'Base de conhecimento', label: 'Ler artigos publicados' },
  'kb:read:all': { group: 'Base de conhecimento', label: 'Ler rascunhos e artigos internos' },
  'kb:write': { group: 'Base de conhecimento', label: 'Criar e editar artigos' },
  'kb:publish': { group: 'Base de conhecimento', label: 'Publicar e arquivar artigos' },
  'students:read:support_context': { group: 'Operação', label: 'Ver dados de contato e histórico de atendimento de alunos atendidos' },
  'metrics:read': { group: 'Operação', label: 'Ver métricas e indicadores' },
  'reports:export': { group: 'Operação', label: 'Exportar relatórios (CSV sem dados pessoais)' },
  'agent:insights:read': { group: 'Operação', label: 'Ver indicadores agregados do Agente e do Assistente' },
  'audit:read:own': { group: 'Governança', label: 'Ver a própria trilha de auditoria' },
  'audit:read:any': { group: 'Governança', label: 'Consultar a trilha de auditoria completa' },
  'users:manage': { group: 'Governança', label: 'Convidar contas, mudar papéis e ativar/desativar' },
  'sessions:revoke:any': { group: 'Governança', label: 'Encerrar sessões de qualquer conta' },
  'settings:manage': { group: 'Governança', label: 'Alterar parâmetros institucionais' },
  'sla:manage': { group: 'Governança', label: 'Alterar metas de SLA' },
  'automations:manage': { group: 'Governança', label: 'Configurar automações' },
  'integrations:read': { group: 'Governança', label: 'Ver o estado das integrações' },
  'health:read': { group: 'Governança', label: 'Ver a saúde dos serviços' },
  'permissions:read': { group: 'Governança', label: 'Ver a matriz de permissões' },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[];

export function permissionsFor(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Papéis que a administração pode atribuir. Alunos nascem do cadastro com domínio institucional (nunca por convite). */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['institutional_staff', 'technical_admin'];
