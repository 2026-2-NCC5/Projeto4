import { STOPWORDS, normalizeText, tokenize } from './text.js';

export interface SubjectRef {
  id: string;
  code: string;
  name: string;
  /** true quando o estudante autenticado possui matrícula ativa */
  enrolled: boolean;
}

export interface SubjectMatch {
  subject: SubjectRef;
  score: number;
}

export function significantTokens(name: string): string[] {
  return tokenize(normalizeText(name)).filter((token) => !STOPWORDS.has(token));
}

function tokenMatches(token: string, words: Set<string>): boolean {
  if (words.has(token)) return true;
  // plural/singular e pequenas variações ("estrutura" ↔ "estruturas")
  if (token.length < 6) return false;
  for (const word of words) {
    if (word.length >= 5 && (token.startsWith(word) || word.startsWith(token))) return true;
  }
  return false;
}

/**
 * Encontra disciplinas citadas no texto normalizado.
 * Pontuação: nome completo/código 1.0 · todos os tokens significativos 0.9 ·
 * iniciais ("bd", "ia") 0.8 · token distintivo (≥5 letras, exclusivo de uma disciplina) 0.75.
 */
export function matchSubjects(normalized: string, subjects: SubjectRef[]): SubjectMatch[] {
  const padded = ` ${normalized} `;
  const words = new Set(tokenize(normalized));
  const tokenOwners = new Map<string, number>();
  for (const subject of subjects) {
    for (const token of new Set(significantTokens(subject.name))) {
      tokenOwners.set(token, (tokenOwners.get(token) ?? 0) + 1);
    }
  }

  const matches: SubjectMatch[] = [];
  for (const subject of subjects) {
    const name = normalizeText(subject.name);
    const code = normalizeText(subject.code);
    const tokens = significantTokens(subject.name);
    let score = 0;
    if (name.length > 0 && padded.includes(` ${name} `)) score = 1;
    else if (code.length > 0 && words.has(code)) score = 1;
    else if (tokens.length > 0) {
      const matched = tokens.filter((token) => tokenMatches(token, words));
      const initials = tokens.map((token) => token[0]).join('');
      if (matched.length === tokens.length) score = 0.9;
      else if (tokens.length >= 2 && words.has(initials)) score = 0.8;
      else if (matched.some((token) => token.length >= 5 && tokenOwners.get(token) === 1)) score = 0.75;
    }
    if (score > 0) matches.push({ subject, score });
  }
  return matches.sort((a, b) => b.score - a.score || Number(b.subject.enrolled) - Number(a.subject.enrolled));
}

/** Todos os tokens de nomes de disciplinas (para não confundir "notas de Banco" com outra pessoa). */
export function subjectVocabulary(subjects: SubjectRef[]): Set<string> {
  const vocabulary = new Set<string>();
  for (const subject of subjects) {
    for (const token of significantTokens(subject.name)) vocabulary.add(token);
    vocabulary.add(normalizeText(subject.code));
  }
  return vocabulary;
}
