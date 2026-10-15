import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCatalog, makeTicket } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { SupportTicket } from '@/types/api';
import TicketDetailPage from './TicketDetailPage';

const routes = [
  { path: '/aluno/chamados/:id', element: <TicketDetailPage /> },
  { path: '/aluno/chamados', element: <p>lista de chamados</p> },
  { path: '/aluno/chamados/novo', element: <p>novo chamado</p> },
];
const PATH = '/aluno/chamados/ticket-1';
const BASE = '/api/support/tickets/ticket-1';

function mockTicket(ticket: SupportTicket, extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    [`GET ${BASE}`]: () => ({ data: ticket }),
    [`POST ${BASE}/read`]: () => ({ data: ticket }),
    ...extra,
  });
}

const resolved = (overrides: Partial<SupportTicket> = {}) =>
  makeTicket({
    status: 'resolved',
    resolution: 'Declaração emitida e enviada no chamado.',
    resolvedAt: '2026-10-15T10:00:00.000Z',
    canReply: false,
    canCancel: false,
    canReopen: true,
    canRate: true,
    reopenDeadline: '2026-10-22T10:00:00.000Z',
    sla: { ...makeTicket().sla, status: 'completed', completedAt: '2026-10-15T10:00:00.000Z' },
    ...overrides,
  });

describe('Detalhe do chamado', () => {
  it('mostra o pedido do ASA, marca como lido ao abrir e envia mensagem com clientMessageId', async () => {
    const waiting = makeTicket({
      status: 'waiting_student',
      requiresStudentAction: true,
      sla: { ...makeTicket().sla, status: 'paused', pausedAt: '2026-10-15T09:00:00.000Z' },
      pendingAction: { title: 'Envie o comprovante de matrícula', description: 'Precisamos do comprovante para emitir a declaração.', requestedAt: '2026-10-15T09:00:00.000Z', expectsAttachment: true },
      unreadCount: 1,
    });
    const { calls } = mockTicket(waiting, {
      [`POST ${BASE}/messages`]: ({ body }) => {
        const message = body as { clientMessageId: string; content: string };
        return {
          status: 201,
          data: {
            ...waiting,
            status: 'in_analysis',
            pendingAction: null,
            messages: [...waiting.messages, { id: 'msg-2', senderType: 'student', senderName: 'Estudante Exemplo', content: message.content, createdAt: '2026-10-15T12:00:00.000Z', readAt: null, attachments: [] }],
          } satisfies SupportTicket,
        };
      },
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });

    expect(await screen.findByRole('heading', { level: 1, name: 'Declaração para estágio' })).toBeInTheDocument();
    const notice = screen.getByRole('region', { name: 'O ASA precisa de você' });
    expect(within(notice).getByText('Envie o comprovante de matrícula')).toBeInTheDocument();
    expect(within(notice).getByText(/anexe o arquivo pedido/)).toBeInTheDocument();
    expect(within(notice).getByText(/O prazo fica pausado/)).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === `${BASE}/read`)).toBe(true));

    // progresso: etapa atual anunciada
    const progress = screen.getByRole('list', { name: 'Etapas do atendimento' });
    expect(within(progress).getByText('Aguardando você').closest('li')).toHaveAttribute('aria-current', 'step');

    await user.type(screen.getByRole('textbox', { name: 'Mensagem para o ASA' }), 'Segue o comprovante.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Mensagem enviada ao ASA.')).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST' && call.path === `${BASE}/messages`);
    expect(post?.body).toEqual({ clientMessageId: expect.stringMatching(/^msg-[A-Za-z0-9._:-]{8,}$/), content: 'Segue o comprovante.' });
    expect(await screen.findByText('Segue o comprovante.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'O ASA precisa de você' })).toBeNull();
  });

  it('reenvia a mesma mensagem com a mesma chave depois de falha de rede', async () => {
    let attempts = 0;
    const ticket = makeTicket();
    const { calls } = mockTicket(ticket, {
      [`POST ${BASE}/messages`]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return { status: 201, data: ticket };
      },
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });
    await user.type(await screen.findByRole('textbox', { name: 'Mensagem para o ASA' }), 'Alguma novidade?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/sem risco de duplicar/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Mensagem para o ASA' })).toHaveValue('Alguma novidade?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Mensagem enviada ao ASA.');
    const posts = calls.filter((call) => call.method === 'POST' && call.path === `${BASE}/messages`).map((call) => (call.body as { clientMessageId: string }).clientMessageId);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toBe(posts[0]);
  });

  it('esconde as ações que o servidor não permite e explica por quê', async () => {
    mockTicket(makeTicket({ status: 'cancelled', cancelledAt: '2026-10-15T08:00:00.000Z', canReply: false, canCancel: false, canReopen: false, canRate: false, sla: { ...makeTicket().sla, status: 'completed' } }));
    renderRoutes(routes, { initialPath: PATH });
    expect(await screen.findByText(/foi cancelado e não recebe novas mensagens/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Mensagem para o ASA' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar chamado' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ainda preciso de ajuda' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).toBeNull();
    expect(screen.getByText(/Chamado cancelado em/)).toBeInTheDocument();
    // prazo não se aplica a cancelado (sem selo "Atendimento concluído")
    expect(screen.queryByText('Atendimento concluído')).toBeNull();
    expect(screen.getByText('Não se aplica — chamado cancelado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir novo chamado' })).toHaveAttribute('href', '/aluno/chamados/novo');
  });

  it('cancelar: confirma com motivo opcional e chama a API', async () => {
    const ticket = makeTicket();
    const { calls } = mockTicket(ticket, {
      [`POST ${BASE}/cancel`]: () => ({ data: { ...ticket, status: 'cancelled', cancelledAt: '2026-10-15T12:00:00.000Z', canReply: false, canCancel: false } satisfies SupportTicket }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });
    await user.click(await screen.findByRole('button', { name: 'Cancelar chamado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar este chamado?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Motivo do cancelamento' }), 'Consegui pelo portal.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar chamado' }));
    expect(await screen.findByText('Chamado cancelado. O histórico continua disponível.')).toBeInTheDocument();
    expect(calls.find((call) => call.path === `${BASE}/cancel`)?.body).toEqual({ reason: 'Consegui pelo portal.' });
    expect(screen.queryByRole('button', { name: 'Cancelar chamado' })).toBeNull();
  });

  it('reabrir: exige motivo de 10+ caracteres e chama a API', async () => {
    const ticket = resolved();
    const { calls } = mockTicket(ticket, {
      [`POST ${BASE}/reopen`]: () => ({ data: { ...ticket, status: 'reopened', canReopen: false, canRate: false, canReply: true, canCancel: true } satisfies SupportTicket }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });
    expect(await screen.findByText('Declaração emitida e enviada no chamado.')).toBeInTheDocument();
    expect(screen.getByText(/Você pode reabrir até/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ainda preciso de ajuda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ainda precisa de ajuda?' });
    const confirm = within(dialog).getByRole('button', { name: 'Reabrir chamado' });
    await user.type(within(dialog).getByRole('textbox', { name: /O que ainda precisa/ }), 'Faltou');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /O que ainda precisa/ }), ' a assinatura.');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText('Chamado reaberto. O ASA vai analisar de novo.')).toBeInTheDocument();
    expect(calls.find((call) => call.path === `${BASE}/reopen`)?.body).toEqual({ reason: 'Faltou a assinatura.' });
  });

  it('avaliação: cinco estrelas acessíveis, comentário opcional e nota registrada', async () => {
    const ticket = resolved();
    const { calls } = mockTicket(ticket, {
      [`POST ${BASE}/rating`]: ({ body }) => {
        const rating = body as { rating: 1 | 2 | 3 | 4 | 5; comment?: string };
        return { status: 201, data: { ...ticket, canRate: false, rating: { rating: rating.rating, comment: rating.comment ?? null, createdAt: '2026-10-15T12:00:00.000Z' } } satisfies SupportTicket };
      },
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });
    const send = await screen.findByRole('button', { name: 'Enviar avaliação' });
    expect(send).toBeDisabled();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    await user.click(screen.getByRole('radio', { name: '4 de 5 — Satisfeito' }));
    await user.type(screen.getByRole('textbox', { name: /Comentário/ }), 'Rápido e claro.');
    await user.click(send);
    expect(await screen.findByRole('heading', { name: 'Sua avaliação' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4 de 5 — Satisfeito' })).toBeInTheDocument();
    expect(calls.find((call) => call.path === `${BASE}/rating`)?.body).toEqual({ rating: 4, comment: 'Rápido e claro.' });
  });

  it('conflito do servidor (já avaliado) aparece como erro e recarrega o chamado', async () => {
    const ticket = resolved();
    const { calls } = mockTicket(ticket, {
      [`POST ${BASE}/rating`]: () => ({ status: 409, error: { code: 'CONFLICT', message: 'Você já avaliou este atendimento.', reason: 'already_rated' } }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: PATH });
    await user.click(await screen.findByRole('radio', { name: '5 de 5 — Muito satisfeito' }));
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByText('Você já avaliou este atendimento.')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET' && call.path === BASE).length).toBeGreaterThan(1));
  });

  it('404 mostra "chamado não encontrado"; 403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    const first = renderRoutes(routes, { initialPath: '/aluno/chamados/nao-existe' });
    expect(await screen.findByRole('heading', { name: 'Chamado não encontrado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar aos chamados' })).toHaveAttribute('href', '/aluno/chamados');
    first.unmount();

    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }), [`GET ${BASE}`]: () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Sem acesso.' } }) });
    renderRoutes(routes, { initialPath: PATH });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('anexos da conversa, arquivos do chamado e histórico', async () => {
    const files = [
      { id: 'att-1', name: 'declaracao.pdf', mimeType: 'application/pdf', sizeBytes: 2048, createdAt: '2026-10-15T10:00:00.000Z', uploadedBy: 'agent' as const, uploaderName: 'Secretaria Acadêmica', messageId: 'msg-1' },
      { id: 'att-2', name: 'rg.pdf', mimeType: 'application/pdf', sizeBytes: 1024, createdAt: '2026-10-13T12:00:00.000Z', uploadedBy: 'student' as const, uploaderName: 'Estudante Exemplo', messageId: null },
    ];
    mockTicket(makeTicket({ attachments: files }));
    renderRoutes(routes, { initialPath: PATH });
    const thread = await screen.findByRole('list', { name: 'Mensagens' });
    expect(within(thread).getByRole('button', { name: 'Abrir declaracao.pdf' })).toBeInTheDocument();
    expect(within(thread).queryByText('rg.pdf')).toBeNull();
    const filesSection = screen.getByRole('region', { name: 'Arquivos' });
    expect(within(filesSection).getByText('declaracao.pdf')).toBeInTheDocument();
    expect(within(filesSection).getByText(/1 KB · Você/)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Sua solicitação' })).getByText('rg.pdf')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Histórico do chamado' })).getByText('Encaminhado para Secretaria Acadêmica')).toBeInTheDocument();
  });
});
