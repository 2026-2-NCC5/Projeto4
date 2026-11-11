import { normalizeSearch } from '../support/catalog.js';

/** Palavras muito comuns em perguntas (não ajudam a achar artigos). */
const STOPWORDS = new Set(
  'a o as os um uma uns umas de da do das dos em na no nas nos para pra por com sem que qual quais quando onde como porque por que e ou se eu me meu minha meus minhas voce vc isso isto esse essa este esta ao aos sobre mais menos ja nao sim tem ter ha quero queria preciso gostaria saber posso pode poderia fazer faz faco ola oi bom dia boa tarde noite obrigado obrigada asa favor consigo conseguir vejo ver acho encontro encontrar sei tenho alguem agora fecap faculdade aluno aluna estudante pedir peco solicitar solicito emitir emito tirar tiro obter obtenho realizar realizo requerer funciona funcionar'.split(' '),
);

/** Siglas curtas que identificam serviços (o limite de 3 letras as descartaria). */
const SHORT_TERMS = new Set(['dp', 'ra', 'ir', 'ti', 'rg']);

/** Grafias equivalentes unificadas antes da busca ("wi-fi" → "wifi", "e-mail" → "email", "2ª via" → "segunda via"). */
export function canonicalSearchText(text: string): string {
  return normalizeSearch(text)
    .replace(/\bwi[\s-]?fi\b/g, 'wifi')
    .replace(/\be[\s-]mails?\b/g, 'email')
    .replace(/\b2(?:a|ª|º|o)?\s*via\b/g, 'segunda via');
}

/** Termos relevantes da pergunta (minúsculo, sem acento, sem palavras vazias, até 8). */
export function queryTerms(text: string): string[] {
  const terms = canonicalSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter((term) => (term.length >= 3 || SHORT_TERMS.has(term)) && !STOPWORDS.has(term));
  return [...new Set(terms)].slice(0, 8);
}

/** Pergunta só com palavras vazias que cita o ASA/FECAP ("O que é o ASA?"): o nome vira o termo de busca. */
export function fallbackTerms(text: string): string[] {
  const words = new Set(canonicalSearchText(text).split(/[^a-z0-9]+/));
  return ['asa', 'fecap'].filter((name) => words.has(name));
}

/** Consulta para to_tsquery('portuguese', …): termos com prefixo, unidos por OU (ranking decide). */
export function toTsQuery(terms: string[]): string | null {
  const safe = terms.map((term) => term.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  return safe.length > 0 ? safe.map((term) => `${term}:*`).join(' | ') : null;
}

/** Radical simples: 5 letras para palavras longas, 4 para as de 5 letras ("perdi" ≈ "perdeu", "notas" ≈ "nota"). */
function stem(term: string): string {
  if (term.length > 5) return term.slice(0, 5);
  return term.length === 5 ? term.slice(0, 4) : term;
}

/** Fração dos termos da pergunta presentes no documento (radicais simples por prefixo). */
export function termCoverage(terms: string[], document: string): number {
  if (terms.length === 0) return 0;
  const words = document.split(/[^a-z0-9]+/);
  const hit = terms.filter((term) => {
    const prefix = stem(term);
    return words.some((word) => word.startsWith(prefix));
  });
  return hit.length / terms.length;
}

/**
 * Cobertura ponderada: cada termo vale pelo quanto é raro na base (IDF). "Segunda" aparece em quase todo artigo
 * e pesa pouco; "boleto" decide. Sem pesos, é a cobertura simples.
 */
export function weightedCoverage(terms: string[], document: string, weights?: number[]): number {
  if (!weights || weights.length !== terms.length) return termCoverage(terms, document);
  const words = document.split(/[^a-z0-9]+/);
  let hit = 0;
  let total = 0;
  terms.forEach((term, index) => {
    const weight = weights[index] ?? 1;
    total += weight;
    const prefix = stem(term);
    if (words.some((word) => word.startsWith(prefix))) hit += weight;
  });
  return total > 0 ? hit / total : 0;
}

/** Peso IDF suavizado (sempre > 0). */
export function idfWeights(total: number, counts: number[]): number[] {
  return counts.map((count) => Math.log(1 + (total + 1) / (count + 1)));
}

/** Fração das palavras do título cobertas pela pergunta (título exato vence título com palavras extras). */
export function titlePrecision(terms: string[], title: string): number {
  // o nome "ASA" conta no título ("O que é o ASA?"), embora seja palavra vazia nas perguntas
  const titleTerms = [...new Set([...queryTerms(title), ...fallbackTerms(title)])];
  if (titleTerms.length === 0) return 0;
  const prefixes = terms.map(stem);
  return titleTerms.filter((word) => prefixes.some((prefix) => word.startsWith(prefix))).length / titleTerms.length;
}

/** Texto do artigo para a busca (título pesa mais por repetição). */
export function searchDocument(title: string, summary: string, body: string): string {
  return canonicalSearchText(`${title} ${title} ${summary} ${body}`);
}

/**
 * Seções que descrevem o atendimento (e não o passo a passo): "## Condições", "## Onde e quando".
 * Os itens delas viram fatos da resposta, não passos.
 */
const REFERENCE_SECTIONS = /^#{2,3}\s*(condi[cç](ao|ão|oes|ões)|onde e quando|atendimento|canais|contato|contatos)\b/i;
const LIST_ITEM = /^(?:[-*]|\d+[.)])\s+(.*)$/;

/** Linhas do corpo fora das seções de referência (o conteúdo instrucional do artigo). */
function instructionalLines(body: string): string[] {
  const out: string[] = [];
  let skipping = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) skipping = REFERENCE_SECTIONS.test(line);
    if (!skipping) out.push(line);
  }
  return out;
}

/** Passos de um artigo (itens de lista do markdown); sem lista, os parágrafos. Ignora as seções de referência. */
export function extractSteps(body: string): string[] {
  const lines = instructionalLines(body);
  const items = lines.map((line) => LIST_ITEM.exec(line)?.[1]).filter((item): item is string => Boolean(item));
  if (items.length > 0) return items.map(stripMarkdown).slice(0, 12);
  return lines.filter((line) => line && !line.startsWith('#')).map(stripMarkdown).slice(0, 6);
}

export interface ArticleFact {
  label: string;
  value: string;
}

/**
 * Fatos de atendimento do artigo: itens "- **Rótulo:** valor" (setor, local, horário, canais) e as condições.
 * Servem para o assistente orientar "onde e quando" sem inventar nada além do texto publicado.
 */
export function extractFacts(body: string): ArticleFact[] {
  const facts: ArticleFact[] = [];
  const conditions: string[] = [];
  let section: 'conditions' | 'reference' | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      section = REFERENCE_SECTIONS.test(line) ? (/condi/i.test(line) ? 'conditions' : 'reference') : null;
      continue;
    }
    if (!section) continue;
    const item = LIST_ITEM.exec(line)?.[1];
    if (!item) continue;
    const labeled = /^\*\*([^*]{2,40}?):?\*\*:?\s*(.+)$/.exec(item);
    if (section === 'reference' && labeled) facts.push({ label: stripMarkdown(labeled[1]!), value: stripMarkdown(labeled[2]!) });
    else if (section === 'conditions') conditions.push(stripMarkdown(item));
  }
  if (conditions.length > 0) facts.unshift({ label: 'Condições', value: conditions.join(' ') });
  return facts.slice(0, 8);
}

/** Markdown restrito → texto puro (para fala, trechos e o app). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug a partir do título ("Como pedir revisão?" → "como-pedir-revisao"). */
export function slugify(title: string): string {
  return normalizeSearch(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
