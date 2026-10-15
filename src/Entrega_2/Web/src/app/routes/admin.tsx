import type { RouteObject } from 'react-router';
import { page, pageWith } from './lazy';

/**
 * Rotas da Administração (/admin/*). Métricas, base de conhecimento e agente/IA são páginas compartilhadas
 * com a Operação ASA e ficam em ./insights.tsx.
 */
export const adminRoutes: RouteObject[] = [
  { path: 'notificacoes', element: pageWith(() => import('@/pages/shared/NotificationsPage'), { area: 'admin' as const }) },
  { path: 'conta', element: page(() => import('@/pages/shared/AccountPage')) },
  // ---- admin (Administração)
  { index: true, element: page(() => import('@/pages/admin/AdminOverviewPage')) },
  { path: 'chamados', element: page(() => import('@/pages/admin/AdminTicketsPage')) },
  { path: 'saude', element: page(() => import('@/pages/admin/HealthPage')) },
  { path: 'usuarios', element: page(() => import('@/pages/admin/users/UsersPage')) },
  { path: 'permissoes', element: page(() => import('@/pages/admin/PermissionsPage')) },
  { path: 'sla', element: page(() => import('@/pages/admin/SlaPoliciesPage')) },
  { path: 'automacoes', element: page(() => import('@/pages/admin/automations/AutomationsPage')) },
  { path: 'integracoes', element: page(() => import('@/pages/admin/IntegrationsPage')) },
  { path: 'auditoria', element: page(() => import('@/pages/admin/AuditPage')) },
  { path: 'configuracoes', element: page(() => import('@/pages/admin/settings/SettingsPage')) },
];
