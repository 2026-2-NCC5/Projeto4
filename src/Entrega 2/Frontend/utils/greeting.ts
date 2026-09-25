const WEEKDAYS_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Bom dia" (5h–11h59), "Boa tarde" (12h–17h59), "Boa noite" (demais). */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function greeting(date: Date = new Date()): string {
  return greetingForHour(date.getHours());
}

/** "Quinta-feira, 17 de setembro" */
export function formatLongDate(date: Date = new Date()): string {
  return `${WEEKDAYS_LONG[date.getDay()] ?? ''}, ${date.getDate()} de ${MONTHS_LONG[date.getMonth()] ?? ''}`;
}

/** Data ISO (YYYY-MM-DD) do dia local. */
export function toIsoDay(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Dias entre hoje e uma data ISO (negativo = passado). Datas sem hora são tratadas como dia local. */
export function daysUntil(iso: string | null | undefined, today: Date = new Date()): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 2 dias". */
export function relativeDayLabel(days: number | null): string {
  if (days === null) return 'sem data';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  if (days > 1) return `em ${days} dias`;
  return `há ${Math.abs(days)} dias`;
}
