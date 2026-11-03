import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  BookOpenText,
  Bot,
  CalendarClock,
  CalendarCog,
  ClipboardList,
  Clock3,
  FileText,
  Gauge,
  GraduationCap,
  Headset,
  History,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  User,
  Users,
  UserCog,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Permission, UserRole } from '@/types/api';

export type Area = 'aluno' | 'asa' | 'admin';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** só aparece com a permissão (o servidor confere de qualquer forma) */
  permission?: Permission;
  /** rota exata (índice da área) */
  end?: boolean;
  /** recurso que pode ser desligado pela plataforma */
  feature?: 'appointments' | 'knowledgeBase';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const AREA_META: Record<Area, { label: string; role: UserRole; accent: string }> = {
  aluno: { label: 'Portal do Aluno', role: 'student', accent: 'bg-action' },
  asa: { label: 'Operação ASA', role: 'institutional_staff', accent: 'bg-fecap' },
  admin: { label: 'Administração', role: 'technical_admin', accent: 'bg-action' },
};

export const NAVIGATION: Record<Area, NavSection[]> = {
  aluno: [
    {
      items: [
        { to: '/aluno', label: 'Início', icon: LayoutDashboard, end: true },
        { to: '/aluno/oportunidades', label: 'ASA Match', icon: BriefcaseBusiness },
        { to: '/aluno/academico', label: 'Vida acadêmica', icon: GraduationCap },
        { to: '/aluno/portal-fecap', label: 'Portal FECAP', icon: Plug },
        { to: '/aluno/fila-presencial', label: 'Meu Atendimento ASA', icon: Clock3 },
        { to: '/aluno/pendencias', label: 'Pendências', icon: ListChecks },
        { to: '/aluno/assistente', label: 'Assistente ASA', icon: Sparkles },
      ],
    },
    {
      title: 'Atendimento',
      items: [
        { to: '/aluno/chamados', label: 'Meus chamados', icon: MessagesSquare },
        { to: '/aluno/agendamentos', label: 'Agendamentos', icon: CalendarClock, feature: 'appointments' },
        { to: '/aluno/documentos', label: 'Documentos', icon: FileText },
        { to: '/aluno/ajuda', label: 'Central de ajuda', icon: BookOpenText, feature: 'knowledgeBase' },
      ],
    },
    {
      title: 'Conta',
      items: [
        { to: '/aluno/notificacoes', label: 'Notificações', icon: Bell },
        { to: '/aluno/conta', label: 'Conta e segurança', icon: User },
      ],
    },
  ],
  asa: [
    {
      items: [
        { to: '/asa', label: 'Painel', icon: LayoutDashboard, end: true },
        { to: '/asa/atendimento', label: 'Central de Atendimento', icon: Headset, permission: 'tickets:read:any' },
        { to: '/asa/chamados', label: 'Fila de chamados', icon: ClipboardList, permission: 'tickets:read:any' },
        { to: '/asa/conversas', label: 'Conversas', icon: MessagesSquare, permission: 'tickets:read:any' },
        { to: '/asa/agendamentos', label: 'Agendamentos', icon: CalendarClock, permission: 'appointments:read:any', feature: 'appointments', end: true },
        { to: '/asa/agendamentos/disponibilidade', label: 'Minha disponibilidade', icon: CalendarCog, permission: 'availability:manage:own', feature: 'appointments' },
      ],
    },
    {
      title: 'Alunos e conhecimento',
      items: [
        { to: '/asa/alunos', label: 'Alunos atendidos', icon: Users, permission: 'students:read:support_context' },
        { to: '/asa/diretorio-academico', label: 'Diretório acadêmico', icon: GraduationCap, permission: 'academic:directory:read' },
        { to: '/asa/base-conhecimento', label: 'Base de conhecimento', icon: BookOpenText, permission: 'kb:write', feature: 'knowledgeBase' },
        { to: '/asa/agente-ia', label: 'Agente e assistente', icon: Bot, permission: 'agent:insights:read' },
      ],
    },
    {
      title: 'Operação',
      items: [
        { to: '/asa/sla', label: 'SLA', icon: Timer, permission: 'metrics:read' },
        { to: '/asa/metricas', label: 'Métricas e relatórios', icon: BarChart3, permission: 'metrics:read' },
        { to: '/asa/notificacoes', label: 'Notificações', icon: Bell },
        { to: '/asa/auditoria', label: 'Minha auditoria', icon: History, permission: 'audit:read:own' },
        { to: '/asa/conta', label: 'Minha conta', icon: User },
      ],
    },
  ],
  admin: [
    {
      items: [
        { to: '/admin', label: 'Visão geral', icon: Gauge, end: true },
        { to: '/admin/saude', label: 'Saúde dos serviços', icon: Activity, permission: 'health:read' },
        { to: '/admin/chamados', label: 'Chamados (metadados)', icon: ClipboardList, permission: 'tickets:read:metadata' },
      ],
    },
    {
      title: 'Gestão',
      items: [
        { to: '/admin/usuarios', label: 'Usuários e equipe', icon: Users, permission: 'users:manage' },
        { to: '/admin/diretorio-academico', label: 'Diretório acadêmico', icon: GraduationCap, permission: 'academic:directory:read' },
        { to: '/admin/perfis', label: 'Papéis e perfis', icon: UserCog, permission: 'permissions:read' },
        { to: '/admin/permissoes', label: 'Permissões', icon: ShieldCheck, permission: 'permissions:read' },
        { to: '/admin/sla', label: 'SLA e categorias', icon: Timer, permission: 'sla:manage' },
        { to: '/admin/automacoes', label: 'Automações', icon: Workflow, permission: 'automations:manage' },
      ],
    },
    {
      title: 'Inteligência',
      items: [
        { to: '/admin/base-conhecimento', label: 'Base de conhecimento', icon: BookOpenText, permission: 'kb:write', feature: 'knowledgeBase' },
        { to: '/admin/agente-ia', label: 'Agente e provedores de IA', icon: Bot, permission: 'agent:insights:read' },
      ],
    },
    {
      title: 'Governança',
      items: [
        { to: '/admin/integracoes', label: 'Integrações', icon: Plug, permission: 'integrations:read' },
        { to: '/admin/canais/whatsapp', label: 'Canal WhatsApp', icon: MessageCircle, permission: 'support_channels:manage' },
        { to: '/admin/oportunidades', label: 'Fontes de oportunidades', icon: BriefcaseBusiness, permission: 'settings:manage' },
        { to: '/admin/metricas', label: 'Métricas e relatórios', icon: BarChart3, permission: 'metrics:read' },
        { to: '/admin/auditoria', label: 'Auditoria', icon: ScrollText, permission: 'audit:read:any' },
        { to: '/admin/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings:manage' },
        { to: '/admin/notificacoes', label: 'Notificações', icon: Bell },
        { to: '/admin/conta', label: 'Minha conta', icon: User },
      ],
    },
  ],
};
