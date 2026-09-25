import { WAKE_WORD } from '../../../config/services';

/** Minúsculas, sem acentos e sem pontuação (mesma normalização do interpretador da API). */
export function normalizeSpeech(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WakeWordMatch {
  matched: boolean;
  /** Frase reconhecida (normalizada). */
  phrase: string | null;
  /** O que veio depois da frase de ativação ("hey asa qual minha próxima aula" → "qual minha próxima aula"). */
  remainder: string;
}

const NO_MATCH: WakeWordMatch = Object.freeze({ matched: false, phrase: null, remainder: '' });

/**
 * Variações fonéticas que os reconhecedores costumam devolver para "Hey Asa" em pt-BR:
 * "ei asa", "hei asa", "hey aza", "ei assa", "hey aça", "rei asa"... A lista de WAKE_WORD.PHRASES
 * cobre as formas explícitas; a expressão abaixo generaliza prefixo + "asa" fonético.
 */
const GENERIC_PATTERN = /\b(?:hey|ei|hei|rei|ok|okay|oi|ola|alo|e ai)\s+(?:asa|aza|assa|aca|haza|hasa|lasa|azza|aha)\b/;

let phrasePattern: RegExp | null = null;
function phraseRegex(): RegExp {
  if (!phrasePattern) {
    const escaped = WAKE_WORD.PHRASES.map((phrase) => normalizeSpeech(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    phrasePattern = new RegExp(`\\b(?:${escaped.join('|')})\\b`);
  }
  return phrasePattern;
}

/**
 * Procura "Hey Asa" no texto reconhecido. Só considera as frases configuradas (ou a variação fonética
 * genérica) — a palavra "asa" sozinha NÃO ativa (aparece em respostas e no nome do app).
 */
export function matchWakeWord(transcript: string): WakeWordMatch {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) return NO_MATCH;
  const match = phraseRegex().exec(normalized) ?? GENERIC_PATTERN.exec(normalized);
  if (!match) return NO_MATCH;
  const phrase = match[0];
  const end = match.index + phrase.length;
  return { matched: true, phrase, remainder: normalized.slice(end).trim() };
}

/** Comando dito junto com a ativação é enviado direto (≥ 2 palavras evita ruído como "hey asa ah"). */
export function isDirectCommand(remainder: string): boolean {
  const words = remainder.split(' ').filter(Boolean);
  return words.length >= 2 && remainder.length >= 6;
}

/** Evita que o próprio TTS ("... o ASA ...") dispare a ativação: descarta transcrições contidas na fala atual. */
export function looksLikeEcho(transcript: string, spokenText: string | null): boolean {
  if (!spokenText) return false;
  const heard = normalizeSpeech(transcript);
  if (!heard) return false;
  const spoken = normalizeSpeech(spokenText);
  return heard.length >= 8 && spoken.includes(heard);
}
