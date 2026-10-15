import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  FlaskConical,
  PowerOff,
  Settings2,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/ui/Display';
import type {
  AuditEventView,
  AutomationAction,
  AutomationRunView,
  AutomationTrigger,
  IntegrationState,
  ServiceHealth,
  SupportTicketPriority,
  UserRole,
} from '@/types/api';

/** Rótulos dos papéis (os mesmos do servidor: Backend/api/src/auth/permissions.ts → ROLE_LABELS). */
export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Aluno',
  institutional_staff: 'Equipe ASA',
  technical_admin: 'Administração',
};

/** Papéis que a administração pode atribuir (alunos nascem do cadastro, nunca por convite). */
export const ASSIGNABLE_ROLES = ['institutional_staff', 'technical_admin'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  institutional_staff: 'Atende chamados e agendamentos e mantém a base de conhecimento.',
  technical_admin: 'Gerencia contas, parâmetros, integrações e auditoria. Não lê o conteúdo dos chamados.',
};

export interface StateMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /** explicação em linguagem simples */
  explanation: string;
}

export const INTEGRATION_STATE_META: Record<IntegrationState, StateMeta> = {
  operational: { label: 'Operacional', tone: 'success', icon: CheckCircle2, explanation: 'Respondeu na verificação feita agora.' },
  configured: {
    label: 'Configurado',
    tone: 'info',
    icon: Settings2,
    explanation: 'As variáveis de ambiente estão definidas. A plataforma não testa a entrega a cada verificação.',
  },
  degraded: { label: 'Instável', tone: 'warning', icon: AlertTriangle, explanation: 'Funciona com falhas ou atrasos: algumas respostas podem demorar ou faltar.' },
  error: { label: 'Com erro', tone: 'danger', icon: XCircle, explanation: 'Não respondeu na verificação. O que depende dela fica indisponível, nunca simulado.' },
  demo: { label: 'Demonstração', tone: 'warning', icon: FlaskConical, explanation: 'Usa dados fictícios ou um simulador, sempre identificados como demonstração.' },
  not_configured: { label: 'Não configurado', tone: 'neutral', icon: CircleDashed, explanation: 'Faltam configuração ou autorização: a integração não está em uso.' },
  disabled: { label: 'Desligado', tone: 'neutral', icon: PowerOff, explanation: 'Desligado de propósito na configuração do ambiente.' },
  planned: { label: 'Planejado', tone: 'neutral', icon: CalendarClock, explanation: 'Previsto para o futuro: ainda não existe nem funciona neste ambiente.' },
};

/** Ordem da legenda (do melhor para o pior, depois os estados fora de uso). */
export const INTEGRATION_STATE_ORDER: IntegrationState[] = ['operational', 'configured', 'degraded', 'error', 'demo', 'not_configured', 'disabled', 'planned'];

export const SERVICE_STATUS_META: Record<ServiceHealth['status'], StateMeta> = {
  up: { label: 'Funcionando', tone: 'success', icon: CheckCircle2, explanation: 'Respondeu normalmente.' },
  degraded: { label: 'Instável', tone: 'warning', icon: AlertTriangle, explanation: 'Funciona, mas com pendências ou lentidão.' },
  down: { label: 'Fora do ar', tone: 'danger', icon: XCircle, explanation: 'Não respondeu.' },
  disabled: { label: 'Desligado', tone: 'neutral', icon: PowerOff, explanation: 'Desligado na configuração do ambiente.' },
};

export const TRIGGER_META: Record<AutomationTrigger, { label: string; sentence: string; description: string }> = {
  ticket_created: { label: 'Novo chamado', sentence: 'quando um chamado é aberto', description: 'Roda logo depois que o aluno abre o chamado.' },
  sla_near_deadline: {
    label: 'Prazo próximo',
    sentence: 'quando o prazo de um chamado fica próximo',
    description: 'Roda na varredura periódica, quando faltam 25% do prazo ou menos de 8 horas.',
  },
  sla_overdue: { label: 'Prazo excedido', sentence: 'quando o prazo de um chamado é excedido', description: 'Roda na varredura periódica, quando o prazo já venceu.' },
};

export const TRIGGERS = Object.keys(TRIGGER_META) as AutomationTrigger[];

export const ACTION_META: Record<AutomationAction, { label: string; description: string }> = {
  notify_staff: { label: 'Avisar a equipe', description: 'Envia um aviso interno na central do portal da equipe ASA.' },
  raise_priority: {
    label: 'Elevar a prioridade',
    description: 'Sobe a prioridade como registro interno. Se o chamado já estiver nesse nível ou acima, a execução é ignorada.',
  },
};

export const ACTIONS = Object.keys(ACTION_META) as AutomationAction[];

export const AUDIENCE_META: Record<'team' | 'assigned', { label: string; description: string }> = {
  team: { label: 'Toda a equipe ASA', description: 'Todas as pessoas ativas da equipe recebem o aviso.' },
  assigned: { label: 'Só o atendente responsável', description: 'Chamado sem responsável: a execução é ignorada.' },
};

export const RAISE_PRIORITY_LABELS: Record<'high' | 'urgent', string> = { high: 'Alta', urgent: 'Urgente' };

export const PRIORITY_LABELS: Record<SupportTicketPriority, string> = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as SupportTicketPriority[];

export const RUN_STATUS_META: Record<AutomationRunView['status'], StateMeta> = {
  applied: { label: 'Aplicada', tone: 'success', icon: CheckCircle2, explanation: 'A ação foi feita.' },
  skipped: { label: 'Ignorada', tone: 'neutral', icon: CircleSlash, explanation: 'Não havia o que fazer (ex.: prioridade já alta, sem responsável).' },
  failed: { label: 'Falhou', tone: 'danger', icon: XCircle, explanation: 'A ação não foi concluída.' },
};

// ---- auditoria (cópia mínima de pages/asa/MyAuditPage.tsx, que não exporta estas partes)

export const OUTCOME_META: Record<AuditEventView['outcome'], StateMeta> = {
  success: { label: 'Concluída', tone: 'success', icon: CheckCircle2, explanation: 'A ação aconteceu.' },
  failure: { label: 'Falhou', tone: 'danger', icon: XCircle, explanation: 'A ação foi tentada e não aconteceu.' },
  denied: { label: 'Negada', tone: 'warning', icon: ShieldAlert, explanation: 'O servidor recusou por falta de permissão.' },
};

export const CHANNEL_LABELS: Record<AuditEventView['channel'], string> = { web: 'Portal web', mobile: 'Aplicativo', system: 'Sistema' };

export const RESOURCE_LABELS: Record<string, string> = {
  user: 'Conta',
  session: 'Sessão',
  ticket: 'Chamado',
  student: 'Aluno',
  report: 'Relatório',
  appointment: 'Agendamento',
  availability: 'Disponibilidade',
  kb_article: 'Artigo',
  article: 'Artigo',
  setting: 'Parâmetro',
  sla_policy: 'Meta de SLA',
  automation: 'Automação',
  recommendation: 'Recomendação do agente',
};

/** Tipos de ação para o filtro (o servidor filtra por prefixo). */
export const AUDIT_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auth.login_failed', label: 'Tentativas de entrada recusadas' },
  { value: 'authz.denied', label: 'Acessos negados por permissão' },
  { value: 'auth.', label: 'Autenticação e sessões (todas)' },
  { value: 'user.', label: 'Contas (convites, papéis, ativação)' },
  { value: 'settings.', label: 'Configurações' },
  { value: 'sla.', label: 'Metas de SLA' },
  { value: 'automation.', label: 'Automações' },
  { value: 'ticket.', label: 'Chamados' },
  { value: 'student_context.', label: 'Consultas a alunos' },
  { value: 'report.', label: 'Relatórios' },
  { value: 'appointment.', label: 'Agendamentos' },
  { value: 'availability.', label: 'Disponibilidade' },
  { value: 'kb.', label: 'Base de conhecimento' },
  { value: 'agent.', label: 'Agente' },
];

export const AUDIT_OUTCOME_OPTIONS = (Object.keys(OUTCOME_META) as Array<AuditEventView['outcome']>).map((value) => ({ value, label: OUTCOME_META[value].label }));

export const AUDIT_RESOURCE_OPTIONS = ['user', 'session', 'ticket', 'student', 'report', 'appointment', 'availability', 'kb_article', 'setting', 'sla_policy', 'automation', 'recommendation'].map(
  (value) => ({ value, label: RESOURCE_LABELS[value] ?? value }),
);
