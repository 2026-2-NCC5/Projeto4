import { isValidTicket, normalizeTicket, sameTicket } from './ticket.js';
import { QueueSourceError, type QueueCall, type QueueWaiting } from './types.js';

/**
 * Parser de fallback para o painel em TEXTO (HTML renderizado ou texto copiado do painel):
 *
 *   ÚLTIMA SENHA          PRÓXIMAS SENHAS          SENHAS ANTERIORES
 *   0026                  Posição  Senha           Senha  Mesa     Hora de Chamada
 *   Mesa 03               1        0027            0025   Mesa 03  06/10/2026 20:23
 *
 * Seções são localizadas pelos títulos (sem acento/caixa), não por seletores CSS.
 * "Não há registros a serem exibidos." só é aceito como lista vazia quando a seção existe;
 * texto sem nenhuma senha em lugar algum é erro (a página atual do portal renderiza as listas no
 * navegador, e o placeholder "Não há registros" aparece no HTML mesmo com fila cheia).
 */

export interface ParsedQueueText {
  calls: QueueCall[];
  upcoming: QueueWaiting[];
  /** true quando a seção "PRÓXIMAS SENHAS" foi encontrada (vazia ou não) */
  upcomingSectionFound: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const value = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** HTML → linhas de texto visível (sem scripts, estilos, atributos e caracteres de largura zero). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|section|table|thead|tbody|span)>/gi, '\n')
      .replace(/<(td|th)\b[^>]*>/gi, '\t')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

type Section = 'latest' | 'upcoming' | 'previous';

function headingOf(line: string): Section | null {
  const folded = fold(line).replace(/[^A-Z ]/g, '').trim();
  if (/^ULTIMAS? SENHAS?$/.test(folded)) return 'latest';
  if (/^PROXIMAS? SENHAS?$/.test(folded)) return 'upcoming';
  if (/^SENHAS? ANTERIORES$/.test(folded)) return 'previous';
  return null;
}

const DESK = /^(mesa|guiche|guichê|balcao|balcão|sala|box)\s*[\w-]+$/i;
const EMPTY = /nao ha registros/i;
const DATE_TIME = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;

function asTicket(token: string): string | null {
  const ticket = normalizeTicket(token);
  return /\d/.test(ticket) && isValidTicket(ticket) && ticket.length >= 2 ? ticket : null;
}

/** "06/10/2026 20:23" (horário local) → ISO UTC, usando o deslocamento do fuso informado. */
function toIso(match: RegExpExecArray, offsetMinutes: number): string {
  const [, day, month, year, hour, minute] = match.map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0) - offsetMinutes * 60_000).toISOString();
}

export function parseQueueText(text: string, options: { timezoneOffsetMinutes: number }): ParsedQueueText {
  const sections: Record<Section, string[]> = { latest: [], upcoming: [], previous: [] };
  const found = new Set<Section>();
  let current: Section | null = null;
  for (const line of text.split('\n').map((item) => item.trim()).filter(Boolean)) {
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      found.add(heading);
      continue;
    }
    if (current) sections[current].push(line);
  }
  if (found.size === 0) throw new QueueSourceError('parse', 'títulos da fila não encontrados no texto');

  // ÚLTIMA SENHA: "0026" seguido (opcionalmente) de "Mesa 03".
  const calls: QueueCall[] = [];
  const latest = sections.latest;
  for (let i = 0; i < latest.length; i += 1) {
    const ticket = asTicket(latest[i] ?? '');
    if (!ticket) continue;
    const next = latest[i + 1] ?? '';
    const desk = DESK.test(next) ? next.replace(/\s+/g, ' ') : null;
    if (desk) i += 1;
    calls.push({ ticket, desk, calledAt: null, serviceStatus: 'unknown', sourceId: null });
  }

  // SENHAS ANTERIORES: "0025 Mesa 03 06/10/2026 20:23" (tabela) — completa mesa/horário das chamadas.
  for (const line of sections.previous) {
    if (EMPTY.test(fold(line).toLowerCase())) continue;
    const tokens = line.split(/\s+/);
    const ticket = asTicket(tokens[0] ?? '');
    if (!ticket) continue;
    const deskMatch = /(mesa|guich[eê]|balc[aã]o|sala|box)\s*[\w-]+/i.exec(line);
    const time = DATE_TIME.exec(line);
    const call: QueueCall = {
      ticket,
      desk: deskMatch ? deskMatch[0].replace(/\s+/g, ' ') : null,
      calledAt: time ? toIso(time, options.timezoneOffsetMinutes) : null,
      serviceStatus: 'unknown',
      sourceId: null,
    };
    const existing = calls.find((item) => sameTicket(item.ticket, ticket));
    if (existing) {
      existing.desk ??= call.desk;
      existing.calledAt ??= call.calledAt;
    } else {
      calls.push(call);
    }
  }

  // PRÓXIMAS SENHAS: pares (posição, senha), em linha única ou em linhas separadas.
  const upcoming: QueueWaiting[] = [];
  const tokens = sections.upcoming
    .filter((line) => !EMPTY.test(fold(line).toLowerCase()) && !/^POSICAO\b/.test(fold(line)) && fold(line) !== 'SENHA')
    .flatMap((line) => line.split(/\s+/));
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const position = Number(tokens[i]);
    const ticket = asTicket(tokens[i + 1] ?? '');
    if (Number.isInteger(position) && position > 0 && position < 1000 && ticket && (tokens[i] ?? '').length <= 3) {
      upcoming.push({ ticket, position, sourceId: null });
      i += 1;
    }
  }

  if (calls.length === 0 && upcoming.length === 0) {
    throw new QueueSourceError('parse', 'nenhuma senha encontrada no texto do painel');
  }
  return { calls, upcoming, upcomingSectionFound: found.has('upcoming') };
}
