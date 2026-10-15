import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeDashboard } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AsaDashboardPage from './AsaDashboardPage';

const staffSession = () => makeSession(makeMe('institutional_staff'));
const routes = [{ path: '/asa', element: <AsaDashboardPage /> }];

describe('Painel da Operação ASA', () => {
  it('cada número leva à fila com o filtro correspondente', async () => {
    mockApi({ 'GET /api/asa/dashboard': () => ({ data: makeDashboard() }) });
    renderRoutes(routes, { initialPath: '/asa', session: staffSession() });
    const metrics = await screen.findByRole('region', { name: 'Números da operação' });
    const link = (name: RegExp) => within(metrics).getByRole('link', { name });
    expect(link(/^Em aberto/)).toHaveAttribute('href', '/asa/chamados');
    expect(link(/^Aguardando triagem/)).toHaveAttribute('href', '/asa/chamados?status=submitted,received,triage,reopened');
    expect(link(/^Sem atendente/)).toHaveAttribute('href', '/asa/chamados?assigned=unassigned');
    expect(link(/^Comigo/)).toHaveAttribute('href', '/asa/chamados?assigned=mine');
    expect(link(/^Com mensagens não lidas/)).toHaveAttribute('href', '/asa/chamados?unread=1');
    expect(link(/^Aguardando aluno/)).toHaveAttribute('href', '/asa/chamados?status=waiting_student');
    expect(link(/^Prazo próximo/)).toHaveAttribute('href', '/asa/chamados?sla=near_deadline');
    expect(link(/^Prazo excedido/)).toHaveAttribute('href', '/asa/chamados?sla=overdue');
    // os números vêm da API
    expect(within(link(/^Sem atendente/)).getByText('5')).toBeInTheDocument();
    expect(within(link(/^Prazo excedido/)).getByText('2')).toBeInTheDocument();
  });

  it('mostra a fonte, o modo de dados e a lista de risco; esconde agendamentos quando a API não os informa', async () => {
    mockApi({ 'GET /api/asa/dashboard': () => ({ data: makeDashboard() }) });
    renderRoutes(routes, { initialPath: '/asa', session: staffSession() });
    expect(await screen.findByText(/Fonte: Chamados e mensagens do Atendimento ASA/)).toBeInTheDocument();
    expect(screen.getByText(/^atualizado/)).toHaveTextContent('America/Sao_Paulo');
    expect(screen.getByText('Dados de demonstração')).toBeInTheDocument();
    const atRisk = screen.getByRole('list', { name: 'Chamados em risco de prazo' });
    const item = within(atRisk).getByRole('link', { name: /Revisão de prova atrasada/ });
    expect(item).toHaveAttribute('href', '/asa/chamados/t-risk');
    expect(item).toHaveTextContent('Maria Souza');
    expect(item).toHaveTextContent('Prazo excedido');
    expect(screen.queryByText('Agendamentos de hoje')).toBeNull();
  });

  it('falha ao atualizar mantém os números anteriores e avisa (nada de dado velho apresentado como atual)', async () => {
    let calls = 0;
    mockApi({
      'GET /api/asa/dashboard': () => {
        calls += 1;
        return calls === 1 ? { data: makeDashboard() } : { status: 503, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Banco indisponível.' } };
      },
    });
    renderRoutes(routes, { initialPath: '/asa', session: staffSession() });
    const metrics = await screen.findByRole('region', { name: 'Números da operação' });
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar agora.');
    expect(within(metrics).getByRole('link', { name: /^Sem atendente/ })).toHaveTextContent('5');
  });

  it('403 da API vira "acesso não permitido"', async () => {
    mockApi({ 'GET /api/asa/dashboard': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Sem permissão.' } }) });
    renderRoutes(routes, { initialPath: '/asa', session: staffSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
