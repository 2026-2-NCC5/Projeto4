import type { RouteObject } from 'react-router';
import { page } from './lazy';

/**
 * Páginas compartilhadas entre a Operação ASA e a Administração: métricas e relatórios, base de
 * conhecimento (gestão) e indicadores do agente/assistente. Cada área monta as mesmas páginas; o servidor
 * decide o que cada papel pode ver ou alterar. As páginas descobrem a área pela rota (useInsightsArea), então
 * a versão da Administração nunca aponta para /asa (a administração não abre conteúdo de chamados).
 */
const metrics = () => import('@/pages/insights/MetricsPage');
const knowledgeList = () => import('@/pages/insights/knowledge/KnowledgeListPage');
const knowledgeDetail = () => import('@/pages/insights/knowledge/KnowledgeDetailPage');
const knowledgeEditor = () => import('@/pages/insights/knowledge/KnowledgeEditorPage');
const agentInsights = () => import('@/pages/insights/AgentInsightsPage');

function knowledgeRoutes(): RouteObject[] {
  return [
    { path: 'base-conhecimento', element: page(knowledgeList) },
    { path: 'base-conhecimento/novo', element: page(knowledgeEditor) },
    { path: 'base-conhecimento/:id', element: page(knowledgeDetail) },
    { path: 'base-conhecimento/:id/editar', element: page(knowledgeEditor) },
  ];
}

export const asaInsightRoutes: RouteObject[] = [
  { path: 'metricas', element: page(metrics) },
  // saúde dos prazos com as filas de chamados: só a equipe ASA (lê o conteúdo dos chamados)
  { path: 'sla', element: page(() => import('@/pages/insights/SlaPage')) },
  ...knowledgeRoutes(),
  { path: 'agente-ia', element: page(agentInsights) },
];

export const adminInsightRoutes: RouteObject[] = [
  { path: 'metricas', element: page(metrics) },
  ...knowledgeRoutes(),
  { path: 'agente-ia', element: page(agentInsights) },
];
