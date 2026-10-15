const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad2 = (value: number) => String(value).padStart(2, '0');

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Dias de calendário entre duas datas (0 = mesmo dia; 1 = ontem). */
function calendarDaysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY);
}

/** "18:42" */
export function formatTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : '—';
}

/** "06 out. 2026" */
export function formatShortDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()] ?? ''} ${date.getFullYear()}` : '—';
}

/** "06/10/2026 às 18:42" (timestamp completo, na área de detalhes). */
export function formatFullDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  if (!date) return '—';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} às ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Cabeçalho de grupo da linha do tempo: "Hoje", "Ontem", "06 out. 2026". */
export function formatDayGroup(iso: string, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return '—';
  const days = calendarDaysBetween(date, now);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return formatShortDate(iso);
}

/** "Hoje, 18:42" · "Ontem, 14:20" · "06 out. 2026, 14:20" */
export function formatFriendlyDateTime(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return '—';
  return `${formatDayGroup(iso as string, now)}, ${formatTime(iso)}`;
}

/** "agora" · "há 18 min" · "há 2 h" · "ontem" · "há 3 dias" · "06 out. 2026" */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return '—';
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return 'agora';
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  const days = calendarDaysBetween(date, now);
  if (days === 0) return `há ${Math.floor(diff / HOUR)} h`;
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return formatShortDate(iso);
}

/** "Atualizado há 18 min" · "Atualizado ontem" · "Atualizado agora". */
export function formatUpdated(iso: string | null | undefined, now: Date = new Date()): string {
  return `Atualizado ${formatRelative(iso, now)}`;
}

/** "1,8 MB" · "320 KB" · "900 bytes" */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** "Até 08 de outubro" (com o ano quando não for o ano atual). */
export function formatDueDate(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return '—';
  const year = date.getFullYear() !== now.getFullYear() ? ` de ${date.getFullYear()}` : '';
  return `Até ${pad2(date.getDate())} de ${MONTHS_LONG[date.getMonth()] ?? ''}${year}`;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * Tempo restante sem alarmismo: "1 dia e 4 horas", "3 horas", "40 minutos". null quando já passou
 * (o prazo excedido é comunicado pelo texto da situação, não por contagem negativa).
 */
export function formatRemaining(dueIso: string | null | undefined, now: Date = new Date()): string | null {
  const due = parse(dueIso);
  if (!due) return null;
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  if (days > 0) return hours > 0 ? `${plural(days, 'dia', 'dias')} e ${plural(hours, 'hora', 'horas')}` : plural(days, 'dia', 'dias');
  if (hours > 0) return plural(hours, 'hora', 'horas');
  return plural(Math.max(1, Math.floor(diff / MINUTE)), 'minuto', 'minutos');
}

/** "até 2 dias úteis" */
export function formatBusinessDays(days: number): string {
  return `até ${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`;
}
