import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCounts, makeList, makeSummary } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import TicketsPage from './TicketsPage';

const routes = [
  { path: '/aluno/chamados', element: <TicketsPage /> },
  { path: '/aluno/chamados/novo', element: <p>novo chamado</p> },
  { path: '/aluno/chamados/:id', element: <p>detalhe do chamado</p> },
];

const listCalls = (calls: Array<{ method: string; path: string }>) =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith('/api/support/tickets')).map((call) => new URL(call.path, 'http://localhost').searchParams);

describe('Meus chamados', () => {
  it('lista os chamados com protocolo, categoria, situação, prazo e indicador de não lido', async () => {
    mockApi({
      'GET /api/support/tickets': () => ({
        data: makeList([
          makeSummary({ unreadCount: 2 }),
          makeSummary({ id: 'ticket-2', protocol: 'ASA-2026-000124', subject: 'Boleto em dobro', categoryId: 'financial', categoryLabel: 'Financeiro', subcategoryId: 'bill', subcategoryLabel: 'Boleto', status: 'waiting_student', sla: { ...makeSummary().sla, status: 'paused' } }),
        ]),
      }),
    });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    const list = await screen.findByRole('list', { name: 'Chamados' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Declaração para estágio')).toBeInTheDocument();
    expect(within(items[0]!).getByText('ASA-2026-000123')).toHaveClass('font-mono');
    expect(within(items[0]!).getByRole('img', { name: 'Não lido' })).toBeInTheDocument();
    expect(within(items[0]!).getByText(/2 mensagens novas/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Aguardando você')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Prazo pausado enquanto aguardamos você')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/aluno/chamados/ticket-1');
    expect(screen.getByRole('link', { name: 'Abrir chamado' })).toHaveAttribute('href', '/aluno/chamados/novo');
    // contagens do servidor nos filtros
    expect(screen.getByRole('radio', { name: /Aguardando você/ })).toHaveTextContent('1');
    expect(screen.getByRole('radio', { name: /Todos/ })).toHaveTextContent('3');
    expect(screen.getByText(/Atualizado/)).toBeInTheDocument();
  });

  it('cada filtro pede ao servidor as situações certas', async () => {
    const { calls } = mockApi({ 'GET /api/support/tickets': () => ({ data: makeList([makeSummary()]) }) });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    await screen.findByText('Declaração para estágio');
    expect(listCalls(calls)[0]!.get('status')).toBeNull();
    expect(listCalls(calls)[0]!.get('limit')).toBe('20');

    await userEvent.click(screen.getByRole('radio', { name: /Aguardando você/ }));
    await waitFor(() => expect(listCalls(calls).at(-1)!.get('status')).toBe('waiting_student'));
    expect(screen.getByRole('radio', { name: /Aguardando você/ })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: /Em andamento/ }));
    await waitFor(() =>
      expect(listCalls(calls).at(-1)!.get('status')).toBe('submitted,received,triage,assigned,in_analysis,in_progress,waiting_student,waiting_department,waiting_external,reopened'),
    );

    await userEvent.click(screen.getByRole('radio', { name: /Concluídos/ }));
    await waitFor(() => expect(listCalls(calls).at(-1)!.get('status')).toBe('resolved,closed,cancelled'));
  });

  it('busca no servidor e mostra o vazio da busca com opção de limpar', async () => {
    const { calls } = mockApi({
      'GET /api/support/tickets': ({ url }) => ({ data: url.searchParams.get('search') ? makeList([], { counts: makeCounts() }) : makeList([makeSummary()]) }),
    });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    await screen.findByText('Declaração para estágio');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar chamados' }), 'diploma');
    expect(await screen.findByText('Nenhum chamado encontrado para “diploma”')).toBeInTheDocument();
    expect(listCalls(calls).at(-1)!.get('search')).toBe('diploma');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca e voltar à lista' }));
    expect(await screen.findByText('Declaração para estágio')).toBeInTheDocument();
  });

  it('carrega a próxima página pelo cursor', async () => {
    const { calls } = mockApi({
      'GET /api/support/tickets': ({ url }) =>
        url.searchParams.get('cursor') === 'cursor-2'
          ? { data: makeList([makeSummary({ id: 'ticket-9', subject: 'Chamado antigo' })]) }
          : { data: makeList([makeSummary()], { nextCursor: 'cursor-2' }) },
    });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Chamado antigo')).toBeInTheDocument();
    expect(screen.getByText('Declaração para estágio')).toBeInTheDocument();
    expect(listCalls(calls).at(-1)!.get('cursor')).toBe('cursor-2');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('sem chamados: convida a abrir o primeiro', async () => {
    mockApi({ 'GET /api/support/tickets': () => ({ data: makeList([], { counts: makeCounts({ all: 0, active: 0, waitingStudent: 0, finished: 0 }) }) }) });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    expect(await screen.findByText('Você ainda não abriu chamados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir meu primeiro chamado' })).toHaveAttribute('href', '/aluno/chamados/novo');
  });

  it('erro de rede mostra nova tentativa; 403 mostra acesso não permitido', async () => {
    let fail = true;
    mockApi({
      'GET /api/support/tickets': () => {
        if (fail) throw new TypeError('Failed to fetch');
        return { data: makeList([makeSummary()]) };
      },
    });
    const first = renderRoutes(routes, { initialPath: '/aluno/chamados' });
    expect(await screen.findByText('Não foi possível carregar seus chamados')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Declaração para estágio')).toBeInTheDocument();
    first.unmount();

    mockApi({ 'GET /api/support/tickets': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Sem acesso.' } }) });
    renderRoutes(routes, { initialPath: '/aluno/chamados' });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
