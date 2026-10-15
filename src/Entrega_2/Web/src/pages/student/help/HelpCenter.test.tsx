import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCatalog } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { KnowledgeArticle, KnowledgeSearchHit, KnowledgeSearchResult } from '@/types/api';
import HelpArticlePage from './HelpArticlePage';
import HelpCenterPage from './HelpCenterPage';

const routes = [
  { path: '/aluno/ajuda', element: <HelpCenterPage /> },
  { path: '/aluno/ajuda/:id', element: <HelpArticlePage /> },
  { path: '/aluno/chamados/novo', element: <p>novo chamado</p> },
];

const PUBLISHED = '2026-10-15T05:22:42.675Z';

function hit(slug: string, categoryId: 'documents' | 'financial', title: string, summary: string, overrides: Partial<KnowledgeSearchHit> = {}): KnowledgeSearchHit {
  return {
    id: `kb-${slug}`,
    slug,
    title,
    summary,
    categoryId,
    categoryLabel: categoryId === 'documents' ? 'Documentos' : 'Financeiro',
    audience: 'student',
    version: 1,
    publishedAt: PUBLISHED,
    sourceLabel: 'Orientação de demonstração do ASA Conecta (validar com o ASA)',
    isDemo: true,
    excerpt: summary,
    score: 0,
    ...overrides,
  };
}

/** Ordem da API sem busca: título. */
const ALL = [
  hit('financial-bill-copy', 'financial', 'Como emitir a segunda via do boleto?', 'A segunda via fica disponível na área financeira do portal do aluno.'),
  hit('documents-transcript', 'documents', 'Como obter o histórico escolar?', 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.'),
  hit('documents-enrollment-certificate', 'documents', 'Como solicitar uma declaração de matrícula?', 'A declaração simples pode ser emitida no portal.'),
  hit('financial-payment-time', 'financial', 'Quanto tempo leva para um pagamento aparecer?', 'Pagamentos por boleto podem levar até 3 dias úteis.'),
];

const result = (items: KnowledgeSearchHit[]): KnowledgeSearchResult => ({ items, total: items.length, page: 1, pageSize: 20, mode: 'lexical' });

const ARTICLE: KnowledgeArticle = {
  ...hit('documents-transcript', 'documents', 'Como obter o histórico escolar?', 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.'),
  body: 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.\n\n## Passo a passo\n\n1. Abra um chamado em Documentos → Histórico escolar.\n2. Informe se precisa de versão **assinada**.',
  sourceUrl: null,
  updatedAt: '2026-10-15T13:10:00.000Z',
};

function knowledgeRoutes(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    'GET /api/knowledge-base': ({ url }) => {
      const search = url.searchParams.get('search');
      const category = url.searchParams.get('category');
      if (search) return { data: result(search === 'boleto' ? [{ ...ALL[3]!, excerpt: 'Pagamentos por boleto podem levar até 3 dias úteis…', score: 0.2 }, { ...ALL[0]!, score: 0.1 }] : []) };
      return { data: result(category ? ALL.filter((item) => item.categoryId === category) : ALL) };
    },
    'GET /api/knowledge-base/documents-transcript': () => ({ data: ARTICLE }),
    ...extra,
  });
}

describe('Central de ajuda (base de conhecimento)', () => {
  it('lista os artigos publicados por assunto, busca no servidor e filtra por assunto', async () => {
    const { calls } = knowledgeRoutes();
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/ajuda' });

    // grupos na ordem das categorias do catálogo (Documentos antes de Financeiro)
    expect(await screen.findByRole('heading', { level: 2, name: 'Documentos' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Documentos', 'Financeiro']);
    const documents = within(screen.getByRole('list', { name: 'Artigos de Documentos' })).getAllByRole('link');
    expect(documents).toHaveLength(2);
    expect(documents[0]).toHaveAttribute('href', '/aluno/ajuda/documents-transcript');
    expect(await screen.findByText('4 artigos em 2 assuntos')).toHaveAttribute('role', 'status');
    expect(screen.getByText(/Conteúdo de orientação de demonstração/)).toBeInTheDocument();
    expect(calls.find((call) => call.path.startsWith('/api/knowledge-base'))?.path).toBe('/api/knowledge-base');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }), 'boleto');
    await waitFor(() => expect(router.state.location.search).toBe('?q=boleto'));
    expect(await screen.findByText('2 artigos para “boleto”')).toBeInTheDocument();
    const results = within(screen.getByRole('list', { name: 'Resultados da busca' })).getAllByRole('link');
    expect(results[0]).toHaveTextContent('Quanto tempo leva para um pagamento aparecer?');
    expect(results[0]).toHaveTextContent('Pagamentos por boleto podem levar até 3 dias úteis…');
    expect(results[0]).toHaveTextContent('Financeiro');
    expect(calls.some((call) => call.path === '/api/knowledge-base?search=boleto')).toBe(true);

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }), 'transferência internacional');
    expect(await screen.findByText('Nenhum artigo encontrado para “transferência internacional”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver todos os artigos' }));
    expect(await screen.findByText('4 artigos em 2 assuntos')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Assunto' }), 'financial');
    expect(await screen.findByText('2 artigos em Financeiro')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Artigos de Financeiro' })).getAllByRole('link')).toHaveLength(2);
    expect(calls.some((call) => call.path === '/api/knowledge-base?category=financial')).toBe(true);
  });

  it('artigo: passo a passo, versão, última atualização, selo de demonstração, relacionados e chamado na mesma categoria', async () => {
    knowledgeRoutes();
    renderRoutes(routes, { initialPath: '/aluno/ajuda/documents-transcript' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Como obter o histórico escolar?' })).toBeInTheDocument();
    const content = screen.getByRole('region', { name: 'Conteúdo do artigo' });
    expect(within(content).getByRole('heading', { name: 'Passo a passo' })).toBeInTheDocument();
    const steps = within(content).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('1Abra um chamado em Documentos → Histórico escolar.');
    expect(within(steps[1]!).getByText('assinada').tagName).toBe('STRONG');
    // o resumo aparece uma vez (no topo), não repetido no corpo
    expect(screen.getAllByText('O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.')).toHaveLength(1);
    expect(within(content).getByText('Conteúdo de demonstração')).toBeInTheDocument();

    const about = screen.getByRole('region', { name: 'Sobre este artigo' });
    expect(about).toHaveTextContent('Versão 1 · 15/10/2026');
    expect(about).toHaveTextContent('Última atualização15/10/2026 às 10:10');
    expect(about).toHaveTextContent('Orientação de demonstração do ASA Conecta (validar com o ASA)');

    const related = await screen.findByRole('list', { name: 'Artigos relacionados' });
    expect(within(related).getAllByRole('link')).toHaveLength(1); // o próprio artigo fica de fora
    expect(within(related).getByRole('link')).toHaveAttribute('href', '/aluno/ajuda/documents-enrollment-certificate');
    expect(screen.getByRole('link', { name: 'Abrir chamado sobre isso' })).toHaveAttribute('href', '/aluno/chamados/novo?categoria=documents');
  });

  it('slug desconhecido mostra estado amigável; base desligada (403) é explicada', async () => {
    knowledgeRoutes({ 'GET /api/knowledge-base/nao-existe': () => ({ status: 404, error: { code: 'NOT_FOUND', message: 'Artigo não encontrado.' } }) });
    const first = renderRoutes(routes, { initialPath: '/aluno/ajuda/nao-existe' });
    expect(await screen.findByRole('heading', { name: 'Artigo não encontrado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à Central de ajuda' })).toHaveAttribute('href', '/aluno/ajuda');
    first.unmount();

    knowledgeRoutes({ 'GET /api/knowledge-base': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Este recurso está desativado neste ambiente.', reason: 'feature_disabled' } }) });
    renderRoutes(routes, { initialPath: '/aluno/ajuda' });
    expect(await screen.findByText('Central de ajuda desativada')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Abrir chamado' }).length).toBeGreaterThan(0);
  });
});
