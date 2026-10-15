/**
 * Senhas da fila presencial. A senha é texto ("0029"), nunca número: zeros à esquerda são preservados
 * na exibição. Para comparar a senha digitada com a da fonte usamos uma chave canônica
 * (prefixo de letras + dígitos sem zeros à esquerda), assim "29" e "0029" são a mesma senha.
 */

/** Letras opcionais (prioridade/serviço) + dígitos. Ex.: "0029", "P012", "A-15". */
export const TICKET_PATTERN = /^[A-Z]{0,3}-?\d{1,6}$/;

/** Maiúsculas, sem espaços/quebras de linha (a fonte devolve "0026\n"). Não altera zeros. */
export function normalizeTicket(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidTicket(raw: string): boolean {
  return TICKET_PATTERN.test(normalizeTicket(raw));
}

/** Chave de comparação: "0029" → "29", "P007" → "P7", "A-15" → "A15". */
export function ticketKey(raw: string): string {
  const normalized = normalizeTicket(raw).replace(/-/g, '');
  const match = /^([A-Z]*)(\d+)$/.exec(normalized);
  if (!match) return normalized;
  const digits = (match[2] ?? '').replace(/^0+(?=\d)/, '');
  return `${match[1] ?? ''}${digits}`;
}

export function sameTicket(a: string, b: string): boolean {
  return ticketKey(a) === ticketKey(b);
}
