/**
 * Formatação pt-BR com fuso explícito. A API sempre envia ISO-8601 em UTC; a interface mostra no fuso da
 * instituição (America/Sao_Paulo), independentemente do fuso do computador de quem acessa.
 */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, ...options });
    formatters.set(key, found);
  }
  return found;
}

const toDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

/** 14/10/2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return formatter('date', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(value));
}

/** 14/10/2026 às 21:05 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return `${formatDate(date)} às ${formatTime(date)}`;
}

/** 21:05 */
export function formatTime(value: string | Date): string {
  return formatter('time', { hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(value));
}

/** "qua., 14 de out." */
export function formatDayShort(value: string | Date): string {
  return formatter('dayShort', { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(value));
}

/** "quarta-feira, 14 de outubro" */
export function formatDayLong(value: string | Date): string {
  return formatter('dayLong', { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(value));
}

/** Data de calendário (YYYY-MM-DD) no fuso da instituição. */
export function dayKey(value: string | Date): string {
  const parts = formatter('dayKey', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Datas de calendário vindas da API sem horário ("2026-09-21"): nunca convertidas de fuso. */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(value);
}

/** "há 5 min", "há 2 h", "ontem", "há 3 dias" — ou a data para períodos maiores. */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const date = toDate(value);
  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return future ? `em ${minutes} min` : `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `em ${hours} h` : `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (!future && days === 1) return 'ontem';
  if (days < 7) return future ? `em ${days} dias` : `há ${days} dias`;
  return formatDate(date);
}

/** Duração legível de um intervalo em minutos: "45 min", "3 h 10 min", "2 d 4 h". */
export function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || !Number.isFinite(totalMinutes)) return '—';
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : number.format(value);
}

/** 0.873 → "87%" */
export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : percent.format(value);
}

/** Nota em escala 0–10 com uma casa ("7,5"). */
export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
