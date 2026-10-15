/** Datas no fuso do atendimento (APP_TIMEZONE): o "dia" de uma senha é o dia local do ASA. */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Diferença (minutos) entre o horário local do fuso e UTC no instante informado. */
export function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Dia local (YYYY-MM-DD) de um instante. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Último milissegundo do dia local `isoDate` (fim da validade de uma senha). */
export function endOfLocalDay(isoDate: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const nextMidnightUtcGuess = Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1);
  const offset = timezoneOffsetMinutes(new Date(nextMidnightUtcGuess), timeZone);
  return new Date(nextMidnightUtcGuess - offset * 60_000 - 1);
}

/** "20:53" no fuso informado. */
export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
