import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES } from '@/features/support/labels';
import { parseQueueFilters, toStaffQuery } from '@/features/support/staff/queueFilters';
import { makeCatalog, makeList, makeStaffTicket, makeSummary } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import TicketQueuePage from './TicketQueuePage';

const staffSession = () => makeSession(makeMe('institutional_staff'));
const routes = [
  { path: '/asa/chamados', element: <TicketQueuePage /> },
  { path: '/asa/chamados/:id', element: <p>atendimento</p> },
];

const listCalls = (calls: Array<{ method: string; path: string }>) =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith('/api/support/staff/tickets?')).map((call) => new URL(call.path, 'http://localhost').searchParams);

describe('filtros da fila (URL → API)', () => {
  it('sem parâmetros: só chamados ativos, mais recentes primeiro', () => {
    expect(toStaffQuery(parseQueueFilters(new URLSearchParams()))).toEqual({ status: ACTIVE_STATUSES.join(',') });
  });

  it('reconhece os grupos de situação e ignora valores desconhecidos', () => {
    expect(parseQueueFilters(new URLSearchParams('status=reopened,triage,received,submitted')).group).toBe('triage');
    expect(parseQueueFilters(new URLSearchParams('status=all')).statuses).toEqual([]);
    expect(parseQueueFilters(new URLSearchParams('status=in_progress')).group).toBe('custom');
    expect(parseQueueFilters(new URLSearchParams('status=xyz&assigned=everyone&sla=soon&priority=urgent,bogus,high')).priority).toBe('high,urgent');
    expect(toStaffQuery(parseQueueFilters(new URLSearchParams('status=xyz&assigned=everyone&sla=soon')))).toEqual({ status: ACTIVE_STATUSES.join(',') });
  });

  it('prazo próximo (sem os excedidos) vai para a API como sla=near_deadline', () => {
    expect(toStaffQuery(parseQueueFilters(new URLSearchParams('sla=near_deadline')))).toEqual({ status: ACTIVE_STATUSES.join(','), sla: 'near_deadline' });
  });
});

describe('Fila de chamados', () => {
  it('monta a consulta da API a partir dos filtros da URL', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([makeSummary()]) }),
    });
    renderRoutes(routes, {
      initialPath: '/asa/chamados?status=waiting_student&team=Financeiro&category=financial&priority=urgent,high&assigned=unassigned&sla=overdue&unread=1&sort=due&search=boleto',
      session: staffSession(),
    });
    expect(await screen.findByRole('link', { name: 'Boleto da mensalidade com valor errado' })).toHaveAttribute('href', '/asa/chamados/t-1');
    const params = listCalls(calls)[0]!;
    expect(Object.fromEntries(params)).toEqual({
      status: 'waiting_student',
      team: 'Financeiro',
      category: 'financial',
      priority: 'high,urgent',
      assigned: 'unassigned',
      sla: 'overdue',
      unread: '1',
      sort: 'due',
      search: 'boleto',
      limit: '25',
    });
    // os controles refletem a URL
    expect(screen.getByRole('radio', { name: 'Aguardando aluno' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /Prazo excedido/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Não lidas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Atendente')).toHaveValue('unassigned');
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('due');
  });

  it('o atalho "Prazo próximo" do painel marca o filtro e os filtros de prazo são exclusivos', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([makeSummary()]) }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/chamados?sla=near_deadline', session: staffSession() });
    await screen.findByRole('link', { name: 'Boleto da mensalidade com valor errado' });
    expect(listCalls(calls)[0]!.get('sla')).toBe('near_deadline');
    expect(screen.getByRole('button', { name: /Prazo próximo/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Prazo excedido/ })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: /Prazo excedido/ }));
    expect(router.state.location.search).toBe('?sla=overdue');
    expect(screen.getByRole('button', { name: /Prazo próximo/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sem a permissão tickets:manage a fila não oferece "Assumir"', async () => {
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([makeSummary()]) }),
    });
    const me = makeMe('institutional_staff');
    renderRoutes(routes, { initialPath: '/asa/chamados', session: makeSession({ ...me, permissions: me.permissions.filter((permission) => permission !== 'tickets:manage') }) });
    await screen.findByRole('link', { name: 'Boleto da mensalidade com valor errado' });
    expect(screen.queryByRole('button', { name: /^Assumir/ })).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Fila de chamados' })).getByText('Sem atendente')).toBeInTheDocument();
  });

  it('mudar um filtro atualiza a URL e consulta de novo', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([makeSummary()]) }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/chamados', session: staffSession() });
    await screen.findByRole('link', { name: 'Boleto da mensalidade com valor errado' });
    await userEvent.click(screen.getByRole('radio', { name: 'Aguardando triagem' }));
    await userEvent.click(screen.getByRole('button', { name: /Em risco de SLA/ }));
    expect(router.state.location.search).toBe('?status=submitted%2Creceived%2Ctriage%2Creopened&sla=at_risk');
    await waitFor(() => expect(listCalls(calls).at(-1)?.get('sla')).toBe('at_risk'));
    expect(listCalls(calls).at(-1)?.get('status')).toBe('submitted,received,triage,reopened');
  });

  it('"Assumir" atribui o chamado à equipe atual da linha e recarrega a fila', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([makeSummary(), makeSummary({ id: 't-2', protocol: 'ASA-2026-000124', subject: 'Já assumido', staff: { ...makeSummary().staff!, assignedAgentId: 'user-x', assignedAgentName: 'Outra Pessoa' } })]) }),
      'POST /api/support/staff/tickets/t-1/assign': () => ({ data: makeStaffTicket({ assignedAgent: { id: 'user-institutional_staff', fullName: 'Atendente ASA' } }) }),
    });
    renderRoutes(routes, { initialPath: '/asa/chamados', session: staffSession() });
    const table = await screen.findByRole('table', { name: 'Fila de chamados' });
    // só a linha sem atendente oferece "Assumir"
    expect(within(table).getAllByRole('button', { name: /^Assumir/ })).toHaveLength(1);
    expect(within(table).getByText('Outra Pessoa')).toBeInTheDocument();
    const before = listCalls(calls).length;
    await userEvent.click(screen.getByRole('button', { name: 'Assumir o chamado ASA-2026-000123' }));
    expect(await screen.findByText('Você assumiu o chamado ASA-2026-000123.')).toBeInTheDocument();
    const assign = calls.find((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/assign');
    expect(assign?.body).toEqual({ team: 'Financeiro' });
    await waitFor(() => expect(listCalls(calls).length).toBeGreaterThan(before));
  });

  it('"Carregar mais" pede a próxima página com o cursor', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': ({ url }) =>
        url.searchParams.get('cursor') === 'c-2'
          ? { data: makeList([makeSummary({ id: 't-9', subject: 'Segunda página' })]) }
          : { data: makeList([makeSummary()], 'c-2') },
    });
    renderRoutes(routes, { initialPath: '/asa/chamados', session: staffSession() });
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('link', { name: 'Segunda página' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Boleto da mensalidade com valor errado' })).toBeInTheDocument();
    expect(listCalls(calls).some((params) => params.get('cursor') === 'c-2')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('fila vazia com filtros oferece limpar', async () => {
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': () => ({ data: makeList([]) }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/chamados?unread=1', session: staffSession() });
    expect(await screen.findByText('Nenhum chamado com estes filtros')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Limpar filtros/ })[0]!);
    expect(router.state.location.search).toBe('');
  });
});
