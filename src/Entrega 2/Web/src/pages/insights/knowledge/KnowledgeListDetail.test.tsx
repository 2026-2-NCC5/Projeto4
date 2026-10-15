import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeArticle, makeDraftArticle, makeManageList, makeSummaryArticle, makeVersion } from '@/features/knowledge/testFixtures';
import { makeCatalog } from '@/features/support/staff/testFixtures';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { Permission } from '@/types/api';
import KnowledgeDetailPage from './KnowledgeDetailPage';
import KnowledgeListPage from './KnowledgeListPage';

const staff = (without: Permission[] = []) => makeSession(makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => !without.includes(permission)) }));
const admin = () => makeSession(makeMe('technical_admin'));
const routes = [
  { path: '/asa/base-conhecimento', element: <KnowledgeListPage /> },
  { path: '/asa/base-conhecimento/:id', element: <KnowledgeDetailPage /> },
  { path: '/admin/base-conhecimento', element: <KnowledgeListPage /> },
  { path: '/admin/base-conhecimento/:id', element: <KnowledgeDetailPage /> },
];
const paths = (calls: Array<{ path: string }>) => calls.map((call) => call.path);
const hrefsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '');

const published = makeSummaryArticle();
const draft = makeSummaryArticle({ id: 'kb-trancamento', slug: 'trancamento', title: 'Trancamento de matrícula', status: 'draft', publishedVersion: null, publishedAt: null, isDemo: false, currentVersion: 2 });

describe('Base de conhecimento — lista', () => {
  it('mostra situação e demonstração, e os filtros vão para a API e para a URL', async () => {
    const { calls } = mockApi({
      'GET /api/knowledge-base/manage': ({ url }) => ({ data: makeManageList(url.searchParams.get('status') === 'draft' ? [draft] : [published, draft]) }),
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento', session: staff() });
    const list = await screen.findByRole('list', { name: 'Artigos da base de conhecimento' });
    expect(paths(calls)).toContain('/api/knowledge-base/manage?page=1&pageSize=20');
    const row = within(list).getByRole('link', { name: /Como emitir a segunda via do boleto/ });
    expect(row).toHaveAttribute('href', '/asa/base-conhecimento/kb-boleto');
    expect(row).toHaveTextContent('Demonstração');
    expect(row).toHaveTextContent('Publicado');
    expect(within(list).getByRole('link', { name: /Trancamento de matrícula/ })).toHaveTextContent('Rascunho');

    await userEvent.click(screen.getByRole('radio', { name: /^Rascunho/ }));
    await waitFor(() => expect(paths(calls)).toContain('/api/knowledge-base/manage?page=1&pageSize=20&status=draft'));
    expect(router.state.location.search).toBe('?situacao=draft');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'financial');
    await waitFor(() => expect(paths(calls)).toContain('/api/knowledge-base/manage?page=1&pageSize=20&status=draft&category=financial'));

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar artigos' }), 'boleto');
    await waitFor(() => expect(paths(calls)).toContain('/api/knowledge-base/manage?page=1&pageSize=20&status=draft&search=boleto&category=financial'));
  });

  it('sem permissão de escrita não oferece "Novo artigo"', async () => {
    mockApi({ 'GET /api/knowledge-base/manage': () => ({ data: makeManageList([published]) }), 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento', session: staff(['kb:write']) });
    await screen.findByRole('list', { name: 'Artigos da base de conhecimento' });
    expect(screen.queryByRole('link', { name: 'Novo artigo' })).toBeNull();
  });

  it('banco ausente (503 database_required) explica a indisponibilidade', async () => {
    mockApi({
      'GET /api/knowledge-base/manage': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'A base de conhecimento exige o banco de dados PostgreSQL.', reason: 'database_required' } }),
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento', session: staff() });
    expect(await screen.findByText('Indisponível neste ambiente')).toBeInTheDocument();
  });

  it('na Administração, os links ficam em /admin', async () => {
    mockApi({ 'GET /api/knowledge-base/manage': () => ({ data: makeManageList([published, draft]) }), 'GET /api/support/catalog': () => ({ data: makeCatalog() }) });
    const { container } = renderRoutes(routes, { initialPath: '/admin/base-conhecimento', session: admin() });
    await screen.findByRole('list', { name: 'Artigos da base de conhecimento' });
    expect(screen.getByRole('link', { name: 'Novo artigo' })).toHaveAttribute('href', '/admin/base-conhecimento/novo');
    expect(screen.getByRole('link', { name: /Como emitir a segunda via do boleto/ })).toHaveAttribute('href', '/admin/base-conhecimento/kb-boleto');
    expect(hrefsOf(container).filter((href) => href.startsWith('/asa'))).toEqual([]);
  });
});

describe('Base de conhecimento — artigo', () => {
  it('mostra a prévia para o aluno, o endereço na Central de ajuda (sem link) e o histórico', async () => {
    mockApi({ 'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: makeArticle() }) });
    const { container } = renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-boleto', session: staff() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Como emitir a segunda via do boleto?' })).toBeInTheDocument();
    const preview = screen.getByRole('region', { name: 'Prévia para o aluno' });
    // Markdown restrito renderizado (título de seção e lista)
    expect(within(preview).getByRole('heading', { name: 'Passo a passo' })).toBeInTheDocument();
    expect(within(preview).getByText('Financeiro', { selector: 'strong' })).toBeInTheDocument();
    expect(within(preview).getByRole('link', { name: /Orientação do Financeiro/ })).toHaveAttribute('href', 'https://www.fecap.br/financeiro');
    // passo a passo como a Central de ajuda mostra
    await userEvent.click(within(preview).getByRole('radio', { name: 'Passo a passo' }));
    expect(within(within(preview).getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1Entre no portal.', '2Abra Financeiro.']);

    const address = screen.getByRole('region', { name: 'Para alunos' });
    expect(address).toHaveTextContent('/aluno/ajuda/segunda-via-boleto');
    // a equipe não abre a área do aluno: o endereço é para copiar, nunca um link
    expect(hrefsOf(container).filter((href) => href.startsWith('/aluno'))).toEqual([]);
    expect(within(screen.getByRole('region', { name: 'Histórico de versões' })).getByText(/Versão 1/)).toBeInTheDocument();
    expect(screen.getByText('Demonstração')).toBeInTheDocument();
  });

  it('publicação bloqueada pela política: botão desabilitado com o motivo do servidor', async () => {
    const blocked = makeDraftArticle({ canPublish: false, publishBlockedReason: 'A política exige que outra pessoa da equipe revise e publique.' });
    mockApi({ 'GET /api/knowledge-base/manage/kb-trancamento': () => ({ data: blocked }) });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento', session: staff() });
    const publish = await screen.findByRole('button', { name: 'Publicar' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(/A política exige que outra pessoa da equipe revise e publique/);
  });

  it('409 publish_blocked ao publicar: explica a política e recarrega o artigo', async () => {
    let reads = 0;
    const { calls } = mockApi({
      'GET /api/knowledge-base/manage/kb-trancamento': () => {
        reads += 1;
        return { data: reads === 1 ? makeDraftArticle() : makeDraftArticle({ canPublish: false, publishBlockedReason: 'A política exige que outra pessoa da equipe revise e publique.' }) };
      },
      'POST /api/knowledge-base/manage/kb-trancamento/publish': () => ({
        status: 409,
        error: { code: 'CONFLICT', message: 'A política exige que outra pessoa da equipe revise e publique.', reason: 'publish_blocked' },
      }),
    });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento', session: staff() });
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    const dialog = screen.getByRole('dialog', { name: 'Publicar a versão 2?' });
    expect(dialog).toHaveTextContent('Os alunos passam a ver esta versão na Central de ajuda');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Publicação bloqueada');
    expect(alert).toHaveTextContent('A política exige que outra pessoa da equipe revise e publique.');
    expect(alert).toHaveTextContent('peça a outra pessoa da equipe com permissão de publicação');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled());
    expect(reads).toBe(2);
  });

  it('enviar para revisão um artigo publicado com alterações explica que a versão publicada continua no ar', async () => {
    const pending = makeArticle({
      currentVersion: 2,
      publishedVersion: 1,
      hasUnpublishedChanges: true,
      current: makeVersion({ version: 2, summary: 'Novo resumo.' }),
      published: makeVersion(),
      canPublish: true,
      publishBlockedReason: null,
    });
    const { calls } = mockApi({
      'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: pending }),
      'POST /api/knowledge-base/manage/kb-boleto/submit': () => ({ data: { ...pending, status: 'in_review' } }),
    });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-boleto', session: staff() });
    // compara a versão atual com a publicada
    expect(await screen.findByRole('radio', { name: 'Publicada (v1)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar para revisão?' });
    expect(dialog).toHaveTextContent('A versão 1 publicada continua na Central de ajuda e no assistente enquanto as alterações estão em revisão');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar para revisão' }));
    expect(await screen.findByText('Artigo enviado para revisão.')).toBeInTheDocument();
    expect(paths(calls)).toContain('/api/knowledge-base/manage/kb-boleto/submit');
  });

  it('ações seguem as permissões da sessão (sem kb:publish: sem publicar nem arquivar)', async () => {
    mockApi({ 'GET /api/knowledge-base/manage/kb-trancamento': () => ({ data: makeDraftArticle() }) });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-trancamento', session: staff(['kb:publish']) });
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/asa/base-conhecimento/kb-trancamento/editar');
    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).toBeNull();
  });

  it('artigo arquivado só oferece restaurar como rascunho', async () => {
    const archived = makeArticle({ status: 'archived', canPublish: false, publishBlockedReason: 'Restaure o artigo antes de publicar.' });
    const { calls } = mockApi({
      'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: archived }),
      'POST /api/knowledge-base/manage/kb-boleto/restore': () => ({ data: { ...archived, status: 'draft', publishedVersion: null } }),
    });
    renderRoutes(routes, { initialPath: '/asa/base-conhecimento/kb-boleto', session: staff() });
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar como rascunho' }));
    expect(await screen.findByText('Artigo restaurado como rascunho.')).toBeInTheDocument();
    expect(paths(calls)).toContain('/api/knowledge-base/manage/kb-boleto/restore');
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeInTheDocument();
  });

  it('artigo inexistente (404) oferece voltar à lista da área', async () => {
    mockApi({});
    renderRoutes(routes, { initialPath: '/admin/base-conhecimento/kb-nada', session: admin() });
    expect(await screen.findByText('Artigo não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à base de conhecimento' })).toHaveAttribute('href', '/admin/base-conhecimento');
  });

  it('na Administração, nenhum link do artigo aponta para /asa', async () => {
    mockApi({ 'GET /api/knowledge-base/manage/kb-boleto': () => ({ data: makeArticle({ status: 'published', hasUnpublishedChanges: false }) }) });
    const { container } = renderRoutes(routes, { initialPath: '/admin/base-conhecimento/kb-boleto', session: admin() });
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/admin/base-conhecimento/kb-boleto/editar');
    expect(screen.getByRole('link', { name: 'Base de conhecimento' })).toHaveAttribute('href', '/admin/base-conhecimento');
    expect(hrefsOf(container).filter((href) => href.startsWith('/asa'))).toEqual([]);
  });
});
