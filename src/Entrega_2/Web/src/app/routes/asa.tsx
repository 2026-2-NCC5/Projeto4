import type { RouteObject } from 'react-router';
import { page, pageWith } from './lazy';

/** Rotas da Operação ASA (/asa/*). */
export const asaRoutes: RouteObject[] = [
  { path: 'notificacoes', element: pageWith(() => import('@/pages/shared/NotificationsPage'), { area: 'asa' as const }) },
  { path: 'conta', element: page(() => import('@/pages/shared/AccountPage')) },
  // ---- operação (painel, fila, conversas, alunos, auditoria)
  { index: true, element: page(() => import('@/pages/asa/AsaDashboardPage')) },
  // ---- Central de Atendimento (três painéis na mesma aba)
  { path: 'atendimento', element: page(() => import('@/pages/asa/SupportCentralPage')) },
  { path: 'atendimento/:ticketId', element: page(() => import('@/pages/asa/SupportCentralPage')) },
  { path: 'chamados', element: page(() => import('@/pages/asa/TicketQueuePage')) },
  { path: 'chamados/:id', element: page(() => import('@/pages/asa/TicketWorkspacePage')) },
  { path: 'conversas', element: page(() => import('@/pages/asa/ConversationsPage')) },
  { path: 'alunos', element: page(() => import('@/pages/asa/StudentsPage')) },
  { path: 'alunos/:id', element: page(() => import('@/pages/asa/StudentContextPage')) },
  { path: 'diretorio-academico', element: page(() => import('@/pages/admin/AcademicDirectoryPage')) },
  { path: 'auditoria', element: page(() => import('@/pages/asa/MyAuditPage')) },
];
