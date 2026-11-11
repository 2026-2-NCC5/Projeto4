import { searchDocument, slugify, stripMarkdown } from './text.js';

/**
 * Conteúdo OFICIAL da base de conhecimento: a "Cesta de Serviços" pública do ASA (fecap.br), coletada por
 * `Backend/scripts/fetch_asa_cesta_servicos.py`. Cada serviço vira um artigo publicado (is_demo = false) com a
 * página original como fonte. Nada aqui é inventado: título, texto, condições, setor, local, horário e canais
 * vêm do retrato salvo em database/content/asa_cesta_de_servicos.json.
 */

export interface OfficialSnapshot {
  source: string;
  fetchedAt: string;
  audience: string;
  about?: { url: string; paragraphs: string[] };
  services: OfficialService[];
}

export interface OfficialService {
  slug: string;
  url: string;
  title: string;
  category: { slug: string | null; label: string | null };
  blocks: Array<{ tag: string; text: string }>;
  conditions: string[];
  sector: string | null;
  location: string | null;
  hours: string | null;
  channels: { phones: string[]; emails: string[]; whatsapp: string[] };
}

export interface OfficialArticle {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  changeNote: string;
  searchDocument: string;
  publishedAt: Date;
  reviewDueAt: string;
}

export const OFFICIAL_SOURCE_LABEL = 'ASA — Cesta de Serviços (fecap.br)';
/** A equipe do ASA revisa o conteúdo importado periodicamente (o painel mostra a data de revisão). */
const REVIEW_AFTER_DAYS = 180;

const CATEGORY_BY_SECTION: Record<string, string> = {
  'documentos-academicos': 'documents',
  'documentos-financeiros': 'financial',
  'servicos-financeiros': 'financial',
  'bolsas-e-financiamentos': 'scholarships',
  'servicos-academicos': 'academic',
  aprendizagem: 'academic',
  'plataformas-digitais': 'systems_access',
  'infraestrutura-fisica-e-tecnologica': 'infrastructure',
  'reservas-e-recursos': 'infrastructure',
  biblioteca: 'infrastructure',
  'empregabilidade-carreira': 'internship',
  'dados-cadastrais': 'documents',
};
const ENROLLMENT_SERVICE = /matricula|tranca|transferencia|cancelamento|remanejamento|alteracao-de-disciplinas|antecipacao-de-disciplinas|disciplinas-isoladas|ouvinte|turma|turno/;

export function officialCategory(service: Pick<OfficialService, 'slug' | 'category'>): string {
  const section = service.category.slug ?? '';
  const mapped = CATEGORY_BY_SECTION[section] ?? 'asa_service';
  return mapped === 'academic' && ENROLLMENT_SERVICE.test(service.slug) ? 'enrollment' : mapped;
}

/** Parágrafo genérico de encerramento ("Ficou com dúvidas? Entre em contato…"): os canais já vão na seção própria. */
const BOILERPLATE = /^(ficou com d[uú]vidas?|qualquer d[uú]vida|em caso de d[uú]vidas?|d[uú]vidas\?)[^.!?]*[.!?]?\s*(.{0,160})$/i;

function isBoilerplate(text: string): boolean {
  return BOILERPLATE.test(text) && /canais de atendimento|prazer (em )?te ajudar|estamos dispon[ií]veis/i.test(text) && text.length < 260;
}

function formatPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  return null; // número incompleto na página de origem: não publica um telefone possivelmente errado
}

export function channelsLine(channels: OfficialService['channels']): string | null {
  const parts = [
    ...channels.phones.map(formatPhone).filter((phone): phone is string => Boolean(phone)).map((phone) => `telefone ${phone}`),
    ...channels.whatsapp.map(formatPhone).filter((phone): phone is string => Boolean(phone)).map((phone) => `WhatsApp ${phone}`),
    ...channels.emails.filter((email) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)).map((email) => `e-mail ${email}`),
  ];
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

/** Resumo: primeiro parágrafo, cortado em fim de frase até 400 caracteres (limite do banco). */
export function summarize(text: string): string {
  const plain = stripMarkdown(text);
  if (plain.length <= 400) return plain;
  const cut = plain.slice(0, 399);
  const sentence = cut.lastIndexOf('. ');
  return sentence > 120 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Slug do artigo: o da página oficial (até 80 caracteres, regra do banco). */
export function officialSlug(slug: string): string {
  const normalized = slugify(slug.replace(/-/g, ' '));
  if (normalized.length <= 80) return normalized;
  return normalized.slice(0, 80).replace(/-[^-]*$/, '');
}

function conditionLines(conditions: string[]): string[] {
  return conditions
    .flatMap((condition) => condition.split(/\n+/))
    .map((line) => line.replace(/^\s*(?:[-•–]+|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** A página original às vezes cola o link no texto ("portal[Requerimento](…)ou"): separa com espaço. */
function spaceLinks(text: string): string {
  return text.replace(/([^\s([])\[/g, '$1 [').replace(/\]\((https:[^)\s]+)\)(?=[^\s.,;:!?)\]])/g, ']($1) ');
}

function bodyLines(blocks: OfficialService['blocks']): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (isBoilerplate(block.text)) continue;
    const lines = spaceLinks(block.text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (block.tag === 'li') out.push(...lines.map((line) => `- ${line}`));
    else if (/^h[1-6]$/.test(block.tag)) out.push(`### ${lines.join(' ')}`);
    else out.push(...lines);
  }
  return out;
}

function referenceSection(input: { sector?: string | null; location?: string | null; hours?: string | null; channels?: string | null }): string[] {
  const rows = [
    input.sector ? `- **Setor responsável:** ${input.sector}` : null,
    input.location ? `- **Local:** ${input.location}` : null,
    input.hours ? `- **Horário de atendimento:** ${input.hours}` : null,
    input.channels ? `- **Canais:** ${input.channels}` : null,
  ].filter((row): row is string => Boolean(row));
  return rows.length > 0 ? ['## Onde e quando', '', ...rows] : [];
}

function joinBody(lines: string[]): string {
  // listas ficam juntas; parágrafos e títulos separados por linha em branco
  const out: string[] = [];
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (index > 0 && !(line.startsWith('- ') && previous?.startsWith('- ')) && line !== '' && previous !== '') out.push('');
    out.push(line);
  });
  return out.join('\n').trim();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildServiceArticle(service: OfficialService, snapshot: Pick<OfficialSnapshot, 'fetchedAt'>): OfficialArticle | null {
  const lines = bodyLines(service.blocks);
  const intro = lines.find((line) => !line.startsWith('- ') && !line.startsWith('#')) ?? lines[0];
  if (!intro) return null;
  const conditions = conditionLines(service.conditions);
  const body = joinBody([
    ...lines,
    ...(conditions.length > 0 ? ['## Condições', '', ...conditions.map((line) => `- ${line}`)] : []),
    ...referenceSection({ sector: service.sector, location: service.location, hours: service.hours, channels: channelsLine(service.channels) }),
  ]).slice(0, 20000);
  const title = service.title.trim().slice(0, 160);
  const summary = summarize(intro.replace(/^- /, ''));
  // páginas cujo endereço é só o número do post (ex.: /51199/) ganham slug a partir do título
  const slug = officialSlug(/^\d+$/.test(service.slug) ? slugify(title) : service.slug);
  return {
    id: `asa-cesta-${slug}`,
    slug,
    categoryId: officialCategory(service),
    title,
    summary,
    body,
    sourceLabel: OFFICIAL_SOURCE_LABEL,
    sourceUrl: service.url,
    changeNote: `Importado da Cesta de Serviços pública do ASA (fecap.br) em ${snapshot.fetchedAt.slice(0, 10)}.`,
    searchDocument: searchDocument(title, summary, `${searchableBody(body)} ${service.sector ?? ''}`),
    publishedAt: new Date(snapshot.fetchedAt),
    reviewDueAt: addDays(snapshot.fetchedAt, REVIEW_AFTER_DAYS),
  };
}

/** Corpo sem a seção "Onde e quando": horário e canais se repetem em todo artigo e só atrapalham a busca. */
function searchableBody(body: string): string {
  const index = body.indexOf('## Onde e quando');
  return index >= 0 ? body.slice(0, index) : body;
}

/** Valor que mais se repete (canais/horário padrão do ASA nas páginas da Cesta). */
function mostCommon(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Artigos gerais: o que é o ASA (página Quem Somos) e os canais/horário padrão publicados na Cesta. */
export function buildGeneralArticles(snapshot: OfficialSnapshot): OfficialArticle[] {
  const articles: OfficialArticle[] = [];
  const fetched = snapshot.fetchedAt.slice(0, 10);
  const asaServices = snapshot.services.filter((service) => service.location === 'Área do Sucesso Alvarista');
  const hours = mostCommon(asaServices.map((service) => service.hours?.replace(/^Segunda a sexta/, 'Segunda a Sexta') ?? null));
  const channels = mostCommon(snapshot.services.map((service) => channelsLine(service.channels)));
  const reference = referenceSection({ location: 'Área do Sucesso Alvarista', hours, channels });

  if (reference.length > 0) {
    const title = 'Canais e horário de atendimento do ASA';
    const summary = 'O ASA atende pelos canais publicados na Cesta de Serviços: telefone, WhatsApp e e-mail, além do atendimento na Área do Sucesso Alvarista.';
    const body = joinBody([
      summary,
      'Alguns setores, como a Biblioteca, têm horário e local próprios, informados no artigo de cada serviço.',
      ...reference,
    ]);
    articles.push({
      id: 'asa-cesta-canais-de-atendimento',
      slug: 'canais-de-atendimento-do-asa',
      categoryId: 'asa_service',
      title,
      summary,
      body,
      sourceLabel: OFFICIAL_SOURCE_LABEL,
      sourceUrl: snapshot.source,
      changeNote: `Canais e horário mais frequentes nas páginas da Cesta de Serviços em ${fetched}.`,
      searchDocument: searchDocument(`${title} contato telefone whatsapp email atendimento horario`, summary, body),
      publishedAt: new Date(snapshot.fetchedAt),
      reviewDueAt: addDays(snapshot.fetchedAt, REVIEW_AFTER_DAYS),
    });
  }

  const about = snapshot.about?.paragraphs.filter(Boolean) ?? [];
  if (snapshot.about && about.length > 0) {
    const title = 'O que é o ASA?';
    const summary = summarize(about[0]!);
    const body = joinBody([...about, ...reference]);
    articles.push({
      id: 'asa-cesta-o-que-e-o-asa',
      slug: 'o-que-e-o-asa',
      categoryId: 'asa_service',
      title,
      summary,
      body,
      sourceLabel: 'ASA — Quem Somos (fecap.br)',
      sourceUrl: snapshot.about.url,
      changeNote: `Importado da página Quem Somos do ASA (fecap.br) em ${fetched}.`,
      searchDocument: searchDocument(`${title} area do sucesso alvarista quem somos`, summary, searchableBody(body)),
      publishedAt: new Date(snapshot.fetchedAt),
      reviewDueAt: addDays(snapshot.fetchedAt, REVIEW_AFTER_DAYS),
    });
  }
  return articles;
}

/** Todos os artigos oficiais do retrato, com slugs únicos. */
export function buildOfficialArticles(snapshot: OfficialSnapshot): OfficialArticle[] {
  const articles = [...buildGeneralArticles(snapshot), ...snapshot.services.map((service) => buildServiceArticle(service, snapshot))].filter(
    (article): article is OfficialArticle => article !== null,
  );
  const seen = new Set<string>();
  return articles.filter((article) => (seen.has(article.slug) ? false : (seen.add(article.slug), true)));
}
