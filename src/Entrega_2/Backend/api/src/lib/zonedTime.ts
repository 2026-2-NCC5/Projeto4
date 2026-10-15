/**
 * Datas e horários no fuso da instituição (America/Sao_Paulo por padrão) sem dependências externas.
 * A API guarda e responde em UTC; agenda, séries por dia e prazos usam o calendário local.
 */
const DAY_MS = 86_400_000;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function parts(instant: Date, timeZone: string): Record<string, number> {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    partsFormatters.set(timeZone, formatter);
  }
  const result: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) if (part.type !== 'literal') result[part.type] = Number(part.value);
  return result;
}

/** Diferença (ms) entre o horário de parede local e UTC naquele instante. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - instant.getTime();
}

/** Data de calendário (YYYY-MM-DD) de um instante no fuso. */
export function localDate(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "HH:MM" local de um instante. */
export function localTime(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Instante UTC de um horário de parede local ("2026-10-20", "09:30"), correto também em horário de verão. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = guess - offsetAt(new Date(guess), timeZone);
  return new Date(guess - offsetAt(new Date(first), timeZone));
}

export function localMidnight(date: string, timeZone: string): Date {
  return zonedTimeToUtc(date, '00:00', timeZone);
}

/** Soma dias a uma data de calendário. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de uma data de calendário. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Lista de datas de `from` a `to` (inclusive). */
export function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let cursor = from; cursor <= to && days.length < 400; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

export const isCalendarDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export { DAY_MS };
