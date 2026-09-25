/** Utilitários de linguagem natural pt-BR para respostas na tela e na voz. */

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WORDS_MASC = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const WORDS_FEM = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

/** Data de hoje (YYYY-MM-DD) no fuso configurado. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtc(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Domingo que encerra a semana (segunda a domingo) de `iso`. */
export function endOfWeek(iso: string): string {
  const weekday = new Date(toUtc(iso)).getUTCDay(); // 0 = domingo
  return addDays(iso, weekday === 0 ? 0 : 7 - weekday);
}

export function countWord(count: number, feminine: boolean): string {
  if (count >= 0 && count <= 10) return (feminine ? WORDS_FEM : WORDS_MASC)[count] ?? String(count);
  return String(count);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** "2 atividades" (tela) */
export function countLabel(count: number, singular: string, pluralForm: string): string {
  return `${count} ${plural(count, singular, pluralForm)}`;
}

/** "duas atividades" (voz) */
export function spokenCount(count: number, singular: string, pluralForm: string, feminine: boolean): string {
  return `${countWord(count, feminine)} ${plural(count, singular, pluralForm)}`;
}

export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}`;
}

export function spokenDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${day} de ${MONTHS[(month ?? 1) - 1]}`;
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 2 dias" */
export function relativeDay(iso: string, todayIso: string): string {
  const diff = daysBetween(todayIso, iso);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff > 1) return `em ${diff} dias`;
  return `há ${Math.abs(diff)} dias`;
}

export function formatScore(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

export function assessmentTypeLabel(type: string): string {
  switch (type) {
    case 'exam':
      return 'prova';
    case 'assignment':
      return 'trabalho';
    case 'project':
      return 'projeto';
    default:
      return 'avaliação';
  }
}

/** Limita a fala a frases completas até `maxChars`. */
export function limitSpeech(text: string, maxChars = 320): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > maxChars) break;
    out += sentence;
  }
  return (out || clean.slice(0, maxChars)).trim();
}
