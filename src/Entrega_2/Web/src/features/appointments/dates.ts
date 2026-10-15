import { dayKey, formatDayLong, formatTime } from '@/lib/format';

/**
 * Datas de calendário (AAAA-MM-DD) no fuso da instituição. A aritmética é feita sobre o calendário (UTC puro),
 * nunca sobre horários locais do computador de quem acessa; horários vindos da API (ISO) são exibidos com
 * `lib/format`, sempre em America/Sao_Paulo.
 */
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtc(key: string): Date {
  const match = DATE_KEY.exec(key);
  if (!match) throw new RangeError(`Data de calendário inválida: ${key}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** "2026-10-15" válido (rejeita 2026-02-30). */
export function isDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

export const addDays = (key: string, days: number): string => new Date(toUtc(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** 0 = domingo … 6 = sábado (mesma convenção da API de disponibilidade). */
export const weekdayOf = (key: string): number => toUtc(key).getUTCDay();

/** Segunda-feira da semana da data (a agenda da equipe vai de segunda a domingo). */
export const startOfWeek = (key: string): string => addDays(key, -((weekdayOf(key) + 6) % 7));

/** Diferença em dias de calendário (to − from). */
export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);

export function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) days.push(key);
  return days;
}

/** Meio-dia UTC da data: em São Paulo continua sendo o mesmo dia (só para exibir com `lib/format`). */
export const keyToDate = (key: string): Date => new Date(toUtc(key).getTime() + 12 * 3_600_000);

/** Dia do mês sem zero à esquerda ("5"). */
export const dayOfMonth = (key: string): string => String(toUtc(key).getUTCDate());

export const capitalize = (text: string): string => (text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : text);

/** "quinta-feira, 15 de outubro" para uma data de calendário. */
export const formatKeyLong = (key: string): string => formatDayLong(keyToDate(key));

const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** "12 a 18 de outubro de 2026" · "26 de outubro a 1 de novembro de 2026". */
export function formatRange(from: string, to: string): string {
  const start = toUtc(from);
  const end = toUtc(to);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const endText = `${end.getUTCDate()} de ${monthName.format(end)} de ${end.getUTCFullYear()}`;
  if (sameYear && start.getUTCMonth() === end.getUTCMonth()) return `${start.getUTCDate()} a ${endText}`;
  if (sameYear) return `${start.getUTCDate()} de ${monthName.format(start)} a ${endText}`;
  return `${start.getUTCDate()} de ${monthName.format(start)} de ${start.getUTCFullYear()} a ${endText}`;
}

/** "09:00–09:30" no fuso da instituição. */
export const formatTimeRange = (startsAt: string, endsAt: string): string => `${formatTime(startsAt)}–${formatTime(endsAt)}`;

/** "Quinta-feira, 15 de outubro" (com o ano quando não é o ano corrente). */
export function formatAppointmentDay(startsAt: string, now: Date): string {
  const label = capitalize(formatDayLong(startsAt));
  const year = dayKey(startsAt).slice(0, 4);
  return year === dayKey(now).slice(0, 4) ? label : `${label} de ${year}`;
}

export const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
/** Ordem de exibição: segunda primeiro, domingo por último. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "HH:MM" → minutos desde 00:00 (null se inválido). */
export function timeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export const plural = (count: number, singular: string, pluralForm: string): string => `${count} ${count === 1 ? singular : pluralForm}`;
