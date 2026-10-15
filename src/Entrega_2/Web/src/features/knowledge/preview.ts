/**
 * Mesmas regras do servidor (Backend/api/src/knowledge/text.ts) para montar o "passo a passo" que a Central de
 * ajuda e o assistente mostram a partir do texto do artigo: itens de lista viram passos (até 12); sem lista,
 * os parágrafos (até 6). Assim a prévia mostra o que o aluno vai ver, sem chamar a API a cada tecla.
 */

/** Markdown restrito → texto puro. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSteps(body: string): string[] {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const items = lines.map((line) => /^(?:[-*]|\d+[.)])\s+(.*)$/.exec(line)?.[1]).filter((item): item is string => Boolean(item));
  if (items.length > 0) return items.map(stripMarkdown).slice(0, 12);
  return lines.filter((line) => line && !line.startsWith('#')).map(stripMarkdown).slice(0, 6);
}

/** Passos exibidos na Central de ajuda (o resumo não se repete como passo). */
export function helpCenterSteps(body: string, summary: string): string[] {
  return extractSteps(body.trim()).filter((step) => step !== summary.trim());
}
