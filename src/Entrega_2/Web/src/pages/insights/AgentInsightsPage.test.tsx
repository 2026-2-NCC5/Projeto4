import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAgentInsights } from '@/features/insights/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AgentInsightsPage from './AgentInsightsPage';

const staff = () => makeSession(makeMe('institutional_staff'));
const admin = () => makeSession(makeMe('technical_admin'));
const routes = [
  { path: '/asa/agente-ia', element: <AgentInsightsPage /> },
  { path: '/admin/agente-ia', element: <AgentInsightsPage /> },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Agente e assistente (indicadores agregados)', () => {
  it('mostra execuções, tipos de recomendação, avaliações e o assistente com rótulos em português', async () => {
    const { calls } = mockApi({ 'GET /api/asa/agent-insights': () => ({ data: makeAgentInsights() }) });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    const runs = await screen.findByRole('region', { name: 'Agente para o Estudante' });
    expect(calls.map((call) => call.path)).toContain('/api/asa/agent-insights?from=2026-09-16&to=2026-10-15');
    const stat = (scope: HTMLElement, label: string) => within(scope).getByText(label).parentElement!;
    expect(stat(runs, 'Análises')).toHaveTextContent('8');
    expect(stat(runs, 'Com recomendação')).toHaveTextContent('225% das execuções');
    expect(stat(runs, 'Abstenções')).toHaveTextContent('675% das execuções');
    expect(stat(runs, 'Confiança média')).toHaveTextContent('88%');
    const types = within(runs).getByRole('list', { name: 'Recomendações por tipo' });
    expect(types).toHaveTextContent('Atividade pendente');
    expect(types).toHaveTextContent('Frequência em atenção');
    expect(types).not.toHaveTextContent('pending_activity');

    const feedback = screen.getByRole('region', { name: 'Avaliação das recomendações' });
    expect(stat(feedback, 'Úteis')).toHaveTextContent('375% das avaliações');
    expect(stat(feedback, 'Não úteis')).toHaveTextContent('125% das avaliações');
    // a API não devolve comentários: o painel diz isso em vez de inventar
    expect(feedback).toHaveTextContent('comentários de alunos não aparecem neste painel');

    const assistant = screen.getByRole('region', { name: 'Assistente ASA' });
    expect(stat(assistant, 'Interações')).toHaveTextContent('74');
    expect(stat(assistant, 'Respondidas pela base de conhecimento')).toHaveTextContent('5');
    expect(stat(assistant, 'Sem resposta confiável na base')).toHaveTextContent('2');
    expect(within(assistant).getByRole('list', { name: 'Resultado das interações' })).toHaveTextContent('Respondida');
    expect(within(assistant).getByRole('list', { name: 'Intenções mais frequentes' })).toHaveTextContent('Pendências');
    // participação sobre o total de interações (74), não sobre a soma das 12 primeiras
    expect(within(assistant).getByRole('list', { name: 'Intenções mais frequentes' })).toHaveTextContent('22 · 30%');
    expect(screen.getByText(/Execuções do Agente \(agent_runs\)/)).toBeInTheDocument();
  });

  it('provedor: o JEV aparece como planejado e nunca como em uso', async () => {
    mockApi({
      'GET /api/asa/agent-insights': () => ({
        data: makeAgentInsights({
          provider: {
            requested: 'jev',
            active: 'existing',
            fallbackReason: 'jev_disabled',
            label: 'Regras do ASA Conecta e base de conhecimento (sem LLM)',
            jev: { status: 'disabled', detail: 'Integração planejada e desligada (JEV_ENABLED=false).' },
          },
        }),
      }),
    });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    const provider = await screen.findByRole('region', { name: 'Provedor de IA do assistente' });
    expect(within(provider).getByText('Em uso agora').nextElementSibling).toHaveTextContent('Regras do ASA Conecta e base de conhecimento (sem LLM)');
    // AI_PROVIDER pediu o JEV: o painel mostra o pedido e explica por que não está em uso
    expect(within(provider).getByText('Pedido na configuração (AI_PROVIDER)').nextElementSibling).toHaveTextContent('jev');
    expect(within(provider).getByRole('note')).toHaveTextContent('O JEV está desligado neste ambiente (JEV_ENABLED=false)');
    expect(within(provider).getByText('Planejado · desligado')).toBeInTheDocument();
    expect(provider).toHaveTextContent('hoje ele não responde perguntas');
    expect(provider).not.toHaveTextContent(/JEV (está )?(ativo|em uso|operacional|funcionando)/i);
  });

  it('JEV com situação desconhecida continua "planejado", com o detalhe da API', async () => {
    mockApi({
      'GET /api/asa/agent-insights': () => ({
        data: makeAgentInsights({ provider: { ...makeAgentInsights().provider, jev: { status: 'operational', detail: 'Detalhe informado pela API.' } } }),
      }),
    });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    const provider = await screen.findByRole('region', { name: 'Provedor de IA do assistente' });
    expect(within(provider).getByText('Planejado')).toBeInTheDocument();
    expect(provider).toHaveTextContent('Detalhe informado pela API.');
    expect(provider).not.toHaveTextContent(/operacional|operational/i);
  });

  it('Agent Service fora do ar: diz que versões e limiares não estão disponíveis', async () => {
    mockApi({
      'GET /api/asa/agent-insights': () => ({
        data: makeAgentInsights({ agentConfig: { available: false, agentVersion: null, configVersion: null, contractVersion: null, minimumConfidence: null, rules: [] } }),
      }),
    });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    const service = await screen.findByRole('region', { name: 'Agent Service' });
    expect(service).toHaveTextContent('O Agent Service não respondeu agora');
  });

  it('período sem dados mostra estados vazios, não zeros inventados em gráficos', async () => {
    const empty = makeAgentInsights({
      runs: { total: 0, byStatus: { recommendation: 0, no_action: 0, abstained: 0 }, requiresHumanValidation: 0, averageConfidence: null, abstentionRate: null },
      recommendationsByType: [],
      feedback: { helpful: 0, notHelpful: 0 },
      assistant: { interactions: 0, byIntent: [], byStatus: [], knowledgeAnswered: 0, knowledgeAbstained: 0 },
    });
    mockApi({ 'GET /api/asa/agent-insights': () => ({ data: empty }) });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    expect(await screen.findByText('Nenhuma análise do Agente no período.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma recomendação no período.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma recomendação avaliada no período.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma interação com o assistente no período.')).toBeInTheDocument();
  });

  it('trocar o período refaz a consulta com as novas datas', async () => {
    const { calls } = mockApi({ 'GET /api/asa/agent-insights': () => ({ data: makeAgentInsights() }) });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    await screen.findByRole('region', { name: 'Agente para o Estudante' });
    await userEvent.click(screen.getByRole('radio', { name: '90 dias' }));
    await waitFor(() => expect(calls.map((call) => call.path)).toContain('/api/asa/agent-insights?from=2026-07-18&to=2026-10-15'));
  });

  it('503 database_required explica a indisponibilidade', async () => {
    mockApi({ 'GET /api/asa/agent-insights': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Indicadores exigem o banco de dados PostgreSQL.', reason: 'database_required' } }) });
    renderRoutes(routes, { initialPath: '/asa/agente-ia', session: staff() });
    expect(await screen.findByText('Indisponível neste ambiente')).toBeInTheDocument();
  });

  it('na Administração: título da área e nenhum link para /asa', async () => {
    mockApi({ 'GET /api/asa/agent-insights': () => ({ data: makeAgentInsights() }) });
    const { container } = renderRoutes(routes, { initialPath: '/admin/agente-ia', session: admin() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Agente e provedores de IA' })).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Assistente ASA' });
    const hrefs = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.startsWith('/asa'))).toEqual([]);
    expect(screen.getByRole('link', { name: 'Base de conhecimento' })).toHaveAttribute('href', '/admin/base-conhecimento');
  });
});
