import { limitSpeech } from '../assistant/phrasing.js';
import { brainTokens, type BrainHit } from './index.js';
import type { BrainSection } from './vault.js';

/**
 * Resposta direta do cérebro, sem LLM: quando as regras e os artigos do ASA não responderam, o trecho da
 * nota do vault que mais casa com a pergunta vira a resposta (texto da nota, sem nada inventado) com a
 * fonte oficial. Só responde com confiança: a melhor seção precisa cobrir os termos da pergunta — senão é
 * melhor dizer que ainda não sabe e guardar a dúvida para a equipe ensinar.
 */
export interface BrainAnswer {
  noteId: string;
  title: string;
  message: string;
  speech: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  /** outras notas próximas, para "saiba mais" */
  related: string[];
  score: number;
}

/** Pontuação BM25 mínima da melhor nota (perguntas típicas bem respondidas ficam entre 9 e 30). */
const MIN_SCORE = 6;
/** Notas geradas do site (texto bruto da página) precisam de mais certeza que as revisadas pela equipe. */
const MIN_SCORE_GENERATED = 7.5;
const MESSAGE_MAX = 1_500;

/** Quanto da pergunta a melhor seção precisa cobrir: perguntas curtas exigem todos os termos. */
function requiredCoverage(terms: number): number {
  if (terms <= 2) return 1;
  if (terms <= 4) return 0.75;
  return 0.6;
}

function sectionText(section: BrainSection): string {
  return section.heading ? `${section.heading}:\n${section.text}` : section.text;
}

function clipAtParagraph(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const breakAt = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${(breakAt > max * 0.5 ? cut.slice(0, breakAt + 1) : cut).trimEnd()}…`;
}

/** Texto da nota em fala: sem URLs nem marcadores; e-mails por extenso. */
export function spokenText(text: string): string {
  return text
    .replace(/:?\s*https?:\/\/\S+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)/g, (_match, user: string, domain: string) => `${user} arroba ${domain.split('.').join(' ponto ')}`)
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_#`>]/g, '')
    .replace(/:\s*\n/g, ': ')
    .replace(/([^.!?:;\s])[ \t]*\n+/g, '$1. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Linhas de navegação/rodapé que a leitura do site deixa nas notas geradas ("Início » Asa", "Graduação | 10/06/2026", "Telefone"). */
const NOISE_LINE = /»|^\s*[\p{L} ]{1,40}\|\s*\d{2}\/\d{2}\/\d{4}\s*$|^\s*(telefone|e-?mail|whatsapp|endere[cç]o|compartilhe|saiba mais|leia mais|voltar)\s*:?\s*$/iu;

function cleanText(text: string, generated: boolean): string {
  if (!generated) return text.trim();
  return text
    .split('\n')
    .filter((line) => !NOISE_LINE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isConfident(hit: BrainHit, terms: number): boolean {
  // o apelido citado inteiro ("ASA", "FIES") só baixa a pontuação exigida; a cobertura vale sempre
  const min = hit.note.generated ? MIN_SCORE_GENERATED : MIN_SCORE;
  return hit.score >= (hit.aliasHit ? min * 0.5 : min) && hit.coverage >= requiredCoverage(terms);
}

export function composeBrainAnswer(question: string, hits: BrainHit[]): BrainAnswer | null {
  const terms = new Set(brainTokens(question)).size;
  if (terms === 0 || hits.length === 0) return null;
  // nota-índice de categoria (só uma lista de links) não é resposta: fica para o grafo e para o empurrão dos links
  const confident = hits.filter((hit) => !hit.note.tags.includes('categoria') && isConfident(hit, terms));
  // nota escrita e revisada pela equipe vence a gerada do site quando está perto na pontuação
  const best = confident[0];
  if (!best) return null;
  const curated = confident.find((hit) => !hit.note.generated);
  const top = best.note.generated && curated && curated.score >= best.score * 0.85 ? curated : best;

  const { note } = top;
  const generated = Boolean(note.generated);
  const news = note.tags.includes('noticia');
  const published = news && note.updated ? note.updated.split('-').reverse().join('/') : null;
  const sections = top.sections.map((section) => ({ ...section, text: cleanText(section.text, generated) })).filter((section) => section.text);
  const body = clipAtParagraph(sections.map(sectionText).join('\n\n').trim(), MESSAGE_MAX);
  if (!body) return null;
  const source = note.sourceUrl ? `\n\nFonte: ${note.sourceLabel ?? 'site da FECAP'} — ${note.sourceUrl}` : '';
  const message = `${published ? `Segundo aviso publicado no site da FECAP em ${published}:\n\n` : ''}${body}${source}`;

  // fala: o trecho exibido que mais contém os termos da pergunta (empate: o primeiro, em geral o mais direto), com o subtítulo
  const questionTerms = new Set(brainTokens(question));
  const termsIn = (section: { heading: string; text: string }): number => new Set(brainTokens(`${section.heading} ${section.text}`).filter((term) => questionTerms.has(term))).size;
  const spoken = sections.reduce((chosen, section) => {
    const diff = termsIn(section) - termsIn(chosen);
    return diff > 0 ? section : chosen;
  }, sections[0]!);
  const spokenBase = !spoken.heading || spoken === sections[0] ? spoken.text : `${spoken.heading}:\n${spoken.text}`;
  const speech = limitSpeech(`${published ? `Segundo um aviso de ${published} no site da FECAP: ` : ''}${spokenText(spokenBase || body)}`, 320);

  return {
    noteId: note.id,
    title: note.title.length > 60 ? `${note.title.slice(0, 59).trimEnd()}…` : note.title,
    message,
    speech,
    sourceLabel: note.sourceLabel,
    sourceUrl: note.sourceUrl,
    related: hits.filter((hit) => hit !== top && hit.score >= top.score * 0.5).slice(0, 2).map((hit) => hit.note.title),
    score: top.score,
  };
}
