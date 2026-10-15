import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeAdminTicket } from '@/features/admin/testFixtures';
import { ACTIVE_STATUSES, FINISHED_STATUSES } from '@/features/support/labels';
import { makeCatalog } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AdminTicketsPage from './AdminTicketsPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/chamados', element: <AdminTicketsPage /> }];
const decoded = (path: string) => decodeURIComponent(path);

describe('Chamados (metadados) na administração', () => {
  it('lista só metadados e explica que o conteúdo é da equipe ASA', async () => {
    const { calls } = mockApi({
      'GET /api/admin/tickets': () => ({ data: { items: [makeAdminTicket()], total: 1, page: 1, pageSize: 25 } }),
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    });
    renderRoutes(routes, { initialPath: '/admin/chamados', session: adminSession() });
    const table = await screen.findByRole('table', { name: 'Metadados dos chamados' });
    expect(within(table).getByText('ASA-2026-00442')).toBeInTheDocument();
    expect(within(table).getByText('Documentos')).toBeInTheDocument();
    expect(within(table).getByText('Em atendimento')).toBeInTheDocument();
    expect(within(table).getByText('Alta')).toBeInTheDocument();
    expect(within(table).getByText('Prazo excedido')).toBeInTheDocument();
    expect(within(table).getByText('Portal web')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo dos chamados é só da equipe ASA')).toBeInTheDocument();
    expect(calls.find((call) => call.path.startsWith('/api/admin/tickets'))!.path).toBe('/api/admin/tickets?page=1&pageSize=25');
  });

  it('filtros de situação e categoria ficam na URL e vão para a API', async () => {
    const { calls } = mockApi({
      'GET /api/admin/tickets': () => ({ data: { items: [makeAdminTicket()], total: 1, page: 1, pageSize: 25 } }),
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    });
    const { router } = renderRoutes(routes, { initialPath: `/admin/chamados?status=${ACTIVE_STATUSES.join(',')}`, session: adminSession() });
    await screen.findByRole('table', { name: 'Metadados dos chamados' });
    // o link "Em aberto" da visão geral chega com o grupo já selecionado
    expect(screen.getByLabelText('Situação')).toHaveDisplayValue('Em aberto');
    expect(decoded(calls.find((call) => call.path.startsWith('/api/admin/tickets'))!.path)).toBe(`/api/admin/tickets?page=1&pageSize=25&status=${ACTIVE_STATUSES.join(',')}`);

    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'Finalizados');
    expect(decoded(router.state.location.search)).toBe(`?status=${FINISHED_STATUSES.join(',')}`);
    await screen.findByRole('option', { name: 'Financeiro' });
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), 'financial');
    expect(decoded(router.state.location.search)).toBe(`?status=${FINISHED_STATUSES.join(',')}&category=financial`);
    await screen.findByRole('table', { name: 'Metadados dos chamados' });
    expect(decoded(calls.at(-1)!.path)).toBe(`/api/admin/tickets?page=1&pageSize=25&status=${FINISHED_STATUSES.join(',')}&category=financial`);
  });

  it('pagina no servidor', async () => {
    const { calls } = mockApi({
      'GET /api/admin/tickets': ({ url }) => {
        const page = Number(url.searchParams.get('page') ?? '1');
        return { data: { items: [makeAdminTicket({ id: `t-${page}`, protocol: `ASA-2026-0000${page}` })], total: 30, page, pageSize: 25 } };
      },
    });
    renderRoutes(routes, { initialPath: '/admin/chamados', session: adminSession() });
    expect(await screen.findByText('1–25 de 30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('ASA-2026-00002')).toBeInTheDocument();
    expect(calls.at(-1)!.path).toBe('/api/admin/tickets?page=2&pageSize=25');
  });

  it('sem chamados mostra o estado vazio', async () => {
    mockApi({ 'GET /api/admin/tickets': () => ({ data: { items: [], total: 0, page: 1, pageSize: 25 } }) });
    renderRoutes(routes, { initialPath: '/admin/chamados', session: adminSession() });
    expect(await screen.findByText('Nenhum chamado')).toBeInTheDocument();
  });

  it('403 da API mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/tickets': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/chamados', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
