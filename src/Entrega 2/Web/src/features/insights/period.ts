import { dayKey, formatCalendarDate } from '@/lib/format';

/**
 * Período dos indicadores, guardado na URL (link compartilhável, preservado ao voltar):
 * - `?periodo=7|30|90` → últimos N dias, incluindo hoje (padrão: 30, o mesmo do servidor);
 * - `?de=AAAA-MM-DD&ate=AAAA-MM-DD` → datas escolhidas no calendário.
 * As datas são de calendário no fuso da instituição e vão para a API como `from`/`to` (inclusivos).
 * As regras de validação espelham as do servidor (operationsService.parsePeriod).
 */

export const MAX_PERIOD_DAYS = 366;
export const PERIOD_PRESETS = [7, 30, 90] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const DEFAULT_PRESET: PeriodPreset = 30;

export type PeriodChoice = `${PeriodPreset}` | 'custom';

export interface PeriodQuery {
  from: string;
  to: string;
}

export interface ResolvedPeriod {
  choice: PeriodChoice;
  /** datas da seleção (podem estar vazias no modo personalizado) */
  from: string;
  to: string;
  /** dias do intervalo, inclusivo (0 quando inválido) */
  days: number;
  /** motivo para não consultar a API */
  error: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Data de calendário real (rejeita 2026-02-30). */
export function isCalendarDate(value: string | null | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Soma dias a uma data de calendário (aritmética em UTC: sem efeito de horário de verão). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Quantidade de dias entre duas datas, contando as duas pontas. */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Hoje no fuso da instituição (AAAA-MM-DD). */
export function institutionToday(): string {
  return dayKey(new Date());
}

const isPreset = (value: string | null): value is `${PeriodPreset}` => PERIOD_PRESETS.some((preset) => String(preset) === value);

export function presetRange(preset: PeriodPreset, today: string): PeriodQuery {
  return { from: addDays(today, -(preset - 1)), to: today };
}

/** Mesmas mensagens do servidor para o mesmo erro. */
export function validateRange(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'Informe a data inicial e a data final.';
  if (!isCalendarDate(from) || !isCalendarDate(to)) return 'Use datas válidas (dia, mês e ano).';
  if (to < from) return 'A data final deve ser igual ou posterior à inicial.';
  if (to > today) return 'A data final não pode ser depois de hoje.';
  if (inclusiveDays(from, to) > MAX_PERIOD_DAYS) return `Escolha um período de até ${MAX_PERIOD_DAYS} dias.`;
  return null;
}

export function readPeriod(params: URLSearchParams, today: string): ResolvedPeriod {
  const from = params.get('de') ?? '';
  const to = params.get('ate') ?? '';
  if (from || to || params.get('periodo') === 'personalizado') {
    const error = validateRange(from, to, today);
    return { choice: 'custom', from, to, days: error ? 0 : inclusiveDays(from, to), error };
  }
  const raw = params.get('periodo');
  const preset: PeriodPreset = isPreset(raw) ? (Number(raw) as PeriodPreset) : DEFAULT_PRESET;
  const range = presetRange(preset, today);
  return { choice: `${preset}`, ...range, days: preset, error: null };
}

/** Parâmetros da URL para uma escolha (o padrão de 30 dias não aparece na URL). */
export function periodParams(choice: PeriodChoice, current: PeriodQuery): Record<string, string | null> {
  if (choice === 'custom') return { periodo: 'personalizado', de: current.from || null, ate: current.to || null };
  return { periodo: choice === `${DEFAULT_PRESET}` ? null : choice, de: null, ate: null };
}

/** Consulta para a API; null enquanto o período for inválido (nada é pedido ao servidor). */
export function periodQuery(period: ResolvedPeriod): PeriodQuery | null {
  return period.error ? null : { from: period.from, to: period.to };
}

export const PERIOD_OPTIONS: Array<{ value: PeriodChoice; label: string }> = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: 'custom', label: 'Datas' },
];

/** "09/10/2026 a 15/10/2026 (7 dias)" */
export function describePeriod(query: PeriodQuery): string {
  const days = inclusiveDays(query.from, query.to);
  const range = query.from === query.to ? formatCalendarDate(query.from) : `${formatCalendarDate(query.from)} a ${formatCalendarDate(query.to)}`;
  return `${range} (${days === 1 ? '1 dia' : `${days} dias`})`;
}
