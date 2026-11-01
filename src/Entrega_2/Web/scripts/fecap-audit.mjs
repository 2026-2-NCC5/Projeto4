import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const origin = 'https://www.fecap.br';
const inventoryPath = resolve('data/fecap-page-inventory.json');
const reportPath = resolve('docs/fecap-page-inventory.md');
const checkpointPath = resolve('data/.fecap-audit-checkpoint.json');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const args = new Set(process.argv.slice(2));
const value = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
};
const normalize = (url) => {
  const u = new URL(url, origin);
  u.hash = '';
  if (u.hostname !== 'www.fecap.br' && u.hostname !== 'fecap.br') return null;
  u.hostname = 'www.fecap.br';
  return u.href;
};
const categoryFor = (path) => {
  const p = path.toLowerCase();
  if (/noticia|blog|na-midia/.test(p)) return 'Notícias';
  if (/evento/.test(p)) return 'Eventos';
  if (/colegio/.test(p)) return 'Colégio';
  if (/graduacao/.test(p)) return 'Graduação';
  if (/pos-graduacao/.test(p)) return 'Pós-Graduação';
  if (/mba/.test(p)) return 'MBA';
  if (/mestrado|pesquisa/.test(p)) return 'Mestrado e Pesquisa';
  if (/curta-duracao|extensao/.test(p)) return 'Extensão';
  if (/educacao-executiva|corporate/.test(p)) return 'Educação Executiva';
  if (/alumni/.test(p)) return 'Alumni';
  if (/asa|cesta-de-servicos/.test(p)) return 'ASA';
  return 'Institucional';
};
const templateFor = (url) => {
  const p = new URL(url).pathname.toLowerCase();
  if (p === '/') return 'HomePageTemplate';
  if (p.startsWith('/graduacao/') && p.slice(12).split('/').filter(Boolean).length > 0) return 'CourseDetailTemplate';
  if (p.includes('graduacao')) return 'CourseCatalogTemplate';
  if (p.includes('noticia') || p.includes('blog')) return 'NewsArticleTemplate';
  if (p.includes('evento')) return 'EventDetailTemplate';
  if (p.includes('cesta-de-servicos')) return 'ServiceDetailTemplate';
  if (p.includes('colegio')) return 'CollegePageTemplate';
  if (p.includes('pos-graduacao')) return 'PostgraduatePageTemplate';
  if (p.includes('mba')) return 'MbaPageTemplate';
  if (p.includes('mestrado')) return 'MastersPageTemplate';
  if (p.includes('curta-duracao')) return 'ExtensionCourseTemplate';
  if (p.includes('educacao-executiva')) return 'ExecutiveEducationTemplate';
  if (p.includes('alumni')) return 'AlumniPageTemplate';
  if (p.includes('asa')) return 'AsaPageTemplate';
  return 'InstitutionalPageTemplate';
};
const routeFor = (url) => {
  const path = new URL(url).pathname;
  if (path === '/asa/' || path.startsWith('/asa/')) return `/institucional${path}`;
  return path;
};
const emptyRecord = (url) => ({
  originalUrl: url,
  originalPath: new URL(url).pathname,
  canonicalUrl: null,
  title: null,
  category: categoryFor(new URL(url).pathname),
  pageType: 'sitemap-entry',
  template: templateFor(url),
  httpStatus: null,
  redirect: null,
  internalLinks: [],
  visualAssets: [],
  features: [],
  desktopScreenshot: null,
  mobileScreenshot: null,
  projectRoute: routeFor(url),
  implementationStatus: 'discovered',
  validationStatus: 'pending',
  issues: ['URL descoberta no sitemap; conteúdo e status HTTP ainda não validados.'],
});
async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Projeto4-FECAP-Audit/1.0 (public-page-inventory)' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}
async function loadInventory() {
  try { return JSON.parse(await readFile(inventoryPath, 'utf8')); } catch { return { source: origin, generatedAt: new Date().toISOString(), discovery: { robots: null, sitemapIndex: null, sitemapCount: 0, sitemapUrls: [], sourcePageCount: 0, checkedPageCount: 0 }, pages: [] }; }
}
async function saveInventory(doc) {
  doc.generatedAt = new Date().toISOString();
  await mkdir(dirname(inventoryPath), { recursive: true });
  await writeFile(inventoryPath, `${JSON.stringify(doc, null, 2)}\n`);
  const counts = doc.pages.reduce((out, p) => { out[p.implementationStatus] = (out[p.implementationStatus] ?? 0) + 1; return out; }, {});
  const cats = [...new Set(doc.pages.map((p) => p.category))].sort();
  const lines = [
    '# Inventário público do portal FECAP', '',
    `Atualizado: ${doc.generatedAt}`, '',
    `Fonte: [${origin}](${origin}) · [robots.txt](${origin}/robots.txt) · [sitemap index](${origin}/sitemap_index.xml).`, '',
    '## Descoberta', '',
    `- Sitemaps identificados: ${doc.discovery.sitemapCount}`,
    `- URLs únicas encontradas: ${doc.pages.length}`,
    `- Páginas com status HTTP validado: ${doc.discovery.checkedPageCount}`,
    `- Categorias: ${cats.join(', ')}`,
    `- Estado de implementação: ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('; ')}`, '',
    'O sitemap inclui tipos de conteúdo e registros customizados do CMS além de páginas de navegação. `implemented` indica que há uma rota/template local correspondente, não que o conteúdo esteja completo ou fiel. `classified` indica metadados lidos no navegador. Toda rota permanece pendente de validação de conteúdo e fidelidade; captura de referência vazia é registrada como bloqueada. A classificação do template é heurística. Sitemap não comprova página acessível nem permissão para reproduzir ativos.', '',
    '## Registro por URL', '',
    '| Caminho | Categoria | Template candidato | Rota Projeto4 | HTTP | Implementação | Validação |',
    '|---|---|---|---|---:|---|---|',
    ...doc.pages.map((p) => `| [${p.originalPath}](${p.originalUrl}) | ${p.category} | ${p.template} | ${p.projectRoute} | ${p.httpStatus ?? 'pendente'} | ${p.implementationStatus} | ${p.validationStatus} |`), '',
    '## Limites', '',
    '- Páginas de sistemas externos, áreas autenticadas e plataformas de terceiros não são clonadas.',
    '- Assets institucionais e conteúdo protegido precisam de autorização de uso antes de distribuição pública.',
    '- Esta lista é um inventário inicial de URLs publicadas nos sitemaps; ela não representa cobertura integral ou validação visual.', '',
  ];
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${lines.join('\n')}\n`);
}
async function discover() {
  const doc = await loadInventory();
  const robots = await fetchText(`${origin}/robots.txt`);
  const indexUrl = `${origin}/sitemap_index.xml`;
  const indexXml = await fetchText(indexUrl);
  const sitemapUrls = [...indexXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const pageUrls = new Set([`${origin}/`]);
  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    for (const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
      const url = normalize(match[1].trim());
      if (url && !/\.(pdf|jpg|jpeg|png|webp|svg|xml|zip|docx?|xlsx?|pptx?|mp4)(?:$|\?)/i.test(url)) pageUrls.add(url);
    }
    await sleep(80);
  }
  let browserMenuLinkCount = 0;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const links = await page.locator('header a[href], nav a[href]').evaluateAll((nodes) => nodes.map((node) => node.href));
    for (const href of links) { const url = normalize(href); if (url) pageUrls.add(url); }
    browserMenuLinkCount = links.length;
    await page.close();
  } catch (error) {
    console.warn(`Playwright não conseguiu ampliar a descoberta pela navegação: ${String(error).slice(0, 160)}`);
  } finally { await browser.close(); }
  const existing = new Map(doc.pages.map((page) => [page.originalUrl, page]));
  for (const url of pageUrls) if (!existing.has(url)) existing.set(url, emptyRecord(url));
  doc.discovery = { robots: `${origin}/robots.txt`, sitemapIndex: indexUrl, sitemapCount: sitemapUrls.length, sitemapUrls, browserMenuLinkCount, sourcePageCount: pageUrls.size, checkedPageCount: doc.discovery.checkedPageCount ?? 0, robotsExcerpt: robots.slice(0, 500) };
  doc.pages = [...existing.values()].sort((a, b) => a.originalPath.localeCompare(b.originalPath, 'pt-BR'));
  await saveInventory(doc);
  console.log(`Sitemaps: ${sitemapUrls.length}; URLs de páginas: ${pageUrls.size}; relatório: ${reportPath}`);
}
async function checkPages() {
  const doc = await loadInventory();
  const checkpoint = await readFile(checkpointPath, 'utf8').then(JSON.parse).catch(() => ({ cursor: 0 }));
  const take = Number(value('--max-pages', '100'));
  const end = Math.min(doc.pages.length, checkpoint.cursor + take);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ userAgent: 'Projeto4-FECAP-Audit/1.0 (public-page-inventory)' });
  for (let i = checkpoint.cursor; i < end; i += 1) {
    const record = doc.pages[i];
    const page = await context.newPage();
    try {
      const response = await page.goto(record.originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      record.httpStatus = response?.status() ?? null;
      record.redirect = page.url() !== record.originalUrl ? page.url() : null;
      record.canonicalUrl = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
      record.title = (await page.title()).trim();
      record.internalLinks = [...new Set(await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.href).filter((href) => new URL(href).hostname.endsWith('fecap.br'))))].slice(0, 60);
      record.visualAssets = [...new Set(await page.locator('img[src]').evaluateAll((imgs) => imgs.map((img) => img.currentSrc || img.src).slice(0, 30)))];
      record.pageType = 'public-html-page';
      record.implementationStatus = 'classified';
      record.issues = response?.ok() ? [] : [`HTTP ${record.httpStatus}`];
      if (i === 0) record.features = await page.locator('button, [role="tab"], details, form, [role="menu"]').evaluateAll((els) => els.map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `:${el.getAttribute('aria-label')}` : ''}`).slice(0, 30));
    } catch (error) {
      record.issues = [`Falha de navegação: ${String(error).slice(0, 180)}`];
      record.validationStatus = 'blocked';
    } finally { await page.close(); }
    if ((i + 1) % 10 === 0 || i === end - 1) {
      await writeFile(checkpointPath, JSON.stringify({ cursor: i + 1, updatedAt: new Date().toISOString() }));
      doc.discovery.checkedPageCount = i + 1;
      await saveInventory(doc);
      console.log(`Checadas ${i + 1}/${doc.pages.length} URLs`);
    }
    await sleep(Number(value('--delay-ms', '250')));
  }
  await context.close(); await browser.close();
}
async function capture() {
  const paths = (value('--paths', '/,/graduacao/,/asa/')).split(',');
  const output = resolve(value('--output', 'artifacts/fecap-reference'));
  const doc = await loadInventory();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const path of paths) {
    const safe = path.replace(/^\/+|\/+$/g, '').replaceAll('/', '-') || 'home';
    const url = new URL(path, origin).href;
    const record = doc.pages.find((item) => item.originalUrl === url);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(new URL(path, origin), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
      await page.waitForTimeout(1800);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (bodyText.trim().length < 30) {
        if (record) { record.validationStatus = 'blocked'; record.issues = [...new Set([...record.issues, 'Captura Playwright da referência retornou página vazia; comparação visual bloqueada.'])]; }
        console.warn(`Captura bloqueada ou vazia: ${url} (${name})`);
        await page.close();
        continue;
      }
      const file = resolve(output, safe, `${name}.png`);
      await mkdir(dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      if (record && name === 'desktop') record.desktopScreenshot = file;
      if (record && name === 'mobile') record.mobileScreenshot = file;
      await page.close();
    }
  }
  await browser.close();
  await saveInventory(doc);
}
if (args.has('--report-only')) await saveInventory(await loadInventory());
else if (args.has('--check-pages')) await checkPages();
else if (args.has('--screenshots')) await capture();
else await discover();
