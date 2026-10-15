import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeCatalog, makeTicket } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import NewTicketPage from './NewTicketPage';

const routes = [
  { path: '/aluno/chamados/novo', element: <NewTicketPage /> },
  { path: '/aluno/chamados', element: <p>lista de chamados</p> },
  { path: '/aluno/chamados/:id', element: <p>detalhe do chamado</p> },
];

const UPLOAD_ID = '0b0f8f3e-3c3a-4a55-9a43-0e7c1f6d2a10';
const continueButton = () => screen.getByRole('button', { name: 'Continuar' });

describe('Abrir chamado (assistente em 4 etapas)', () => {
  it('valida cada etapa, sugere artigos, envia com anexo e repete com a mesma chave após falha de rede', async () => {
    let attempts = 0;
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'POST /api/support/uploads': ({ body }) => {
        const upload = body as { name: string; mimeType: string };
        return { status: 201, data: { id: UPLOAD_ID, name: upload.name, mimeType: upload.mimeType, sizeBytes: 14, createdAt: '2026-10-15T12:00:00.000Z', expiresAt: '2026-10-16T12:00:00.000Z' } };
      },
      'POST /api/support/tickets': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return { status: 201, data: makeTicket({ id: 'ticket-new', protocol: 'ASA-2026-000777', status: 'received', assignedTeam: 'Atendimento ASA', subject: 'Histórico para intercâmbio' }) };
      },
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/aluno/chamados/novo' });

    // etapa 1 — Solicitação
    await screen.findByRole('heading', { name: 'Sobre o que é a solicitação?' });
    const steps = screen.getByRole('navigation', { name: 'Etapas da abertura do chamado' });
    expect(within(steps).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
    await user.click(continueButton());
    expect(await screen.findByText('Escolha o assunto da solicitação.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Documentos/ }));
    expect(screen.getByText(/Prazo de resposta: até 3 dias úteis/)).toBeInTheDocument();
    await user.click(continueButton());
    expect(await screen.findByText('Escolha o tipo da solicitação.')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /Tipo de solicitação/ }), 'transcript');
    await user.click(continueButton());

    // etapa 2 — Detalhes (sugestões nunca bloqueiam)
    await screen.findByRole('heading', { name: 'Conte os detalhes' });
    expect(within(steps).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
    const suggestions = screen.getByRole('region', { name: 'Talvez isto resolva' });
    expect(within(suggestions).getByText('Como obter o histórico escolar?')).toBeInTheDocument();
    expect(within(suggestions).getByText('Quando recebo o diploma?')).toBeInTheDocument();
    expect(within(suggestions).queryByText('Onde encontro o plano de ensino?')).toBeNull(); // no máximo 3
    expect(within(suggestions).queryByText(/segunda via do boleto/)).toBeNull(); // só da categoria escolhida
    await user.click(continueButton());
    expect(await screen.findByText('Descreva o assunto com pelo menos 5 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Conte um pouco mais: pelo menos 20 caracteres.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Assunto/ }), 'Histórico para intercâmbio');
    expect(screen.getByText('26/120 caracteres')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Preciso do histórico escolar assinado para o intercâmbio.');
    await user.click(continueButton());

    // etapa 3 — Anexos
    await screen.findByRole('heading', { name: 'Anexos (opcional)' });
    await user.upload(screen.getByLabelText('Anexar arquivo'), new File(['%PDF-1.4 teste'], 'rg.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('rg.pdf')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('enviando…')).toBeNull());
    await user.click(continueButton());

    // etapa 4 — Revisão
    await screen.findByRole('heading', { name: 'Revise e envie' });
    expect(screen.getByText('Histórico escolar')).toBeInTheDocument();
    expect(screen.getByText('rg.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar solicitação' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar chamado' }));
    expect(await screen.findByText(/o envio não será duplicado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar chamado' }));

    // sucesso
    expect(await screen.findByRole('heading', { name: 'Solicitação registrada' })).toBeInTheDocument();
    expect(screen.getByText('ASA-2026-000777')).toHaveClass('font-mono');
    expect(screen.getByText(/Atendimento ASA \(triagem\), depois Secretaria Acadêmica/)).toBeInTheDocument();
    expect(screen.getByText(/Até 3 dias úteis/)).toBeInTheDocument();
    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/api/support/tickets');
    expect(posts).toHaveLength(2);
    const first = posts[0]!.body as { clientRequestId: string };
    expect(first.clientRequestId).toMatch(/^req-[A-Za-z0-9._:-]{8,124}$/);
    expect(posts[1]!.body).toEqual({
      clientRequestId: first.clientRequestId,
      categoryId: 'documents',
      subcategoryId: 'transcript',
      subject: 'Histórico para intercâmbio',
      description: 'Preciso do histórico escolar assinado para o intercâmbio.',
      attachmentIds: [UPLOAD_ID],
    });

    await user.click(screen.getByRole('button', { name: 'Copiar protocolo ASA-2026-000777' }));
    expect(await screen.findByText('Protocolo ASA-2026-000777 copiado.')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe('ASA-2026-000777');
    expect(screen.getByRole('link', { name: 'Acompanhar chamado' })).toHaveAttribute('href', '/aluno/chamados/ticket-new');
    expect(screen.getByRole('link', { name: 'Voltar aos chamados' })).toHaveAttribute('href', '/aluno/chamados');
  });

  it('?categoria= pré-seleciona a categoria (e ignora ids desconhecidos)', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    const first = renderRoutes(routes, { initialPath: '/aluno/chamados/novo?categoria=documents' });
    expect(await screen.findByRole('radio', { name: /Documentos/ })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /Tipo de solicitação/ })).toBeInTheDocument();
    first.unmount();

    renderRoutes(routes, { initialPath: '/aluno/chamados/novo?categoria=nao-existe' });
    await screen.findByRole('heading', { name: 'Sobre o que é a solicitação?' });
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  });

  it('erros de campo da API levam de volta à etapa certa', async () => {
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'POST /api/support/tickets': () => ({
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: [{ field: 'subject', message: 'Descreva o assunto em poucas palavras.' }] } as { code: string; message: string },
      }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/aluno/chamados/novo?categoria=other' });
    await screen.findByRole('heading', { name: 'Sobre o que é a solicitação?' });
    expect(screen.queryByRole('combobox', { name: /Tipo de solicitação/ })).toBeNull(); // categoria sem subcategorias
    await user.click(continueButton());
    await user.type(await screen.findByRole('textbox', { name: /Assunto/ }), 'Dúvida geral');
    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Gostaria de saber como funciona o atendimento.');
    await user.click(continueButton());
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Enviar chamado' }));
    expect(await screen.findByRole('heading', { name: 'Conte os detalhes' })).toBeInTheDocument();
    expect(screen.getByText('Descreva o assunto em poucas palavras.')).toBeInTheDocument();
    expect(screen.getByText('Revise as informações destacadas e envie de novo.')).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST' && call.path === '/api/support/tickets');
    expect(post?.body).not.toHaveProperty('subcategoryId');
    expect(post?.body).not.toHaveProperty('attachmentIds');
  });

  it('rascunho no estado da navegação (Assistente ASA) começa preenchido para revisão e nada é enviado sozinho', async () => {
    const { calls } = mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    const user = userEvent.setup();
    const draft = { ticketDraft: { categoryId: 'documents', subject: 'Histórico para intercâmbio', description: 'Preciso do histórico escolar assinado para o intercâmbio.', reason: 'Pedido de atendimento humano' } };
    renderRoutes([...routes, { path: '/inicio', element: <Navigate to="/aluno/chamados/novo" replace state={draft} /> }], { initialPath: '/inicio' });

    expect(await screen.findByText(/Rascunho preparado pelo Assistente ASA \(Pedido de atendimento humano\)/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Documentos/ })).toBeChecked();
    await user.selectOptions(screen.getByRole('combobox', { name: /Tipo de solicitação/ }), 'transcript');
    await user.click(continueButton());
    expect(await screen.findByRole('textbox', { name: /Assunto/ })).toHaveValue('Histórico para intercâmbio');
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Preciso do histórico escolar assinado para o intercâmbio.');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('estado de navegação inválido é ignorado e categoria desconhecida no rascunho não substitui ?categoria=', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    const invalid = renderRoutes([...routes, { path: '/inicio', element: <Navigate to="/aluno/chamados/novo" replace state={{ ticketDraft: { subject: 42 } }} /> }], { initialPath: '/inicio' });
    await screen.findByRole('heading', { name: 'Sobre o que é a solicitação?' });
    expect(screen.queryByText(/Rascunho preparado pelo Assistente ASA/)).toBeNull();
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    invalid.unmount();

    const draft = { ticketDraft: { categoryId: 'nao-existe', subject: 'Segunda via', description: 'Preciso da segunda via do boleto de outubro.', reason: null } };
    renderRoutes([...routes, { path: '/inicio', element: <Navigate to="/aluno/chamados/novo?categoria=financial" replace state={draft} /> }], { initialPath: '/inicio' });
    expect(await screen.findByText(/Rascunho preparado pelo Assistente ASA\. Revise/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Financeiro/ })).toBeChecked();
  });
});
