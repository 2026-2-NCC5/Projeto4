import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCatalog, makeList, makeStaffTicket, makeSummary } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { SupportConversationInfo, SupportEventFeed, SupportInboxCounts, SupportStaffTicket, SupportStaffTicketMessage, SupportTicketSummary, SupportWhatsAppStatus } from '@/types/api';
import SupportCentralPage from './SupportCentralPage';

vi.mock('@/features/support/central/PdfCanvas', () => ({
  PdfCanvas: ({ name }: { name: string }) => <div role="img" aria-label={`PDF: ${name}`} />,
}));

const staffSession = () => makeSession(makeMe('institutional_staff'));

const STATUS: SupportWhatsAppStatus = {
  configured: true,
  demoMode: true,
  outboundEnabled: true,
  provider: 'fake',
  checkedAt: '2026-11-02T12:00:00.000Z',
  channels: [{ id: 'c-1', name: 'Canal', provider: 'fake', state: 'enabled', status: 'CONNECTED', maskedNumber: '+•••• 0001', isDemo: true, lastWebhookAt: null }],
};
const COUNTS: SupportInboxCounts = { newTickets: 3, mine: 1, waitingStudent: 0, unidentified: 2, whatsapp: 2, unread: 1 };
const FEED: SupportEventFeed = { events: [], nextCursor: 'c1', hasMore: false, resyncRequired: false, serverTime: '2026-11-02T12:00:00.000Z' };

const conversation = (overrides: Partial<SupportConversationInfo> = {}): SupportConversationInfo => ({
  id: 'conv-1',
  channelId: 'c-1',
  channelName: 'Canal',
  contactLabel: '+•••• 1234',
  contactName: 'Nome no WhatsApp',
  identified: false,
  linkedAt: null,
  lastInboundAt: '2026-11-02T11:00:00.000Z',
  serviceWindow: { kind: 'not_applicable', expiresAt: null },
  replyBlock: null,
  ...overrides,
});

const whatsappMessage = (overrides: Partial<SupportStaffTicketMessage> = {}): SupportStaffTicketMessage => ({
  id: 'm-wa',
  senderType: 'contact',
  senderName: 'Contato do WhatsApp',
  content: 'Preciso do comprovante',
  createdAt: '2026-11-02T11:00:00.000Z',
  readAt: null,
  attachments: [],
  transport: 'whatsapp',
  deliveryState: 'not_applicable',
  deliveryErrorCode: null,
  deliveryUpdatedAt: null,
  contentKind: 'text',
  studentVisible: false,
  canRetry: false,
  ...overrides,
});

const unidentified = (overrides: Partial<SupportStaffTicket> = {}) =>
  makeStaffTicket({ channel: 'whatsapp', student: null, conversation: conversation(), messages: [whatsappMessage()], tags: [], version: 3, ...overrides });

const row = (overrides: Partial<SupportTicketSummary> = {}) =>
  makeSummary({ staff: { studentId: null, studentName: 'Contato não identificado', registrationNumber: '—', assignedTeam: 'Atendimento ASA', assignedAgentId: null, assignedAgentName: null, channel: 'whatsapp', contactLabel: '+•••• 1234', lastMessagePreview: 'Preciso do comprovante', tags: [] }, ...overrides });

function central(ticket: SupportStaffTicket, extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    'GET /api/support/staff/events': () => ({ data: FEED }),
    'GET /api/support/staff/whatsapp/status': () => ({ data: STATUS }),
    'GET /api/support/staff/inbox/counts': () => ({ data: COUNTS }),
    'GET /api/support/staff/tickets': () => ({ data: makeList([row()]) }),
    'GET /api/support/staff/saved-replies': () => ({ data: { items: [{ id: 'r-1', categoryId: null, title: 'Comprovante', body: 'Seu comprovante está pronto.', approvalStatus: 'approved', updatedAt: '2026-11-01T00:00:00.000Z' }] } }),
    [`GET /api/support/staff/tickets/${ticket.id}`]: () => ({ data: ticket }),
    [`POST /api/support/staff/tickets/${ticket.id}/read`]: () => ({ data: ticket }),
    [`POST /api/support/staff/tickets/${ticket.id}/presence`]: () => ({ data: { viewers: [] } }),
    ...extra,
  });
}

const openCentral = (path = '/asa/atendimento/t-1') =>
  renderRoutes(
    [
      { path: '/asa/atendimento', element: <SupportCentralPage /> },
      { path: '/asa/atendimento/:ticketId', element: <SupportCentralPage /> },
    ],
    { initialPath: path, session: staffSession() },
  );

describe('Central de Atendimento', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('monta os três painéis na mesma aba, com o estado real do canal e a marca de demonstração', async () => {
    central(unidentified());
    openCentral();
    expect(await screen.findByRole('region', { name: 'Caixa de entrada' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conversa' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contexto do atendimento' })).toBeInTheDocument();
    expect(await screen.findByText('WhatsApp: Conectado')).toBeInTheDocument();
    expect(screen.getByText('Modo de demonstração')).toBeInTheDocument();
    expect(await screen.findByText(/Preciso do comprovante/, { selector: 'p' })).toBeInTheDocument();
    // contato sem vínculo: nada de RA nem de dados acadêmicos
    expect(screen.getAllByText('Sem vínculo verificado').length).toBeGreaterThan(0);
    expect(screen.queryByText(/RA-2026/)).toBeNull();
  });

  it('nomeia o estado da ligação com a API separado do estado do WhatsApp', async () => {
    central(unidentified());
    openCentral();
    expect(await screen.findByText('Atualizando ao vivo')).toBeInTheDocument();
    expect(await screen.findByText('WhatsApp: Conectado')).toBeInTheDocument();
  });

  it('resposta vai pelo WhatsApp com chave de idempotência e mostra "na fila", nunca "entregue"', async () => {
    const queued = unidentified({ messages: [whatsappMessage(), whatsappMessage({ id: 'm-out', senderType: 'agent', senderName: 'Atendimento ASA', content: 'Vou conferir', deliveryState: 'queued' })] });
    const { calls } = central(unidentified(), { 'POST /api/support/staff/tickets/t-1/messages': () => ({ status: 202, data: queued }) });
    openCentral();
    const field = await screen.findByLabelText('Resposta pelo WhatsApp');
    await userEvent.type(field, 'Vou conferir');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/messages')).toBe(true));
    const body = calls.find((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/messages')?.body as { content: string; transport: string; clientMessageId: string };
    expect(body).toMatchObject({ content: 'Vou conferir', transport: 'whatsapp' });
    expect(body.clientMessageId.length).toBeGreaterThanOrEqual(8);
    expect(await screen.findByText('Na fila de envio')).toBeInTheDocument();
    expect(screen.queryByText('Entregue')).toBeNull();
  });

  it('canal desconectado: explica, trava o envio e não esconde o chamado', async () => {
    central(unidentified({ conversation: conversation({ replyBlock: 'channel_disconnected' }) }));
    openCentral();
    expect(await screen.findByRole('alert')).toHaveTextContent('desconectado');
    expect(screen.getByLabelText('Resposta pelo WhatsApp')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Conversa' })).toHaveTextContent('Preciso do comprovante');
  });

  it('janela vencida da API oficial mostra a regra certa', async () => {
    central(unidentified({ conversation: conversation({ replyBlock: 'template_required', serviceWindow: { kind: 'expired', expiresAt: '2026-11-01T00:00:00.000Z' } }) }));
    openCentral();
    expect(await screen.findByRole('alert')).toHaveTextContent('modelo aprovado');
  });

  it('chamado de outra pessoa pede confirmação e reenvia com a decisão explícita', async () => {
    let attempts = 0;
    const { calls } = central(unidentified({ assignedAgent: { id: 'outra', fullName: 'Bruno Atendente' } }), {
      'POST /api/support/staff/tickets/t-1/messages': () => {
        attempts += 1;
        return attempts === 1 ? { status: 409, error: { code: 'CONFLICT', message: 'Está com outra pessoa.', reason: 'assigned_to_other' } } : { status: 202, data: unidentified() };
      },
    });
    openCentral();
    expect(await screen.findByText(/Este chamado está com Bruno Atendente/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Resposta pelo WhatsApp'), 'Assumindo aqui');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Responder mesmo assim' }));
    await waitFor(() => expect(attempts).toBe(2));
    const last = calls.filter((call) => call.method === 'POST' && call.path === '/api/support/staff/tickets/t-1/messages').at(-1)?.body;
    expect(last).toMatchObject({ overrideAssignee: true });
  });

  it('resultado desconhecido pede confirmação antes de reenviar', async () => {
    const message = whatsappMessage({ id: 'm-unk', senderType: 'agent', senderName: 'Atendimento ASA', content: 'Olá', deliveryState: 'unknown', canRetry: true });
    const { calls } = central(unidentified({ messages: [message] }), { 'POST /api/support/staff/tickets/t-1/messages/m-unk/retry': () => ({ status: 202, data: { messageId: 'm-unk', deliveryState: 'queued' } }) });
    openCentral();
    expect(await screen.findByText('Sem confirmação: pode ter sido enviada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('pode receber duas vezes');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reenviar mesmo assim' }));
    await waitFor(() => expect(calls.find((call) => call.path.endsWith('/retry'))?.body).toEqual({ confirmDuplicateRisk: true }));
  });

  it('nota interna é um modo separado, claramente marcado', async () => {
    const { calls } = central(unidentified(), { 'POST /api/support/staff/tickets/t-1/notes': () => ({ status: 201, data: unidentified() }) });
    openCentral();
    await screen.findByLabelText('Resposta pelo WhatsApp');
    await userEvent.click(screen.getByRole('button', { name: 'Nota interna' }));
    const field = screen.getByLabelText(/Nota interna: nunca sai no WhatsApp/);
    await userEvent.type(field, 'Conferir com a secretaria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(calls.find((call) => call.path.endsWith('/notes'))?.body).toEqual({ content: 'Conferir com a secretaria' }));
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/messages'))).toBe(false);
  });

  it('modelo aprovado preenche o rascunho; nada é enviado sem revisão', async () => {
    const { calls } = central(unidentified());
    openCentral();
    await screen.findByLabelText('Resposta pelo WhatsApp');
    await userEvent.selectOptions(await screen.findByLabelText('Modelo aprovado'), 'r-1');
    expect(screen.getByLabelText('Resposta pelo WhatsApp')).toHaveValue('Seu comprovante está pronto.');
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/messages'))).toBe(false);
  });

  it('documento abre na própria tela, com o chat ao lado, por link temporário', async () => {
    const attachment = { id: 'a-1', name: 'historico.pdf', mimeType: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-02T11:00:00.000Z', uploadedBy: 'contact' as const, uploaderName: 'Contato', messageId: 'm-wa', origin: 'whatsapp' as const, studentVisible: false, reviewStatus: 'received' as const };
    const { calls } = central(unidentified({ attachments: [attachment] }), { 'GET /api/support/staff/tickets/t-1/attachments/a-1/link': () => ({ data: { url: '/api/support/files/a-1?exp=1&sig=abc', expiresAt: '2026-11-02T12:05:00.000Z' } }) });
    openCentral();
    await userEvent.click(await screen.findByRole('tab', { name: /Documentos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Visualizar' }));
    expect(await screen.findByRole('img', { name: 'PDF: historico.pdf' })).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/attachments/a-1/link'))).toBe(true);
    // o chat continua na tela e pronto para responder
    expect(screen.getByRole('region', { name: 'Conversa' })).toHaveTextContent('Preciso do comprovante');
    expect(screen.getByLabelText('Resposta pelo WhatsApp')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar a prévia' }));
    expect(screen.queryByRole('region', { name: /Prévia de/ })).toBeNull();
  });

  it('tipo sem prévia segura mostra só os dados e o download', async () => {
    const attachment = { id: 'a-2', name: 'contrato.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 1024, createdAt: '2026-11-02T11:00:00.000Z', uploadedBy: 'contact' as const, uploaderName: 'Contato', messageId: null, origin: 'whatsapp' as const, studentVisible: false, reviewStatus: 'received' as const };
    central(unidentified({ attachments: [attachment] }), { 'GET /api/support/staff/tickets/t-1/attachments/a-2/link': () => ({ data: { url: '/api/support/files/a-2?exp=1&sig=abc', expiresAt: '2026-11-02T12:05:00.000Z' } }) });
    openCentral();
    await userEvent.click(await screen.findByRole('tab', { name: /Documentos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Visualizar' }));
    expect(await screen.findByText(/não é exibido na tela por segurança/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Baixar' })).toHaveAttribute('href', '/api/support/files/a-2?exp=1&sig=abc');
  });

  it('contexto do aluno: indisponível sem vínculo, sem chamar a API de contexto', async () => {
    const { calls } = central(unidentified());
    openCentral();
    await userEvent.click(await screen.findByRole('tab', { name: 'Acadêmico' }));
    expect(screen.getByText(/Indisponível\./)).toBeInTheDocument();
    expect(calls.some((call) => call.path.startsWith('/api/asa/students'))).toBe(false);
  });

  it('divisores redimensionam pelo teclado e o tamanho fica salvo para o usuário; o painel direito recolhe sem afetar o chat', async () => {
    central(unidentified());
    const { unmount } = openCentral();
    const separator = await screen.findByRole('separator', { name: 'Ajustar a largura da caixa de entrada' });
    expect(separator).toHaveAttribute('aria-valuenow', '22');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '24');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator).toHaveAttribute('aria-valuenow', '16');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '36');

    await userEvent.click(screen.getByRole('button', { name: 'Recolher o painel de contexto' }));
    expect(screen.queryByRole('region', { name: 'Contexto do atendimento' })).toBeNull();
    expect(screen.getByLabelText('Resposta pelo WhatsApp')).toBeInTheDocument();

    unmount();
    central(unidentified());
    openCentral();
    expect(await screen.findByRole('separator', { name: 'Ajustar a largura da caixa de entrada' })).toHaveAttribute('aria-valuenow', '36');
    expect(screen.queryByRole('region', { name: 'Contexto do atendimento' })).toBeNull();
    // nada do atendimento no navegador: só tamanhos
    for (const key of Object.keys(localStorage)) expect(localStorage.getItem(key)).not.toContain('comprovante');
  });

  it('filas: contadores reais, filtros certos na API e abrir um atendimento vai para a rota dele', async () => {
    const { calls } = central(unidentified());
    const { router } = openCentral('/asa/atendimento');
    expect(await screen.findByRole('tab', { name: /Não identificados 2/ })).toBeInTheDocument();
    expect(screen.getByText('Selecione um atendimento')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Não identificados/ }));
    await waitFor(() => {
      const url = calls.map((call) => new URL(call.path, 'http://localhost')).filter((item) => item.pathname === '/api/support/staff/tickets').at(-1);
      expect(url?.searchParams.get('unidentified')).toBe('1');
    });
    expect(router.state.location.search).toBe('?fila=unidentified');
    await userEvent.click(await screen.findByRole('button', { name: /\+•••• 1234/ }));
    expect(router.state.location.pathname).toBe('/asa/atendimento/t-1');
  });

  it('atualiza a conversa quando chega evento, sem recarregar a página', async () => {
    let feedCalls = 0;
    let ticket = unidentified();
    central(ticket, {
      [`GET /api/support/staff/tickets/t-1`]: () => ({ data: ticket }),
      'GET /api/support/staff/events': () => {
        feedCalls += 1;
        if (feedCalls === 1) return { data: FEED };
        if (feedCalls === 2) {
          ticket = unidentified({ messages: [whatsappMessage(), whatsappMessage({ id: 'm-2', content: 'Segunda mensagem chegou' })] });
          return { data: { ...FEED, nextCursor: 'c2', events: [{ schemaVersion: '1.0', eventId: 'e-1', correlationId: null, ticketId: 't-1', sequence: 5, type: 'support.message.created', occurredAt: '2026-11-02T12:00:00.000Z', actor: { type: 'contact' }, audience: 'STAFF_ONLY', data: { messageId: 'm-2' } }] } };
        }
        return { data: { ...FEED, nextCursor: 'c3' } };
      },
    });
    openCentral();
    // a segunda leitura do feed respeita o intervalo mínimo entre chamadas
    expect(await screen.findByText('Segunda mensagem chegou', undefined, { timeout: 4000 })).toBeInTheDocument();
  });

  it('resposta imediata do servidor não vira laço: respeita o intervalo mínimo entre chamadas', async () => {
    let feedCalls = 0;
    central(unidentified(), {
      'GET /api/support/staff/events': () => {
        feedCalls += 1;
        return { data: FEED };
      },
    });
    openCentral();
    await screen.findByText('Atualizando ao vivo');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    // em 1,5 s, no máximo a leitura inicial e mais duas
    expect(feedCalls).toBeLessThanOrEqual(3);
    expect(feedCalls).toBeGreaterThanOrEqual(2);
  });

  it('sem conexão com a API, mostra que está tentando reconectar', async () => {
    central(unidentified(), { 'GET /api/support/staff/events': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Indisponível.' } }) });
    openCentral();
    expect(await screen.findByText(/tentando reconectar/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conversa' })).toBeInTheDocument();
  });

  it('administração e aluno não abrem a Central', async () => {
    central(unidentified());
    renderRoutes([{ path: '/asa/atendimento', element: <SupportCentralPage /> }], { initialPath: '/asa/atendimento', session: makeSession(makeMe('technical_admin')) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('mostra quem mais está com o chamado aberto', async () => {
    central(unidentified(), { 'POST /api/support/staff/tickets/t-1/presence': () => ({ data: { viewers: [{ userId: 'u-2', name: 'Carla', composing: true, lastSeenAt: '2026-11-02T12:00:00.000Z' }] } }) });
    openCentral();
    expect(await screen.findByText('Carla está escrevendo neste chamado.')).toBeInTheDocument();
    await act(async () => undefined);
  });
});
