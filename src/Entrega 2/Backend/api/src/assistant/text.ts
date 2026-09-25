/** Normalização de linguagem natural em pt-BR para interpretação por regras. */

const WAKE_PREFIX = /^(?:(?:oi|ola|ei|hey|ok|okay|alo|e ai)\s+)?(?:asa|assistente)\b\s*/;

/** minúsculas, sem acentos, sem pontuação e com espaços colapsados. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove "ASA,"/"oi assistente" do início, preservando o restante da pergunta. */
export function stripWakeWord(normalized: string): string {
  const stripped = normalized.replace(WAKE_PREFIX, '').trim();
  return stripped.length > 0 ? stripped : normalized;
}

export function tokenize(normalized: string): string[] {
  return normalized.length > 0 ? normalized.split(' ') : [];
}

export const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'com', 'na', 'no']);

/** Palavras que podem seguir "do/da" sem indicar outra pessoa ("notas da prova", "faltas do semestre"). */
export const ACADEMIC_VOCABULARY = new Set([
  'semana', 'semestre', 'bimestre', 'trimestre', 'periodo', 'mes', 'ano', 'dia', 'hoje', 'ontem', 'amanha',
  'prova', 'provas', 'p1', 'p2', 'p3', 'trabalho', 'trabalhos', 'atividade', 'atividades', 'lista', 'listas',
  'projeto', 'projetos', 'exame', 'exames', 'avaliacao', 'avaliacoes', 'disciplina', 'disciplinas', 'materia',
  'materias', 'curso', 'faculdade', 'universidade', 'fecap', 'aula', 'aulas', 'ultima', 'ultimo', 'proxima', 'proximo',
  'primeira', 'primeiro', 'segunda', 'segundo', 'terceira', 'terceiro', 'analise', 'recomendacao', 'entrega',
  'entregas', 'asa', 'sistema', 'aplicativo', 'app', 'minha', 'meu', 'minhas', 'meus', 'sua', 'seu', 'manha', 'tarde',
  'noite', 'graduacao', 'coordenacao', 'secretaria', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'atual', 'passado', 'passada', 'mesma', 'mesmo',
]);
