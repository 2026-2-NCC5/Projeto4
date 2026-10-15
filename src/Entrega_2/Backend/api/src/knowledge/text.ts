import { normalizeSearch } from '../support/catalog.js';

/** Palavras muito comuns em perguntas (não ajudam a achar artigos). */
const STOPWORDS = new Set(
  'a o as os um uma uns umas de da do das dos em na no nas nos para pra por com sem que qual quais quando onde como porque por que e ou se eu me meu minha meus minhas voce vc isso isto esse essa este esta ao aos sobre mais menos ja nao sim tem ter ha quero queria preciso gostaria saber posso pode poderia fazer faz faco ola oi bom dia boa tarde noite obrigado obrigada asa favor'.split(' '),
);

/** Termos relevantes da pergunta (minúsculo, sem acento, sem palavras vazias, até 8). */
export function queryTerms(text: string): string[] {
  const terms = normalizeSearch(text)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));
  return [...new Set(terms)].slice(0, 8);
}

/** Consulta para to_tsquery('portuguese', …): termos com prefixo, unidos por OU (ranking decide). */
export function toTsQuery(terms: string[]): string | null {
  const safe = terms.map((term) => term.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  return safe.length > 0 ? safe.map((term) => `${term}:*`).join(' | ') : null;
}

/** Fração dos termos da pergunta presentes no documento (radicais simples por prefixo de 5 letras). */
export function termCoverage(terms: string[], document: string): number {
  if (terms.length === 0) return 0;
  const words = document.split(/[^a-z0-9]+/);
  const hit = terms.filter((term) => {
    const stem = term.length > 5 ? term.slice(0, 5) : term;
    return words.some((word) => word.startsWith(stem));
  });
  return hit.length / terms.length;
}

/** Texto do artigo para a busca (título pesa mais por repetição). */
export function searchDocument(title: string, summary: string, body: string): string {
  return normalizeSearch(`${title} ${title} ${summary} ${body}`);
}

/** Passos de um artigo (itens de lista do markdown); sem lista, os parágrafos. */
export function extractSteps(body: string): string[] {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const items = lines.map((line) => /^(?:[-*]|\d+[.)])\s+(.*)$/.exec(line)?.[1]).filter((item): item is string => Boolean(item));
  if (items.length > 0) return items.map(stripMarkdown).slice(0, 12);
  return lines.filter((line) => line && !line.startsWith('#')).map(stripMarkdown).slice(0, 6);
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
