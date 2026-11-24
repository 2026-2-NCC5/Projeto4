import type { BrainNote, BrainSection } from './vault.js';

/**
 * Leitura do site PÚBLICO da FECAP (www.fecap.br) para o cérebro do assistente.
 *
 * Só sitemaps oficiais e páginas públicas, uma por vez, com intervalo entre requisições; sem login, sem
 * seguir links fora de www.fecap.br e sem enviar dados. Ficam de fora o Colégio, perfis de docentes,
 * parceiros, imprensa, artigos de opinião, eventos de ex-alunos e a Cesta de Serviços do ASA (que já
 * está na base de conhecimento). Usado pelo job diário da API (`fecap-site-sync`, grava no banco) e por
 * `npm run brain:site` (grava as notas no vault do Obsidian).
 */
export const SITE_HOST = 'https://www.fecap.br';
export const SITE_USER_AGENT = 'Mozilla/5.0 (compatible; ASA-Conecta-KB-Import/1.0)';
export const SITE_FOLDER = 'Site da FECAP';

export type SiteFolder = 'Institucional' | 'Graduação' | 'Pós-graduação e cursos' | 'Organizações estudantis' | 'Biblioteca' | 'Notícias';

const SITEMAPS: Record<string, SiteFolder> = {
  'page-sitemap.xml': 'Institucional',
  'graduacao-sitemap.xml': 'Graduação',
  'processo-seletivo-sitemap.xml': 'Graduação',
  'bolsa-e-parcelamento-sitemap.xml': 'Graduação',
  'pos-graduacao-sitemap.xml': 'Pós-graduação e cursos',
  'mba-sitemap.xml': 'Pós-graduação e cursos',
  'mestrado-sitemap.xml': 'Pós-graduação e cursos',
  'curta-duracao-sitemap.xml': 'Pós-graduação e cursos',
  'org-estudantil-sitemap.xml': 'Organizações estudantis',
  'biblioteca-sanfona-sitemap.xml': 'Biblioteca',
  'biblioteca-conteudo-sitemap.xml': 'Biblioteca',
  'asa-pagina-sitemap.xml': 'Institucional',
};
const POST_SITEMAPS = ['post-sitemap.xml', 'post-sitemap2.xml', 'post-sitemap3.xml', 'post-sitemap4.xml'];

const FOLDER_TAGS: Record<SiteFolder, string> = {
  Institucional: 'institucional',
  'Graduação': 'graduacao',
  'Pós-graduação e cursos': 'pos-e-cursos',
  'Organizações estudantis': 'organizacoes-estudantis',
  Biblioteca: 'biblioteca',
  'Notícias': 'noticia',
};

/** Páginas que não ajudam o aluno (eventos antigos, colégio, formulários, imprensa, versões em inglês). */
const SKIP_URL = /encontro-|comemoracao|lancamento-do-clube|\/bgs-|tedx|no-access|fornecedores|imprensa|high-school|welcome-to-fecap|formulario-|locacoes|\/noticias\/$|colegio|\/ce-|hino-alvarista|termo-conformidade|study-abroad|international-office-pos|fecap-day|\/cesta-de-servicos\/|enade2025/;
/** Notícias: só avisos e oportunidades para estudantes da graduação e da pós. */
const POST_KEEP = /graduac|vestibular|enem|matricul|bolsa|calend|semestre|exame|prova|aulas|inscric|transfer|retorno-ao-curso|segunda-graduacao|ferias|feriado|recesso|biblioteca|estagio|carreira|oportunidad|\/asa|alunos?-|estudantes?-|prazo|fies|prouni|disciplina|intercambio|mestrado|mba|pos-graduacao|apoio-financeiro|empregabilidade|mentoria|monitoria|nivelamento|curta-duracao|international/;
const POST_SKIP = /colegio|cecon|roubo|furto|artigo-|boletim|reforma-tributaria|banco-|fgc|ensino-medio|escolas-parceiras/;

export interface SiteTarget {
  url: string;
  folder: SiteFolder;
  /** data da última alteração (sitemap) ou da publicação (notícias), AAAA-MM-DD */
  lastmod: string | null;
}

export interface SiteBlock {
  tag: string;
  text: string;
}

export interface SitePage {
  url: string;
  folder: SiteFolder;
  title: string;
  lastmod: string | null;
  blocks: SiteBlock[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª', deg: '°', copy: '©', reg: '®', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    const named = ENTITIES[code.toLowerCase()];
    if (named) return named;
    // acentos (&aacute; &ccedil; &atilde;…)
    const accent = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(code);
    if (accent) {
      const marks: Record<string, string> = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
      return `${accent[1]}${marks[accent[2]!.toLowerCase()]}`.normalize('NFC');
    }
    return match;
  });
}

const clean = (text: string): string => decodeEntities(text).replace(/[\u00a0\u200b]/g, ' ').replace(/\s+/g, ' ').trim();

export function parseSitemap(xml: string): Array<{ url: string; lastmod: string | null }> {
  const entries: Array<{ url: string; lastmod: string | null }> = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block[1]!);
    const mod = /<lastmod>([^<]+)<\/lastmod>/.exec(block[1]!);
    if (loc) entries.push({ url: decodeEntities(loc[1]!.trim()), lastmod: mod ? mod[1]!.slice(0, 10) : null });
  }
  return entries;
}

const key = (url: string): string => `${url.replace(/\/+$/, '')}/`;

/** Páginas a ler, em ordem estável; `curated` = URLs que já são fonte de uma nota escrita à mão. */
export function selectTargets(
  sitemaps: { pages: Record<string, Array<{ url: string; lastmod: string | null }>>; posts: Array<{ url: string; lastmod: string | null }> },
  options: { today: string; newsDays: number; curated: Set<string> },
): SiteTarget[] {
  const targets: SiteTarget[] = [];
  for (const [name, folder] of Object.entries(SITEMAPS)) {
    for (const entry of sitemaps.pages[name] ?? []) {
      if (entry.url.startsWith(SITE_HOST) && !SKIP_URL.test(entry.url)) targets.push({ url: entry.url, folder, lastmod: entry.lastmod });
    }
  }
  const cutoff = new Date(Date.parse(`${options.today}T00:00:00Z`) - options.newsDays * 86_400_000).toISOString().slice(0, 10);
  for (const entry of sitemaps.posts) {
    const published = /\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(entry.url);
    const day = published ? `${published[1]}-${published[2]}-${published[3]}` : entry.lastmod;
    if (day && day >= cutoff && POST_KEEP.test(entry.url) && !POST_SKIP.test(entry.url)) targets.push({ url: entry.url, folder: 'Notícias', lastmod: day });
  }
  const seen = new Set<string>();
  return targets.filter((target) => {
    const id = key(target.url);
    if (seen.has(id) || options.curated.has(id) || id === key(SITE_HOST)) return false;
    seen.add(id);
    return true;
  });
}

const BLOCK_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'td', 'th', 'blockquote', 'dt', 'dd', 'summary']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'form', 'nav', 'header', 'footer', 'aside', 'iframe', 'template', 'select', 'button']);
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track', 'base']);
const RAW_TEXT = new Set(['script', 'style']);

function attribute(attrs: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : '';
}

/** Blocos de texto do conteúdo (sem menu, cabeçalho, rodapé, formulários e popups do Elementor) e o título. */
export function parsePage(html: string): { title: string; blocks: SiteBlock[] } {
  const stack: Array<{ tag: string; skip: boolean }> = [];
  const blocks: SiteBlock[] = [];
  let current: string[] = [];
  let currentTag: string | null = null;
  let docTitle = '';
  let ogTitle = '';
  const skipping = (): boolean => stack.some((entry) => entry.skip);
  const flush = (): void => {
    if (currentTag) {
      const text = clean(current.join(''));
      if (text) blocks.push({ tag: currentTag, text });
    }
    current = [];
    currentTag = null;
  };
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const text = source.slice(cursor, match.index);
    cursor = tagPattern.lastIndex;
    if (text && currentTag && !skipping()) current.push(text);
    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    const attrs = match[3] ?? '';
    if (!closing && RAW_TEXT.has(tag)) {
      // conteúdo de script/style nunca é texto da página
      const end = source.toLowerCase().indexOf(`</${tag}`, cursor);
      cursor = end < 0 ? source.length : end;
      tagPattern.lastIndex = cursor;
      continue;
    }
    if (!closing && tag === 'title') {
      const end = source.toLowerCase().indexOf('</title', cursor);
      docTitle = clean(source.slice(cursor, end < 0 ? cursor : end));
      continue;
    }
    if (!closing && tag === 'meta' && attribute(attrs, 'property') === 'og:title') ogTitle = clean(attribute(attrs, 'content'));
    if (VOID_TAGS.has(tag)) {
      if (tag === 'br' && currentTag) current.push(' ');
      continue;
    }
    if (closing) {
      if (BLOCK_TAGS.has(tag) && currentTag === tag) flush();
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]!.tag === tag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue; // <tag />
    const kind = attribute(attrs, 'data-elementor-type');
    const classes = attribute(attrs, 'class');
    const skip = SKIP_TAGS.has(tag) || kind === 'header' || kind === 'footer' || kind === 'popup' || /elementor-location-(header|footer)|screen-reader-text/.test(classes);
    stack.push({ tag, skip });
    if (BLOCK_TAGS.has(tag) && !skipping()) {
      flush();
      currentTag = tag;
    }
  }
  flush();
  const h1 = blocks.find((block) => block.tag === 'h1' && block.text.length >= 3 && block.text.length <= 160)?.text;
  const fallback = (ogTitle || docTitle).replace(/\s*[-|–]\s*FECAP.*$/i, '').trim();
  return { title: h1 ?? fallback, blocks };
}

/** Texto que aparece em muitas páginas é moldura do site (menu, rodapé, banners), não conteúdo. */
export function boilerplateOf(pages: Array<{ blocks: SiteBlock[] }>): Set<string> {
  const frequency = new Map<string, number>();
  for (const page of pages) for (const text of new Set(page.blocks.map((block) => block.text))) frequency.set(text, (frequency.get(text) ?? 0) + 1);
  const threshold = Math.max(5, Math.floor(pages.length * 0.2));
  return new Set([...frequency].filter(([, count]) => count >= threshold).map(([text]) => text));
}

function slugTitle(url: string): string {
  const last = url.replace(/\/+$/, '').split('/').pop() ?? 'pagina';
  const words = last.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function slugAnchor(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const MIN_WORDS = 50;

/** Nota do cérebro (seções por subtítulo) a partir de uma página lida; null = sem conteúdo útil. */
export function siteNote(page: SitePage, boilerplate: Set<string>): BrainNote | null {
  const title = page.title || slugTitle(page.url);
  const sections: BrainSection[] = [];
  let heading = '';
  let lines: string[] = [];
  let words = 0;
  let last: string | null = null;
  const flush = (): void => {
    const text = lines.join('\n').trim();
    if (text) sections.push({ anchor: slugAnchor(heading), heading, text });
    lines = [];
  };
  for (const { tag, text } of page.blocks) {
    // depois das tags da notícia vêm só "posts relacionados" (outras notícias), que confundiriam a resposta
    if (/^#?TAGS:|^(leia também|posts relacionados|notícias relacionadas|veja também)/i.test(text)) break;
    if (boilerplate.has(text) || text === last || text === title || text.startsWith('©')) continue;
    last = text;
    if (tag === 'h1') continue;
    if (tag === 'h2' || tag === 'h3') {
      flush();
      heading = text;
      continue;
    }
    if (['h4', 'h5', 'summary', 'dt', 'th'].includes(tag)) {
      lines.push(text);
      continue;
    }
    lines.push(tag === 'li' ? `- ${text}` : text);
    words += text.split(/\s+/).length;
  }
  flush();
  if (words < MIN_WORDS || sections.length === 0) return null;
  return {
    id: `${SITE_FOLDER}/${page.folder}/${title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110)}`,
    title,
    aliases: [],
    tags: ['site-fecap', FOLDER_TAGS[page.folder]],
    sourceLabel: `Site da FECAP — ${title}`,
    sourceUrl: page.url,
    updated: page.lastmod,
    generated: true,
    links: [],
    sections,
  };
}

/** Markdown do Obsidian para a nota gerada (mesmo formato das notas curadas). */
export function siteNoteMarkdown(note: BrainNote): string {
  const front = [
    '---',
    `title: ${note.title}`,
    `tags: [${note.tags.join(', ')}]`,
    `source_label: ${note.sourceLabel ?? ''}`,
    `source_url: ${note.sourceUrl ?? ''}`,
    `updated: ${note.updated ?? ''}`,
    'generated: true',
    '---',
    `# ${note.title}`,
    '',
    '%% Nota gerada por `npm run brain:site` (e atualizada todo dia pela API) — edições à mão aqui se perdem. %%',
    '',
  ];
  const body = note.sections.map((section) => (section.heading ? `## ${section.heading}\n\n${section.text}` : section.text)).join('\n\n');
  return `${front.join('\n')}${body}\n`;
}

export type Fetcher = (url: string) => Promise<string>;

export function siteFetcher(fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Fetcher {
  return async (url: string) => {
    if (!url.startsWith(`${SITE_HOST}/`)) throw new Error('fora de www.fecap.br');
    const response = await fetchImpl(url, { headers: { 'user-agent': SITE_USER_AGENT, 'accept-language': 'pt-BR' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  };
}

/** Lê os sitemaps oficiais e devolve as páginas a manter no cérebro. */
export async function discoverTargets(fetchText: Fetcher, options: { today: string; newsDays: number; curated: Set<string>; delayMs: number }): Promise<SiteTarget[]> {
  const pages: Record<string, Array<{ url: string; lastmod: string | null }>> = {};
  for (const name of Object.keys(SITEMAPS)) {
    pages[name] = parseSitemap(await fetchText(`${SITE_HOST}/${name}`));
    await pause(options.delayMs);
  }
  const posts: Array<{ url: string; lastmod: string | null }> = [];
  for (const name of POST_SITEMAPS) {
    posts.push(...parseSitemap(await fetchText(`${SITE_HOST}/${name}`)));
    await pause(options.delayMs);
  }
  return selectTargets({ pages, posts }, options);
}

export const pause = (ms: number): Promise<void> => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** URLs que já são fonte de uma nota curada (essas páginas não viram nota gerada). */
export function curatedSources(notes: BrainNote[]): Set<string> {
  return new Set(notes.filter((note) => !note.generated && note.sourceUrl).map((note) => key(note.sourceUrl!)));
}

export const siteKey = key;
