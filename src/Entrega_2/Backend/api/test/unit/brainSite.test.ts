import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { MemorySitePageStore, runSiteSync } from '../../src/brain/siteStore.js';
import { boilerplateOf, decodeEntities, parsePage, selectTargets, siteFetcher, siteNote, type Fetcher } from '../../src/brain/siteSync.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const FRAME = `<header data-elementor-type="header"><nav><a>Graduação</a></nav><p>Menu do site</p></header>`;
const FOOTER = `<footer><p>© Fundação Escola de Comércio Álvares Penteado</p></footer>`;
const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title} - FECAP</title><meta property="og:title" content="${title} - FECAP"><script>var x = "<p>não é texto</p>";</script></head><body>${FRAME}<main><h1>${title}</h1>${body}</main>${FOOTER}</body></html>`;
const words = (n: number, word = 'conteúdo') => Array.from({ length: n }, () => word).join(' ');

const sitemap = (urls: Array<[string, string]>) => `<?xml version="1.0"?><urlset>${urls.map(([url, mod]) => `<url><loc>${url}</loc><lastmod>${mod}T10:00:00+00:00</lastmod></url>`).join('')}</urlset>`;

function fakeSite(overrides: Record<string, string> = {}): { fetchText: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const pages: Record<string, string> = {
    'https://www.fecap.br/page-sitemap.xml': sitemap([['https://www.fecap.br/biblioteca/', '2026-11-01'], ['https://www.fecap.br/encontro-turma-de-1975/', '2020-01-01']]),
    'https://www.fecap.br/post-sitemap.xml': sitemap([
      ['https://www.fecap.br/2026/06/08/fecap-divulga-cronograma-de-encerramento-do-semestre-26-1/', '2026-06-08'],
      ['https://www.fecap.br/2026/06/01/roubo-de-cargas-em-sp/', '2026-06-01'],
      ['https://www.fecap.br/2024/01/10/vestibular-2024/', '2024-01-10'],
    ]),
    'https://www.fecap.br/biblioteca/': page('Biblioteca', `<h2>Horário da Biblioteca</h2><p>Segunda a sexta, das 7h30 às 21h50. ${words(60)}</p>`),
    'https://www.fecap.br/2026/06/08/fecap-divulga-cronograma-de-encerramento-do-semestre-26-1/': page('Cronograma de encerramento do semestre 26.1', `<p>O Exame custa R$ 70,00 por disciplina. ${words(60)}</p><p>#TAGS: ASA</p><p>Outra notícia relacionada</p>`),
    ...overrides,
  };
  return {
    calls,
    fetchText: async (url) => {
      calls.push(url);
      const body = pages[url];
      if (body !== undefined) return body;
      if (url.endsWith('-sitemap.xml') || /post-sitemap\d\.xml$/.test(url)) return sitemap([]);
      throw new Error('HTTP 404');
    },
  };
}

const NOW = () => new Date('2026-11-24T12:00:00Z');
const OPTIONS = { curated: new Set<string>(), now: NOW, maxPages: 50, budgetMs: 60_000, delayMs: 0, newsDays: 365, refreshDays: 30 };

describe('cérebro: sincronização com o site da FECAP', () => {
  it('extrai só o conteúdo: sem menu, rodapé, scripts; decodifica entidades', () => {
    const parsed = parsePage(page('Biblioteca &amp; Acervo', '<h2>Hor&aacute;rio</h2><p>Das 7h30&nbsp;às 21h50</p>'));
    expect(parsed.title).toBe('Biblioteca & Acervo');
    expect(parsed.blocks.map((block) => block.text)).toEqual(['Biblioteca & Acervo', 'Horário', 'Das 7h30 às 21h50']);
    expect(decodeEntities('&#233;&#x00e7;&ccedil;')).toBe('éçç');
  });

  it('seleciona páginas úteis: descarta eventos antigos, Colégio/opinião e notícias de mais de um ano', () => {
    const targets = selectTargets(
      {
        pages: { 'page-sitemap.xml': [{ url: 'https://www.fecap.br/biblioteca/', lastmod: null }, { url: 'https://www.fecap.br/encontro-turma-1975/', lastmod: null }, { url: 'https://www.fecap.br/fale-conosco/', lastmod: null }] },
        posts: [
          { url: 'https://www.fecap.br/2026/06/08/cronograma-do-semestre/', lastmod: null },
          { url: 'https://www.fecap.br/2026/06/08/alunos-do-colegio-fecap-visitam/', lastmod: null },
          { url: 'https://www.fecap.br/2024/06/08/cronograma-do-semestre/', lastmod: null },
        ],
      },
      { today: '2026-11-24', newsDays: 365, curated: new Set(['https://www.fecap.br/fale-conosco/']) },
    );
    expect(targets.map((target) => [target.url, target.folder, target.lastmod])).toEqual([
      ['https://www.fecap.br/biblioteca/', 'Institucional', null],
      ['https://www.fecap.br/2026/06/08/cronograma-do-semestre/', 'Notícias', '2026-06-08'],
    ]);
  });

  it('nota gerada: sem moldura repetida e sem "posts relacionados"; página curta não vira nota', () => {
    const pages = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ url: `https://www.fecap.br/${id}/`, folder: 'Institucional' as const, title: id, lastmod: null, blocks: [{ tag: 'p', text: 'Matricule-se já' }, { tag: 'p', text: words(60, id) }] }));
    const boilerplate = boilerplateOf(pages);
    expect(boilerplate.has('Matricule-se já')).toBe(true);
    expect(siteNote(pages[0]!, boilerplate)?.sections[0]?.text).not.toContain('Matricule-se');
    expect(siteNote({ ...pages[0]!, blocks: [{ tag: 'p', text: 'curto' }] }, boilerplate)).toBeNull();
    const news = siteNote({ url: 'https://www.fecap.br/n/', folder: 'Notícias', title: 'N', lastmod: '2026-06-08', blocks: [{ tag: 'p', text: words(60) }, { tag: 'p', text: '#TAGS: ASA' }, { tag: 'p', text: 'Outra notícia' }] }, new Set());
    expect(news?.sections.map((section) => section.text).join(' ')).not.toContain('Outra notícia');
    expect(news).toMatchObject({ generated: true, updated: '2026-06-08', tags: ['site-fecap', 'noticia'] });
  });

  it('job: lê o que é novo, marca o que saiu, relê só o que mudou e conta falhas', async () => {
    const store = new MemorySitePageStore();
    await store.save({ url: 'https://www.fecap.br/pagina-removida/', folder: 'Institucional', title: 'Removida', lastmod: null, blocks: [] }, NOW());
    const site = fakeSite();
    const first = await runSiteSync(store, { ...OPTIONS, fetchText: site.fetchText });
    expect(first).toMatchObject({ targets: 2, fetched: 2, failed: 0, gone: 1, pending: 0 });
    expect((await store.listActive()).map((saved) => saved.url).sort()).toEqual(['https://www.fecap.br/2026/06/08/fecap-divulga-cronograma-de-encerramento-do-semestre-26-1/', 'https://www.fecap.br/biblioteca/']);

    const again = fakeSite();
    const second = await runSiteSync(store, { ...OPTIONS, fetchText: again.fetchText });
    expect(second).toMatchObject({ fetched: 0, unchanged: true });
    expect(again.calls.filter((url) => !url.endsWith('.xml'))).toEqual([]);

    const changed = fakeSite({ 'https://www.fecap.br/page-sitemap.xml': sitemap([['https://www.fecap.br/biblioteca/', '2026-11-20']]), 'https://www.fecap.br/biblioteca/': 'erro' });
    const third = await runSiteSync(store, { ...OPTIONS, fetchText: async (url) => (url === 'https://www.fecap.br/biblioteca/' ? Promise.reject(new Error('HTTP 500')) : changed.fetchText(url)) });
    expect(third).toMatchObject({ fetched: 0, failed: 1 });
    // falha mantém o conteúdo anterior no cérebro
    expect((await store.listActive()).some((saved) => saved.url === 'https://www.fecap.br/biblioteca/')).toBe(true);
  });

  it('limite por execução deixa o resto pendente para o próximo dia', async () => {
    const result = await runSiteSync(new MemorySitePageStore(), { ...OPTIONS, maxPages: 1, fetchText: fakeSite().fetchText });
    expect(result).toMatchObject({ fetched: 1, pending: 1 });
  });

  it('leitor só aceita www.fecap.br', async () => {
    await expect(siteFetcher(async () => new Response('x'))('https://evil.example/')).rejects.toThrow('fora de www.fecap.br');
  });

  it('rota do job atualiza o cérebro sem deploy e o painel mostra as páginas', async () => {
    const store = new MemorySitePageStore();
    const base = buildTestConfig();
    const { app } = createTestApp({ now: NOW, brainSite: { store, fetchText: fakeSite().fetchText }, configOverrides: { jobs: { cronSecret: 'cron-secret-de-teste-123' }, brain: base.brain } });
    expect((await request(app).get('/api/internal/jobs/fecap-site-sync')).status).toBe(401);
    const run = await request(app).get('/api/internal/jobs/fecap-site-sync').set('authorization', 'Bearer cron-secret-de-teste-123');
    expect(run.status).toBe(200);
    expect(run.body.data).toMatchObject({ job: 'fecap-site-sync', fetched: 2 });
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const overview = await request(app).get('/api/assistant-brain').set(bearer(staff.accessToken));
    expect(overview.body.data.brain.site).toMatchObject({ pages: 2, lastFetchedAt: '2026-11-24T12:00:00.000Z' });
  });
});
