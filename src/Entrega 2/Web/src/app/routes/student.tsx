import type { RouteObject } from 'react-router';
import { page, pageWith } from './lazy';

/** Rotas do Portal do Aluno (/aluno/*). */
export const studentRoutes: RouteObject[] = [
  { index: true, element: page(() => import('@/pages/student/StudentDashboard')) },
  { path: 'notificacoes', element: pageWith(() => import('@/pages/shared/NotificationsPage'), { area: 'aluno' as const }) },
  { path: 'perfil', element: page(() => import('@/pages/shared/AccountPage')) },
  // ---- vida acadêmica, pendências e Assistente ASA
  // ?aba=avaliacoes|frequencia|analise · ?disciplina=<id> · ?recomendacao=<id> (avisos) · ?analise=<runId>
  { path: 'academico', element: page(() => import('@/pages/student/academic/AcademicPage')) },
  { path: 'pendencias', element: page(() => import('@/pages/student/PendingItemsPage')) },
  { path: 'assistente', element: page(() => import('@/pages/student/assistant/AssistantPage')) },
  // ---- atendimento (chamados e documentos)
  { path: 'chamados', element: page(() => import('@/pages/student/tickets/TicketsPage')) },
  { path: 'chamados/novo', element: page(() => import('@/pages/student/tickets/NewTicketPage')) },
  { path: 'chamados/:id', element: page(() => import('@/pages/student/tickets/TicketDetailPage')) },
  { path: 'documentos', element: page(() => import('@/pages/student/DocumentsPage')) },
  // Central de ajuda (base de conhecimento): :id é o slug do artigo (ou o id; links antigos continuam válidos)
  { path: 'ajuda', element: page(() => import('@/pages/student/help/HelpCenterPage')) },
  { path: 'ajuda/:id', element: page(() => import('@/pages/student/help/HelpArticlePage')) },
];
