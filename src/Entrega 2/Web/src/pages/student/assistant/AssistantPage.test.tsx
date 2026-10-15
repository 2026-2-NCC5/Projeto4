import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlatformInfo } from '@/features/academic/testing/fixtures';
import { makeAssistantResponse } from '@/features/assistant/testing/fixtures';
import { makeCatalog } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { AssistantResponse, SupportCatalog } from '@/types/api';
import NewTicketPage from '../tickets/NewTicketPage';
import AssistantPage from './AssistantPage';

const routes = [
  { path: '/aluno/assistente', element: <AssistantPage /> },
  { path: '/aluno/chamados/novo', element: <NewTicketPage /> },
  { path: '/aluno/ajuda/:id', element: <p>artigo da ajuda</p> },
  { path: '/aluno/pendencias', element: <p>página de pendências</p> },
];

const KB_ANSWER = makeAssistantResponse({
  intent: 'knowledge_question',
  intentConfidence: 0.3,
  display: {
    title: 'Como emitir a segunda via do boleto?',
    message: 'A segunda via fica disponível na área financeira do portal do aluno.',
    items: [{ id: 'kb-step-1', title: 'Passo 1', description: 'Entre no portal do aluno.', meta: null, badge: null, tone: 'neutral', subjectId: null }],
    recommendations: [],
  },
  nextActions: [{ type: 'ask', label: 'Quero falar com o ASA', text: 'Quero falar com alguém do ASA' }],
  context: { lastIntent: 'knowledge_question' },
  sources: [
    {
      type: 'knowledge_article',
      articleId: 'kb-financial-bill-copy',
      slug: 'financial-bill-copy',
      title: 'Como emitir a segunda via do boleto?',
      version: 1,
      publishedAt: '2026-10-15T05:22:42.675Z',
      sourceLabel: 'Orientação de demonstração do ASA Conecta (validar com o ASA)',
      sourceUrl: null,
    },
  ],
});

const HUMAN_HELP = makeAssistantResponse({
  intent: 'request_human_help',
  display: { title: 'Com quem falar', message: 'Procure a coordenação do seu curso ou a equipe do ASA.', items: [], recommendations: [] },
  nextActions: [],
  context: { lastIntent: 'request_human_help' },
  handoff: { categoryId: 'asa_service', subject: 'Orientação solicitada pelo Assistente ASA', description: 'Quero falar com alguém do ASA sobre trancamento.', reason: 'Pedido de atendimento humano' },
});

function catalogWithAsa(): SupportCatalog {
  const base = makeCatalog();
  return {
    ...base,
    categories: [
      ...base.categories,
      { id: 'asa_service', label: 'Atendimento ASA', description: 'Orientação acadêmica, apoio ao estudante e agendamentos com o ASA.', subcategories: [{ id: 'guidance', label: 'Orientação acadêmica' }], slaBusinessDays: 2, defaultTeam: 'Atendimento ASA' },
    ],
  };
}

function assistantRoutes(answer: (text: string) => { status?: number; data?: AssistantResponse; error?: { code: string; message: string; reason?: string } }, platform = makePlatformInfo()) {
  return mockApi({
    'GET /api/platform/info': () => ({ data: platform }),
    'GET /api/support/catalog': () => ({ data: catalogWithAsa() }),
    'POST /api/assistant/message': ({ body }) => answer((body as { text: string }).text),
  });
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  const field = await screen.findByRole('textbox', { name: 'Sua pergunta' });
  await user.type(field, text);
  await user.keyboard('{Enter}');
}

describe('Assistente ASA (texto)', () => {
  it('responde com itens, fontes como links da Central de ajuda e o provedor; reenvia só o contexto da API e não usa localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { calls } = assistantRoutes((text) => ({ data: text.includes('boleto') ? KB_ANSWER : makeAssistantResponse() }));
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/assistente' });

    expect(await screen.findByText(/Esta conversa fica apenas na memória desta aba/)).toBeInTheDocument();
    expect(await screen.findByText('Como responde: Regras do ASA Conecta e base de conhecimento (sem LLM).')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Sugestões de perguntas' })).toBeInTheDocument();

    await ask(user, 'Tenho atividade pendente?');
    const log = screen.getByRole('log', { name: 'Conversa com o Assistente ASA' });
    const first = await within(log).findByRole('article', { name: 'Resposta do Assistente ASA' });
    expect(within(first).getByRole('heading', { name: 'Atividades pendentes' })).toBeInTheDocument();
    expect(within(first).getByText('Atenção')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Ver disciplina' })).toHaveAttribute('href', '/aluno/academico?disciplina=subject-db');
    expect(within(first).getByRole('link', { name: 'Ver pendências' })).toHaveAttribute('href', '/aluno/pendencias');
    expect(within(first).getByText('Respondido por: Regras do ASA Conecta e base de conhecimento (sem LLM)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveValue('');

    await ask(user, 'Como emitir a segunda via do boleto?');
    await waitFor(() => expect(within(log).getAllByRole('article')).toHaveLength(2));
    const second = within(log).getAllByRole('article')[1]!;
    const sources = within(second).getByRole('region', { name: 'Fonte' });
    expect(within(sources).getByRole('link', { name: 'Como emitir a segunda via do boleto?' })).toHaveAttribute('href', '/aluno/ajuda/financial-bill-copy');
    expect(sources).toHaveTextContent('Versão 1 · publicada em 15/10/2026 · Orientação de demonstração do ASA Conecta (validar com o ASA)');

    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/api/assistant/message');
    expect(posts[0]!.body).toEqual({ inputType: 'text', text: 'Tenho atividade pendente?', currentScreen: 'assistant' });
    expect(posts[1]!.body).toEqual({ inputType: 'text', text: 'Como emitir a segunda via do boleto?', currentScreen: 'assistant', conversationContext: { lastIntent: 'get_pending_items' } });

    // navegar para outra página e voltar mantém a conversa (só em memória)
    await user.click(within(first).getByRole('link', { name: 'Ver pendências' }));
    expect(await screen.findByText('página de pendências')).toBeInTheDocument();
    await router.navigate(-1);
    expect(await screen.findAllByRole('article', { name: 'Resposta do Assistente ASA' })).toHaveLength(2);
    expect(setItem).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Nova conversa' }));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Sugestões de perguntas' })).toBeInTheDocument();
  });

  it('encaminhamento: "Abrir chamado com este resumo" leva ao formulário já preenchido, sem enviar nada', async () => {
    const { calls } = assistantRoutes(() => ({ data: HUMAN_HELP }));
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/assistente' });

    await ask(user, 'Quero falar com alguém do ASA sobre trancamento.');
    const answer = await screen.findByRole('article', { name: 'Resposta do Assistente ASA' });
    expect(within(answer).getByText('Quer falar com a equipe do ASA?')).toBeInTheDocument();
    expect(within(answer).getByText('Pedido de atendimento humano')).toBeInTheDocument();
    await user.click(within(answer).getByRole('link', { name: 'Abrir chamado com este resumo' }));

    expect(router.state.location.pathname).toBe('/aluno/chamados/novo');
    expect(await screen.findByText(/Rascunho preparado pelo Assistente ASA \(Pedido de atendimento humano\)/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Atendimento ASA/ })).toBeChecked();
    await user.selectOptions(screen.getByRole('combobox', { name: /Tipo de solicitação/ }), 'guidance');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('textbox', { name: /Assunto/ })).toHaveValue('Orientação solicitada pelo Assistente ASA');
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Quero falar com alguém do ASA sobre trancamento.');
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/support/tickets')).toBe(false);
  });

  it('sem resposta confiável: diz "não encontrei uma resposta confiável" e oferece o chamado', async () => {
    const abstainedWithHandoff = makeAssistantResponse({
      intent: 'unknown',
      status: 'abstained',
      abstained: true,
      abstentionReason: 'low_confidence',
      display: { title: 'Não encontrei uma resposta confiável', message: 'Não encontrei esse assunto nos artigos publicados do ASA.', items: [], recommendations: [] },
      nextActions: [],
      handoff: { categoryId: 'asa_service', subject: 'Como trancar o curso?', description: 'Como trancar o curso?', reason: 'Pergunta sem resposta nos artigos publicados' },
    });
    const predict = makeAssistantResponse({
      intent: 'predict_outcome',
      status: 'abstained',
      abstained: true,
      abstentionReason: 'Não tenho informações suficientes para afirmar isso.',
      display: { title: 'Sem conclusão confiável', message: 'Não tenho informações suficientes para afirmar isso.', items: [], recommendations: [] },
      nextActions: [],
    });
    assistantRoutes((text) => ({ data: text.startsWith('Como trancar') ? abstainedWithHandoff : predict }));
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/aluno/assistente' });

    await ask(user, 'Como trancar o curso?');
    const first = await screen.findByRole('article', { name: 'Resposta do Assistente ASA' });
    expect(within(first).getByText('Sem resposta confiável')).toBeInTheDocument();
    expect(within(first).getAllByText('Não encontrei uma resposta confiável')).toHaveLength(1); // título da API, sem repetir
    expect(within(first).getByRole('link', { name: 'Abrir chamado com este resumo' })).toHaveAttribute('href', '/aluno/chamados/novo');

    await ask(user, 'Vou passar em Banco de Dados?');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const second = screen.getAllByRole('article')[1]!;
    expect(within(second).getByText('Não encontrei uma resposta confiável')).toBeInTheDocument();
    expect(within(second).getByRole('link', { name: 'Abrir chamado com esta pergunta' })).toHaveAttribute('href', '/aluno/chamados/novo');
  });

  it('pedido de navegação ("abra minhas notas") vira link do portal, sem navegar sozinho', async () => {
    assistantRoutes(() => ({
      data: makeAssistantResponse({
        intent: 'open_screen',
        display: { title: 'Abrindo', message: 'Claro. Abrindo suas avaliações e notas.', items: [], recommendations: [] },
        nextActions: [],
        navigation: { target: 'academic.assessments' },
      }),
    }));
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/assistente' });
    await ask(user, 'abra minhas notas');
    const answer = await screen.findByRole('article', { name: 'Resposta do Assistente ASA' });
    expect(within(answer).getByRole('link', { name: 'Ir para Avaliações e notas' })).toHaveAttribute('href', '/aluno/academico?aba=avaliacoes');
    expect(router.state.location.pathname).toBe('/aluno/assistente');
  });

  it('assistente desligado (plataforma ou 404) e serviço indisponível (503) com nova tentativa', async () => {
    assistantRoutes(() => ({ data: makeAssistantResponse() }), makePlatformInfo({ features: { ...makePlatformInfo().features, assistant: false } }));
    const off = renderRoutes(routes, { initialPath: '/aluno/assistente' });
    expect(await screen.findByText('Assistente desativado')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Sua pergunta' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Central de ajuda' })).toHaveAttribute('href', '/aluno/ajuda');
    off.unmount();

    assistantRoutes(() => ({ status: 404, error: { code: 'NOT_FOUND', message: 'O assistente conversacional está desabilitado neste ambiente.' } }));
    const user = userEvent.setup();
    const notFound = renderRoutes(routes, { initialPath: '/aluno/assistente' });
    await ask(user, 'Tenho atividade pendente?');
    expect(await screen.findByText('Assistente desativado')).toBeInTheDocument();
    notFound.unmount();

    let attempts = 0;
    assistantRoutes(() => {
      attempts += 1;
      return attempts === 1 ? { status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Não foi possível concluir a análise. Tente novamente.' } } : { data: makeAssistantResponse() };
    });
    renderRoutes(routes, { initialPath: '/aluno/assistente' });
    await ask(user, 'Analise minha situação acadêmica');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Um serviço que o assistente usa está indisponível agora. Não foi possível concluir a análise. Tente novamente.');
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('article', { name: 'Resposta do Assistente ASA' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(attempts).toBe(2);
  });
});
