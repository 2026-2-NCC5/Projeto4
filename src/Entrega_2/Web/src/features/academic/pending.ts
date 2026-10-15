import { dayKey, formatCalendarDate } from '@/lib/format';
import type { PendingItemStatus, StudentPendingItem } from '@/types/api';

const DAY_MS = 86_400_000;

/** Dias entre hoje (calendário de São Paulo) e uma data "AAAA-MM-DD" da API; negativo = passado. */
export function daysUntil(date: string | null | undefined, now: Date = new Date()): number | null {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!match) return null;
  const today = dayKey(now);
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const base = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.round((target - base) / DAY_MS);
}

/** "hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias" (mesmas palavras do app). */
export function relativeDayLabel(days: number | null): string {
  if (days === null) return 'sem data';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 1 ? `em ${days} dias` : `há ${Math.abs(days)} dias`;
}

/**
 * Situação exibida (mesma regra do app): prazo vencido e não concluída aparece como "Atrasada", mesmo que a
 * fonte acadêmica ainda não tenha marcado o atraso. O assistente usa a mesma leitura ("Vencida").
 */
export function displayPendingStatus(item: Pick<StudentPendingItem, 'status' | 'dueDate'>, now: Date = new Date()): PendingItemStatus {
  if (item.status !== 'pending') return item.status;
  const days = daysUntil(item.dueDate, now);
  return days !== null && days < 0 ? 'overdue' : 'pending';
}

/** "Prazo: 22/09/2026 (há 23 dias)" · "Sem prazo definido". */
export function dueLabel(dueDate: string | null, now: Date = new Date()): string {
  if (!dueDate) return 'Sem prazo definido';
  return `Prazo: ${formatCalendarDate(dueDate)} (${relativeDayLabel(daysUntil(dueDate, now))})`;
}

export const PENDING_GROUP_ORDER: readonly PendingItemStatus[] = ['overdue', 'pending', 'completed'];

/**
 * Agrupa por situação (atrasadas, pendentes, concluídas) mantendo, dentro de cada grupo, a ordem da API
 * (prazo mais próximo primeiro; sem prazo no fim).
 */
export function groupPendingItems(items: StudentPendingItem[], now: Date = new Date()): Array<{ status: PendingItemStatus; items: StudentPendingItem[] }> {
  return PENDING_GROUP_ORDER.map((status) => ({ status, items: items.filter((item) => displayPendingStatus(item, now) === status) })).filter((group) => group.items.length > 0);
}

/** Itens que ainda pedem algo do aluno (pendentes ou atrasados). */
export const openPendingCount = (items: StudentPendingItem[]): number => items.filter((item) => item.status !== 'completed').length;
