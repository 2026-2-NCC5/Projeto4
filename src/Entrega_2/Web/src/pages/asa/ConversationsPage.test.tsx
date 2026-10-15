import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES } from '@/features/support/labels';
import { makeCatalog, makeList, makeStaffTicket, makeSummary } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import ConversationsPage from './ConversationsPage';

const staffSession = () => makeSession(makeMe('institutional_staff'));

describe('Conversas', () => {
  it('lista as não lidas e as recentes; abrir uma conversa usa ?chamado=, confirma a leitura e responde em /messages', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/staff/tickets': ({ url }) =>
        url.searchParams.get('unread') === '1'
          ? { data: makeList([makeSummary({ unreadCount: 2 })]) }
          : { data: makeList([makeSummary(), makeSummary({ id: 't-2', subject: 'Trancamento de matrícula', protocol: 'ASA-2026-000200' })]) },
      'GET /api/support/staff/tickets/t-1': () => ({ data: makeStaffTicket() }),
      'POST /api/support/staff/tickets/t-1/read': () => ({ data: makeStaffTicket({ unreadFromStudent: 0 }) }),
      'POST /api/support/staff/tickets/t-1/messages': () => ({ status: 201, data: makeStaffTicket() }),
    });
    const { router } = renderRoutes([{ path: '/asa/conversas', element: <ConversationsPage /> }], { initialPath: '/asa/conversas', session: staffSession() });

    const unreadSection = await screen.findByRole('region', { name: /Não lidas/ });
    // mesmo recorte do painel: só chamados ativos com mensagem do aluno não lida
    const unreadCall = calls.map((call) => new URL(call.path, 'http://localhost')).find((url) => url.pathname === '/api/support/staff/tickets' && url.searchParams.get('unread') === '1');
    expect(unreadCall?.searchParams.get('status')).toBe(ACTIVE_STATUSES.join(','));
    const recentSection = await screen.findByRole('region', { name: /Atualizados recentemente/ });
    expect(within(unreadSection).getByText('2 não lidas')).toBeInTheDocument();
    // o chamado já listado nas não lidas não se repete nas recentes
    expect(within(recentSection).queryByText('Boleto da mensalidade com valor errado')).toBeNull();
    expect(within(recentSection).getByText('Trancamento de matrícula')).toBeInTheDocument();
    expect(screen.getByText('Selecione uma conversa')).toBeInTheDocument();

    await userEvent.click(within(unreadSection).getByRole('button', { name: /Boleto da mensalidade/ }));
    expect(router.state.location.search).toBe('?chamado=t-1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Boleto da mensalidade com valor errado' })).toBeInTheDocument();
    expect(within(unreadSection).getByRole('button', { name: /Boleto da mensalidade/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Abrir atendimento completo' })).toHaveAttribute('href', '/asa/chamados/t-1');
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/read')).toBe(true));
    // resposta rápida não oferece pedido de ação (fica no atendimento completo)
    expect(screen.queryByRole('button', { name: 'Pedir uma ação ao aluno' })).toBeNull();

    await userEvent.type(await screen.findByLabelText('Resposta ao aluno'), 'Olá, Maria!');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/messages')?.body).toEqual({ content: 'Olá, Maria!' }));
  });
});
