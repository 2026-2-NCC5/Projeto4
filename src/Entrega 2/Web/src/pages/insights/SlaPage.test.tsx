import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMetrics } from '@/features/insights/testFixtures';
import { fixedSla, makeCatalog, makeDashboard, makeList, makeSummary } from '@/features/support/staff/testFixtures';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import SlaPage from './SlaPage';

const staff = () => makeSession(makeMe('institutional_staff'));
const routes = [{ path: '/asa/sla', element: <SlaPage /> }];

const near = makeSummary({ id: 't-near', protocol: 'ASA-2026-000201', subject: 'Declaração de matrícula para estágio', sla: { ...fixedSla, status: 'near_deadline' } });
const overdue = makeSummary({ id: 't-over', protocol: 'ASA-2026-000150', subject: 'Revisão de prova sem resposta', priority: 'high', sla: { ...fixedSla, status: 'overdue', dueAt: '2026-10-13T18:00:00.000Z' } });

function api(options: { nearItems?: typeof near[]; overdueItems?: typeof near[] } = {}) {
  return mockApi({
    'GET /api/asa/dashboard': () => ({ data: makeDashboard() }),
    'GET /api/asa/metrics': () => ({ data: makeMetrics() }),
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    'GET /api/support/staff/tickets': ({ url }) => {
      const sla = url.searchParams.get('sla');
      if (sla === 'near_deadline') return { data: makeList(options.nearItems ?? [near]) };
      if (sla === 'overdue') return { data: makeList(options.overdueItems ?? [overdue]) };
      return { status: 400, error: { code: 'VALIDATION_ERROR', message: `filtro inesperado: ${sla}` } };
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SLA (equipe ASA)', () => {
  it('as filas usam near_deadline e overdue, pelo vencimento, e cada linha abre o chamado', async () => {
    const { calls } = api();
    renderRoutes(routes, { initialPath: '/asa/sla', session: staff() });
    const overdueSection = await screen.findByRole('region', { name: /^Prazo excedido/ });
    const nearSection = screen.getByRole('region', { name: /^Prazo próximo/ });

    const requested = calls.map((call) => call.path).filter((path) => path.startsWith('/api/support/staff/tickets'));
    expect(requested).toContain('/api/support/staff/tickets?sla=near_deadline&sort=due&limit=20');
    expect(requested).toContain('/api/support/staff/tickets?sla=overdue&sort=due&limit=20');
    // "em risco" (próximos + excedidos) nunca é usado aqui: cada fila mostra só a sua situação
    expect(requested.some((path) => path.includes('sla=at_risk'))).toBe(false);

    const overdueLink = await within(overdueSection).findByRole('link', { name: /Revisão de prova sem resposta/ });
    expect(overdueLink).toHaveAttribute('href', '/asa/chamados/t-over');
    expect(overdueLink).toHaveTextContent('Maria Souza · RA RA-2026-001');
    expect(overdueLink).toHaveTextContent('Venceu');
    expect(overdueLink).toHaveTextContent('Prioridade alta');
    const nearLink = within(nearSection).getByRole('link', { name: /Declaração de matrícula para estágio/ });
    expect(nearLink).toHaveAttribute('href', '/asa/chamados/t-near');
    expect(nearLink).toHaveTextContent('Vence');
    expect(within(nearSection).queryByText('Revisão de prova sem resposta')).toBeNull();
  });

  it('títulos trazem as contagens exatas do painel e os atalhos para a fila filtrada', async () => {
    api();
    renderRoutes(routes, { initialPath: '/asa/sla', session: staff() });
    // makeDashboard: 2 excedidos e 1 próximo
    expect(await screen.findByRole('heading', { name: 'Prazo excedido (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prazo próximo (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver excedidos na fila' })).toHaveAttribute('href', '/asa/chamados?sla=overdue&sort=due');
    expect(screen.getByRole('link', { name: 'Ver na fila (próximos e excedidos)' })).toHaveAttribute('href', '/asa/chamados?sla=at_risk&sort=due');
  });

  it('cumprimento dos últimos 30 dias vem das métricas e as metas vêm do catálogo', async () => {
    const { calls } = api();
    renderRoutes(routes, { initialPath: '/asa/sla', session: staff() });
    const compliance = await screen.findByRole('region', { name: 'Últimos 30 dias' });
    await waitFor(() => expect(within(compliance).getByText('Cumprimento do SLA').parentElement).toHaveTextContent('52%'));
    expect(calls.map((call) => call.path)).toContain('/api/asa/metrics?from=2026-09-16&to=2026-10-15');

    const targets = screen.getByRole('table', { name: 'Metas de prazo por categoria' });
    const financial = within(targets).getByRole('rowheader', { name: /Financeiro/ }).closest('tr')!;
    expect(within(financial).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['8 h', '3 dias úteis', 'Financeiro']);
    expect(screen.getByText(/Fica pausado enquanto o chamado aguarda o aluno/)).toBeInTheDocument();
  });

  it('fila vazia diz isso com clareza', async () => {
    api({ nearItems: [] });
    renderRoutes(routes, { initialPath: '/asa/sla', session: staff() });
    expect(await screen.findByText('Nenhum chamado com prazo próximo agora.')).toBeInTheDocument();
  });

  it('banco ausente (503 database_required) explica em vez de mostrar números', async () => {
    mockApi({
      'GET /api/asa/dashboard': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Indicadores exigem o banco de dados PostgreSQL.', reason: 'database_required' } }),
      'GET /api/asa/metrics': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Indicadores exigem o banco de dados PostgreSQL.', reason: 'database_required' } }),
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([]) }),
    });
    renderRoutes(routes, { initialPath: '/asa/sla', session: staff() });
    expect(await screen.findAllByText('Indisponível neste ambiente')).toHaveLength(2);
  });

  it('sem acesso à fila de chamados, a página não carrega nada', async () => {
    const { calls } = api();
    const me = makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => permission !== 'tickets:read:any') });
    renderRoutes(routes, { initialPath: '/asa/sla', session: makeSession(me) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
