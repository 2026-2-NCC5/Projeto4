import { APPOINTMENTS } from './config';

/**
 * Datas e horários dos agendamentos no fuso da instituição (America/Sao_Paulo), em pt-BR, independentemente do
 * fuso do aparelho. O texto é montado aqui (nomes de dias e meses fixos) para ser igual em qualquer motor JS.
 */

const WEEKDAYS_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad2 = (value: number) => String(value).padStart(2, '0');

export interface ZonedParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = domingo */
  weekday: number;
}

/** Fusos sem horário de verão usados quando o Intl do aparelho não conhece o fuso (Brasília: UTC−3 desde 2019). */
const FIXED_OFFSET_MINUTES: Record<string, number> = { 'America/Sao_Paulo': -180 };

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    } catch {
      formatter = null;
    }
    formatters.set(timeZone, formatter);
  }
  return formatters.get(timeZone) ?? null;
}

const weekdayOf = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

/** Partes de data/hora de um instante no fuso informado. */
export function zonedParts(date: Date, timeZone: string = APPOINTMENTS.TIMEZONE): ZonedParts {
  const formatter = formatterFor(timeZone);
  if (formatter && typeof formatter.formatToParts === 'function') {
    try {
      const parts = formatter.formatToParts(date);
      const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
      const year = read('year');
      const month = read('month');
      const day = read('day');
      let hour = read('hour');
      const minute = read('minute');
      if ([year, month, day, hour, minute].every(Number.isFinite)) {
        const period = parts.find((part) => part.type === 'dayPeriod')?.value;
        if (period) hour = (hour % 12) + (/p/i.test(period) ? 12 : 0);
        if (hour === 24) hour = 0;
        return { year, month, day, hour, minute, weekday: weekdayOf(year, month, day) };
      }
    } catch {
      // cai no deslocamento fixo abaixo
    }
  }
  const offset = FIXED_OFFSET_MINUTES[timeZone];
  if (offset !== undefined) {
    const shifted = new Date(date.getTime() + offset * 60_000);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), weekday: date.getDay() };
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-10-16" — o dia do calendário no fuso informado. */
export function isoDateInZone(date: Date, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

interface CalendarDay {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/** Interpreta "YYYY-MM-DD" como dia do calendário (sem fuso). */
export function parseIsoDate(isoDate: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return { year, month, day, weekday: weekdayOf(year, month, day) };
}

/** "2026-10-16" + 13 → "2026-10-29" (aritmética de calendário, sem horário de verão). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Período consultado na escolha do dia: hoje (no fuso da instituição) e os 13 dias seguintes. */
export function slotRange(now: Date, timeZone: string = APPOINTMENTS.TIMEZONE, days: number = APPOINTMENTS.DAYS_SHOWN): { from: string; to: string } {
  const from = isoDateInZone(now, timeZone);
  return { from, to: addDaysToIsoDate(from, days - 1) };
}

/** "14:30" no fuso da instituição. */
export function formatClock(iso: string | null | undefined, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const date = parseInstant(iso);
  if (!date) return '—';
  const parts = zonedParts(date, timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** "14:00 às 14:30" */
export function formatTimeRange(startsAt: string, endsAt: string, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  return `${formatClock(startsAt, timeZone)} às ${formatClock(endsAt, timeZone)}`;
}

/** "Quinta-feira, 16 de outubro" (+ " de 2026" com `withYear`). */
export function formatCalendarDay(isoDate: string, options: { withYear?: boolean } = {}): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return '—';
  const base = `${WEEKDAYS_LONG[parsed.weekday] ?? ''}, ${parsed.day} de ${MONTHS_LONG[parsed.month - 1] ?? ''}`;
  return options.withYear ? `${base} de ${parsed.year}` : base;
}

/** Partes curtas do dia para a lista horizontal: { weekday: "qui", day: "16", month: "out" }. */
export function dayChipParts(isoDate: string): { weekday: string; day: string; month: string } {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return { weekday: '', day: '—', month: '' };
  return { weekday: WEEKDAYS_SHORT[parsed.weekday] ?? '', day: String(parsed.day), month: MONTHS_SHORT[parsed.month - 1] ?? '' };
}

/** "Quinta-feira, 16 de outubro de 2026" — data do agendamento no fuso da instituição. */
export function formatAppointmentDate(startsAt: string, timeZone: string = APPOINTMENTS.TIMEZONE, options: { withYear?: boolean } = { withYear: true }): string {
  const date = parseInstant(startsAt);
  return date ? formatCalendarDay(isoDateInZone(date, timeZone), options) : '—';
}

/** "qui, 16 out · 14:00" — linha compacta das listas. */
export function formatAppointmentShort(startsAt: string, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const date = parseInstant(startsAt);
  if (!date) return '—';
  const parts = zonedParts(date, timeZone);
  return `${WEEKDAYS_SHORT[parts.weekday] ?? ''}, ${parts.day} ${MONTHS_SHORT[parts.month - 1] ?? ''} · ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** "16/10 às 08:00" — prazo para cancelar/remarcar. */
export function formatDeadline(iso: string | null | undefined, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const date = parseInstant(iso);
  if (!date) return '—';
  const parts = zonedParts(date, timeZone);
  return `${pad2(parts.day)}/${pad2(parts.month)} às ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** "16/10/2026 às 08:00" — momento de um evento do histórico. */
export function formatDateTime(iso: string | null | undefined, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const date = parseInstant(iso);
  if (!date) return '—';
  const parts = zonedParts(date, timeZone);
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year} às ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** Dia do agendamento (YYYY-MM-DD) no fuso da instituição — usado na agenda do Início. */
export function appointmentDay(startsAt: string, timeZone: string = APPOINTMENTS.TIMEZONE): string | null {
  const date = parseInstant(startsAt);
  return date ? isoDateInZone(date, timeZone) : null;
}

/** "horário de Brasília" para o fuso padrão; outros fusos aparecem pelo identificador. */
export function timezoneLabel(timeZone: string = APPOINTMENTS.TIMEZONE): string {
  return timeZone === 'America/Sao_Paulo' ? 'horário de Brasília' : `fuso ${timeZone}`;
}

/** "5 horários" · "1 horário" · "Sem horários" */
export function formatSlotCount(count: number): string {
  if (count <= 0) return 'Sem horários';
  return `${count} ${count === 1 ? 'horário' : 'horários'}`;
}
