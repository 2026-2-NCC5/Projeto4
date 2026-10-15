import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeArticle, makeDraftArticle, makeVersion } from '@/features/knowledge/testFixtures';
import { makeCatalog } from '@/features/support/staff/testFixtures';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { KnowledgeArticleInput, KnowledgeArticleUpdate } from '@/types/api';
import KnowledgeEditorPage from './KnowledgeEditorPage';

const staff = () => makeSession(makeMe('institutional_staff'));
const detail = () => <p>Página do artigo</p>;
const routes = [
  { path: '/asa/base-conhecimento/novo', element: <KnowledgeEditorPage /> },
  { path: '/asa/base-conhecimento/:id/editar', element: <KnowledgeEditorPage /> },
  { path: '/asa/base-conhecimento/:id', element: detail() },
  { path: '/asa/base-conhecimento', element: <p>Lista de artigos</p> },
  { path: '/admin/base-conhecimento/novo', element: <KnowledgeEditorPage /> },
  { path: '/admin/base-conhecimento/:id', element: detail() },
];

const field = (label: RegExp) => screen.getByLabelText(label);

async function fillRequired(title: string, summary: string, body: string) {
  await userEvent.type(field(/^Título/), title);
  await userEvent.type(field(/^Resumo/), summary);
  await userEvent.click(field(/^Texto do artigo/));
  await userEvent.paste(body);
}

describe('Editor da base de conhecimento', () => {
  it('criar: valida antes de enviar, mostra a prévia ao vivo e abre o rascunho criado', async () => {
    const created = makeDraftArticle({ id: 'kb-novo', currentVersion: 1 });
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'POST /api/knowledge-base/manage': () => ({ status: 201, data: created }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento/novo', session: staff() });
    await userEvent.click(await screen.findByRole('button', { name: 'Criar rascunho' }));
    expect(screen.getByText('Confira: Título, Resumo, Texto do artigo.')).toBeInTheDocument();
    expect(screen.getByText('Escreva um título com pelo menos 3 caracteres.')).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await fillRequired('Trancamento de matrícula', 'Como pedir o trancamento.', '## Antes\n\n- Abra um **chamado**.\n- Anexe o formulário.');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'academic');
    // prévia ao vivo com o mesmo leitor de Markdown do portal
    const preview = screen.getByRole('region', { name: 'Prévia para o aluno' });
    expect(within(preview).getByRole('heading', { name: 'Trancamento de matrícula' })).toBeInTheDocument();
    expect(within(preview).getByRole('heading', { name: 'Antes' })).toBeInTheDocument();
    expect(within(preview).getByText('chamado', { selector: 'strong' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/asa/base-conhecimento/kb-novo'));
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body as KnowledgeArticleInput).toEqual({
      title: 'Trancamento de matrícula',
      summary: 'Como pedir o trancamento.',
      body: '## Antes\n\n- Abra um **chamado**.\n- Anexe o formulário.',
      categoryId: 'academic',
      audience: 'student',
      sourceLabel: null,
      sourceUrl: null,
      changeNote: null,
      reviewDueAt: null,
    });
    expect(screen.getByText('Página do artigo')).toBeInTheDocument();
    expect(screen.getByText('Rascunho criado. Ele só chega aos alunos depois de publicado.')).toBeInTheDocument();
  });

  it('criar: endereço já usado (409 slug_taken) marca o campo do endereço', async () => {
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'POST /api/knowledge-base/manage': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Já existe um artigo com este endereço (slug).', reason: 'slug_taken' } }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento/novo', session: staff() });
    await screen.findByRole('button', { name: 'Criar rascunho' });
    await fillRequired('Boleto atrasado', 'Resumo curto.', 'Texto.');
    await userEvent.type(field(/^Endereço \(slug\)/), 'boleto');
    await userEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect(await screen.findByText('Já existe um artigo com este endereço. Escolha outro.')).toBeInTheDocument();
    expect(field(/^Endereço \(slug\)/)).toHaveAttribute('aria-invalid', 'true');
    expect(router.state.location.pathname).toBe('/asa/base-conhecimento/novo');
  });

  it('editar: 409 article_changed recarrega, explica e salva a versão da pessoa só com confirmação', async () => {
    const original = makeDraftArticle();
    const newer = makeDraftArticle({
      currentVersion: 3,
      current: makeVersion({ version: 3, title: 'Trancamento de matrícula', summary: 'Resumo de outra pessoa.', body: '- Passo novo.', createdBy: 'Outra Pessoa', changeNote: 'Prazo atualizado', createdAt: '2026-10-15T13:00:00.000Z' }),
    });
    const saved = makeDraftArticle({ currentVersion: 4, current: makeVersion({ version: 4, summary: 'Meu resumo.' }) });
    let stored = original;
    const puts: KnowledgeArticleUpdate[] = [];
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/knowledge-base/manage/kb-trancamento': () => ({ data: stored }),
      'PUT /api/knowledge-base/manage/kb-trancamento': ({ body }) => {
        const update = body as KnowledgeArticleUpdate;
        puts.push(update);
        if (update.expectedVersion !== stored.currentVersion) {
          return { status: 409, error: { code: 'CONFLICT', message: 'Outra pessoa salvou este artigo antes. Recarregue para ver a versão mais nova.', reason: 'article_changed' } };
        }
        stored = saved;
        return { data: saved };
      },
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento/editar', session: staff() });
    expect(await screen.findByText('Salvar cria a versão 3. O artigo continua como rascunho.')).toBeInTheDocument();
    // outra pessoa salva a versão 3 enquanto esta pessoa edita
    stored = newer;
    await userEvent.clear(field(/^Resumo/));
    await userEvent.type(field(/^Resumo/), 'Meu resumo.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));

    const banner = (await screen.findByText('Outra pessoa salvou este artigo enquanto você editava.')).closest('[role="alert"]');
    // o aviso fica no topo: recebe o foco para quem clicou em salvar no fim do formulário
    await waitFor(() => expect(banner).toHaveFocus());
    expect(await screen.findByText(/Agora ele está na versão 3, salva por Outra Pessoa em 15\/10\/2026 às 10:00 \("Prazo atualizado"\)\. Você começou a partir da versão 2\./)).toBeInTheDocument();
    // o texto da pessoa continua no editor e dá para comparar com a versão salva
    expect(field(/^Resumo/)).toHaveValue('Meu resumo.');
    const preview = screen.getByRole('region', { name: 'Prévia para o aluno' });
    await userEvent.click(within(preview).getByRole('radio', { name: 'Versão 3 salva' }));
    expect(preview).toHaveTextContent('Resumo de outra pessoa.');
    expect(puts.map((put) => put.expectedVersion)).toEqual([2]);

    // salvar pelo formulário continua bloqueado até a pessoa decidir no aviso
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
    expect(screen.getByText('Outra pessoa salvou uma versão mais nova. Use as opções do aviso acima para decidir.')).toBeInTheDocument();
    expect(puts).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar a minha como versão nova' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/asa/base-conhecimento/kb-trancamento'));
    expect(puts.map((put) => put.expectedVersion)).toEqual([2, 3]);
    expect(puts[1]).toMatchObject({ summary: 'Meu resumo.', title: 'Trancamento de matrícula' });
    expect(puts[1]).not.toHaveProperty('slug');
    expect(screen.getByText('Versão 4 salva.')).toBeInTheDocument();
  });

  it('editar: "descartar as minhas" carrega a versão mais nova no editor', async () => {
    const newer = makeDraftArticle({ currentVersion: 3, current: makeVersion({ version: 3, title: 'Trancamento de matrícula', summary: 'Resumo de outra pessoa.', createdBy: 'Outra Pessoa' }) });
    let stored = makeDraftArticle();
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/knowledge-base/manage/kb-trancamento': () => ({ data: stored }),
      'PUT /api/knowledge-base/manage/kb-trancamento': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Outra pessoa salvou este artigo antes.', reason: 'article_changed' } }),
    });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento/editar', session: staff() });
    await screen.findByRole('button', { name: 'Salvar nova versão' });
    stored = newer;
    await userEvent.type(field(/^Resumo/), ' Mais texto.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar as minhas e carregar a versão 3' }));
    expect(field(/^Resumo/)).toHaveValue('Resumo de outra pessoa.');
    expect(screen.queryByText('Outra pessoa salvou este artigo enquanto você editava.')).toBeNull();
    expect(screen.getByText('Salvar cria a versão 4. O artigo continua como rascunho.')).toBeInTheDocument();
  });

  it('editar artigo publicado explica que os alunos continuam vendo a versão publicada', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }), 'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: makeArticle() }) });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-boleto/editar', session: staff() });
    expect(await screen.findByText('Salvar cria a versão 2. Os alunos continuam vendo a versão 1 até você publicar de novo.')).toBeInTheDocument();
    // o endereço não muda depois de criado
    expect(screen.queryByLabelText(/^Endereço \(slug\)/)).toBeNull();
    // salvar sem mudar nada não cria versão idêntica
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
    expect(screen.getByText('Nada mudou desde a versão 1.')).toBeInTheDocument();
  });

  it('alterações não salvas pedem confirmação antes de sair', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }), 'GET /api/knowledge-base/manage/kb-trancamento': () => ({ data: makeDraftArticle() }) });
    const { router } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento/editar', session: staff() });
    await userEvent.type(await screen.findByLabelText(/^Resumo/), ' Ajuste.');
    await userEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sair sem salvar?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    expect(router.state.location.pathname).toBe('/asa/base-conhecimento/kb-trancamento/editar');
    expect(field(/^Resumo/)).toHaveValue('Como pedir o trancamento. Ajuste.');

    await userEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Sair sem salvar?' })).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/asa/base-conhecimento/kb-trancamento'));
  });

  it('artigo arquivado pede restauração antes de editar', async () => {
    mockApi({ 'GET /api/support/catalog': () => ({ data: makeCatalog() }), 'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: makeArticle({ status: 'archived' }) }) });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-boleto/editar', session: staff() });
    expect(await screen.findByText('Restaure o artigo como rascunho antes de editar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar nova versão' })).toBeNull();
  });

  it('sem permissão de escrita, o editor não abre', async () => {
    const { calls } = mockApi({});
    const me = makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => permission !== 'kb:write') });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/novo', session: makeSession(me) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
    expect(calls.filter((call) => call.path.startsWith('/api/knowledge-base'))).toHaveLength(0);
  });

  it('na Administração, criar leva ao artigo dentro de /admin', async () => {
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'POST /api/knowledge-base/manage': () => ({ status: 201, data: makeDraftArticle({ id: 'kb-admin' }) }),
    });
    const { router, container } = renderRoutes(routes, { initialPath: '/admin/base-conhecimento/novo', session: makeSession(makeMe('technical_admin')) });
    await screen.findByRole('button', { name: 'Criar rascunho' });
    expect(Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '').filter((href) => href.startsWith('/asa'))).toEqual([]);
    await fillRequired('Artigo da administração', 'Resumo.', 'Texto.');
    await userEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/base-conhecimento/kb-admin'));
  });
});
