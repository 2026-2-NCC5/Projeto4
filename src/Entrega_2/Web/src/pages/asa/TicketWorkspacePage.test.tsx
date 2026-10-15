import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCatalog, makeStaffTicket } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { SupportStaffTicket } from '@/types/api';
import TicketWorkspacePage from './TicketWorkspacePage';

const staffSession = () => makeSession(makeMe('institutional_staff'));
const routes = [{ path: '/asa/chamados/:id', element: <TicketWorkspacePage /> }];
const BASE = '/api/support/staff/tickets/t-1';

type Handlers = Parameters<typeof mockApi>[0];

/** Servidor falso com estado: GET e /read devolvem sempre a versão mais recente do chamado (como a API real). */
function setup(ticket: SupportStaffTicket = makeStaffTicket(), extra: Handlers | ((server: { ticket: SupportStaffTicket }) => Handlers) = {}) {
  const server = { ticket };
  const api = mockApi({
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    [`GET ${BASE}`]: () => ({ data: server.ticket }),
    [`POST ${BASE}/read`]: () => {
      server.ticket = { ...server.ticket, unreadFromStudent: 0 };
      return { data: server.ticket };
    },
    ...(typeof extra === 'function' ? extra(server) : extra),
  });
  const view = renderRoutes(routes, { initialPath: '/asa/chamados/t-1', session: staffSession() });
  return { ...api, ...view, server };
}

const posted = (calls: Array<{ method: string; path: string; body: unknown }>, suffix: string) => calls.filter((call) => call.method === 'POST' && call.path === `${BASE}${suffix}`);

describe('Atendimento do chamado', () => {
  it('abre o chamado, confirma a leitura e mostra pedido, conversa e histórico com eventos internos', async () => {
    const { calls } = setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' })).toBeInTheDocument();
    await waitFor(() => expect(posted(calls, '/read')).toHaveLength(1));
    expect(screen.getByText('O boleto de outubro veio com valor diferente do contrato.')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Mensagem de Maria Souza' })).toHaveTextContent('Alguma novidade?');
    const history = screen.getByRole('list', { name: 'Histórico do chamado' });
    expect(within(history).getByText('(interno)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver histórico do aluno' })).toHaveAttribute('href', '/asa/alunos/student-1');
  });

  it('mostra a meta de primeira resposta da equipe (situação e horários)', async () => {
    setup(makeStaffTicket({ firstResponse: { dueAt: '2026-10-05T21:00:00.000Z', respondedAt: '2026-10-05T15:00:00.000Z', status: 'met' } }));
    expect(await screen.findByText('Respondido no prazo')).toBeInTheDocument();
    expect(screen.getByText(/meta até/)).toBeInTheDocument();
  });

  it('nota interna vai para /notes e resposta pública para /messages', async () => {
    const { calls } = setup(makeStaffTicket(), {
      [`POST ${BASE}/notes`]: () => ({ status: 201, data: makeStaffTicket() }),
      [`POST ${BASE}/messages`]: () => ({ status: 201, data: makeStaffTicket() }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });

    await userEvent.click(screen.getByRole('radio', { name: 'Nota interna' }));
    expect(screen.getByText('Nota interna — visível só para a equipe')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Nota interna'), 'Verificar com o financeiro');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(posted(calls, '/notes')).toHaveLength(1));
    expect(posted(calls, '/notes')[0]!.body).toEqual({ content: 'Verificar com o financeiro' });
    expect(posted(calls, '/messages')).toHaveLength(0);
    expect(await screen.findByText('Nota interna registrada.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Responder ao aluno' }));
    await userEvent.type(screen.getByLabelText('Resposta ao aluno'), 'Já pedimos a correção do boleto.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    await waitFor(() => expect(posted(calls, '/messages')).toHaveLength(1));
    expect(posted(calls, '/messages')[0]!.body).toEqual({ content: 'Já pedimos a correção do boleto.' });
    expect(posted(calls, '/notes')).toHaveLength(1);
  });

  it('pedido de ação ao aluno vai junto da mensagem e é validado antes do envio', async () => {
    const { calls } = setup(makeStaffTicket(), { [`POST ${BASE}/messages`]: () => ({ status: 201, data: makeStaffTicket({ status: 'waiting_student' }) }) });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    await userEvent.click(screen.getByRole('button', { name: 'Pedir uma ação ao aluno' }));
    await userEvent.type(screen.getByLabelText('Resposta ao aluno'), 'Precisamos do comprovante.');
    await userEvent.type(screen.getByLabelText(/O que o aluno precisa fazer/), 'Ok');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e pedir ação' }));
    expect(await screen.findByText(/mínimo de 3 caracteres/)).toBeInTheDocument();
    expect(posted(calls, '/messages')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText(/O que o aluno precisa fazer/));
    await userEvent.type(screen.getByLabelText(/O que o aluno precisa fazer/), 'Enviar comprovante de pagamento');
    await userEvent.type(screen.getByLabelText(/Detalhes do pedido/), 'Envie o comprovante do pagamento de setembro em PDF.');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pedir o envio de um arquivo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e pedir ação' }));
    await waitFor(() => expect(posted(calls, '/messages')).toHaveLength(1));
    expect(posted(calls, '/messages')[0]!.body).toEqual({
      content: 'Precisamos do comprovante.',
      requestAction: { title: 'Enviar comprovante de pagamento', description: 'Envie o comprovante do pagamento de setembro em PDF.', expectsAttachment: true },
    });
  });

  it('resolver exige solução com pelo menos 10 caracteres', async () => {
    const { calls } = setup(makeStaffTicket(), { [`POST ${BASE}/resolve`]: () => ({ data: makeStaffTicket({ status: 'resolved', resolution: 'Boleto corrigido e reenviado.' }) }) });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    await userEvent.click(screen.getByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver chamado' });
    const confirm = within(dialog).getByRole('button', { name: 'Resolver chamado' });
    await userEvent.type(within(dialog).getByLabelText('Solução para o aluno'), 'Corrigido');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Solução para o aluno'), ' e reenviado.');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(posted(calls, '/resolve')).toHaveLength(1));
    expect(posted(calls, '/resolve')[0]!.body).toEqual({ resolution: 'Corrigido e reenviado.' });
    expect(await screen.findByText('Chamado resolvido. O aluno foi avisado.')).toBeInTheDocument();
  });

  it('as situações oferecidas excluem "Aguardando aluno", "Resolvido" e a atual; encerrar pede confirmação', async () => {
    const { calls } = setup(makeStaffTicket({ status: 'in_progress' }), { [`POST ${BASE}/status`]: () => ({ data: makeStaffTicket({ status: 'closed' }) }) });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    const select = screen.getByLabelText('Nova situação') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value).filter(Boolean);
    expect(values).toEqual(['triage', 'assigned', 'in_analysis', 'waiting_department', 'waiting_external', 'closed', 'cancelled']);
    expect(values).not.toContain('waiting_student');
    expect(values).not.toContain('resolved');

    await userEvent.selectOptions(select, 'closed');
    await userEvent.type(screen.getAllByLabelText('Observação para o aluno (opcional)')[0]!, 'Atendimento concluído.');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar situação' }));
    const dialog = await screen.findByRole('dialog', { name: 'Encerrar este chamado?' });
    expect(posted(calls, '/status')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Encerrar chamado' }));
    await waitFor(() => expect(posted(calls, '/status')).toHaveLength(1));
    expect(posted(calls, '/status')[0]!.body).toEqual({ status: 'closed', publicNote: 'Atendimento concluído.' });
  });

  it('409 ticket_changed recarrega o chamado e avisa que outra pessoa o atualizou', async () => {
    const { calls } = setup(makeStaffTicket({ status: 'received' }), {
      [`POST ${BASE}/status`]: () => ({ status: 409, error: { code: 'CONFLICT', message: 'O chamado foi atualizado enquanto você agia.', reason: 'ticket_changed' } }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    const gets = () => calls.filter((call) => call.method === 'GET' && call.path === BASE).length;
    const before = gets();
    await userEvent.selectOptions(screen.getByLabelText('Nova situação'), 'in_progress');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar situação' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Este chamado foi atualizado por outra pessoa enquanto você agia.');
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
    expect(posted(calls, '/status')).toHaveLength(1);
  });

  it('chamado resolvido: só encerrar; finalizado: somente consulta', async () => {
    setup(makeStaffTicket({ status: 'resolved', resolution: 'Boleto corrigido.', resolvedAt: '2026-10-14T12:00:00.000Z' }));
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByRole('button', { name: 'Encerrar chamado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver' })).toBeNull();
    expect(screen.queryByLabelText('Nova situação')).toBeNull();
    expect(screen.queryByLabelText('Resposta ao aluno')).toBeNull();
    expect(screen.getByText('Chamado resolvido: somente consulta.')).toBeInTheDocument();
  });

  it('"Assumir" é atribuição à equipe atual (fica com quem clicou) e explica que muda a situação e avisa o aluno', async () => {
    const { calls } = setup(makeStaffTicket({ status: 'received' }), (server) => ({
      [`POST ${BASE}/assign`]: () => {
        server.ticket = { ...server.ticket, status: 'assigned', assignedAgent: { id: 'user-institutional_staff', fullName: 'Atendente ASA' } };
        return { data: server.ticket };
      },
    }));
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByText(/A situação passa para “Encaminhado” e o aluno é avisado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assumir atendimento' }));
    await waitFor(() => expect(posted(calls, '/assign')).toHaveLength(1));
    expect(posted(calls, '/assign')[0]!.body).toEqual({ team: 'Financeiro' });
    expect(await screen.findByText('Você assumiu o atendimento.')).toBeInTheDocument();
    expect(screen.getByText('Você é o atendente deste chamado.')).toBeInTheDocument();
  });

  it('assumir um chamado já em andamento fica só no histórico interno', async () => {
    setup(makeStaffTicket({ status: 'in_progress' }));
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByText(/Fica só no histórico interno: o aluno não é avisado./)).toBeInTheDocument();
  });

  it('encaminhar para outra equipe deixa o chamado sem atendente', async () => {
    const mine = { id: 'user-institutional_staff', fullName: 'Atendente ASA' };
    const { calls } = setup(makeStaffTicket({ status: 'in_progress', assignedAgent: mine }), (server) => ({
      [`POST ${BASE}/assign`]: () => {
        server.ticket = { ...server.ticket, assignedTeam: 'Secretaria Acadêmica', assignedAgent: null };
        return { data: server.ticket };
      },
    }));
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByText('Você é o atendente deste chamado.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Equipe'), 'Secretaria Acadêmica');
    await userEvent.type(screen.getByLabelText('Observação para o aluno (opcional)'), 'A secretaria vai emitir o documento.');
    await userEvent.click(screen.getByRole('button', { name: 'Encaminhar' }));
    await waitFor(() => expect(posted(calls, '/assign')).toHaveLength(1));
    expect(posted(calls, '/assign')[0]!.body).toEqual({ team: 'Secretaria Acadêmica', publicNote: 'A secretaria vai emitir o documento.' });
    expect(await screen.findByText(/Chamado encaminhado para Secretaria Acadêmica. Ele fica sem atendente/)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(within(summary).getByText('Sem atendente')).toBeInTheDocument();
    expect(within(summary).getByText('Secretaria Acadêmica')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assumir atendimento' })).toBeInTheDocument();
  });

  it('sem tickets:manage: só consulta e nota interna; sem as duas permissões, nenhuma escrita', async () => {
    const me = makeMe('institutional_staff');
    const noManage = makeSession({ ...me, permissions: me.permissions.filter((permission) => permission !== 'tickets:manage') });
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      [`GET ${BASE}`]: () => ({ data: makeStaffTicket() }),
      [`POST ${BASE}/read`]: () => ({ data: makeStaffTicket({ unreadFromStudent: 0 }) }),
    });
    const first = renderRoutes(routes, { initialPath: '/asa/chamados/t-1', session: noManage });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByText(/Seu perfil pode consultar este chamado, mas não assumir/)).toBeInTheDocument();
    for (const name of ['Assumir atendimento', 'Resolver', 'Atualizar situação', 'Encaminhar', 'Alterar prioridade']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('radio', { name: 'Responder ao aluno' })).toBeNull();
    expect(screen.queryByLabelText('Resposta ao aluno')).toBeNull();
    expect(screen.getByLabelText('Nota interna')).toBeInTheDocument();
    first.unmount();

    const readOnly = makeSession({ ...me, permissions: me.permissions.filter((permission) => permission !== 'tickets:manage' && permission !== 'tickets:internal_note') });
    renderRoutes(routes, { initialPath: '/asa/chamados/t-1', session: readOnly });
    await screen.findByRole('heading', { level: 1, name: 'Boleto da mensalidade com valor errado' });
    expect(screen.getByText('Seu perfil não pode responder neste chamado.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nota interna')).toBeNull();
  });

  it('chamado inexistente mostra "não encontrado"', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    renderRoutes(routes, { initialPath: '/asa/chamados/t-1', session: staffSession() });
    expect(await screen.findByText('Chamado não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a fila' })).toHaveAttribute('href', '/asa/chamados');
  });
});
