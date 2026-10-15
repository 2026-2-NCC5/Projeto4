import type { SupportSlaStatus } from '../contracts/mobileApi.v1.js';
import type { SupportSlaRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

function weekdayIn(date: Date, timeZone: string): string {
  let formatter = weekdayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    weekdayFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

/** Soma dias úteis (segunda a sexta no fuso da instituição), mantendo o horário. Feriados não são considerados. */
export function addBusinessDays(start: Date, days: number, timeZone: string): Date {
  let cursor = start.getTime();
  let added = 0;
  while (added < days) {
    cursor += DAY_MS;
    const weekday = weekdayIn(new Date(cursor), timeZone);
    if (weekday !== 'Sat' && weekday !== 'Sun') added += 1;
  }
  return new Date(cursor);
}

export function startSla(targetBusinessDays: number, now: Date, timeZone: string): SupportSlaRecord {
  return { targetBusinessDays, startedAt: now, dueAt: addBusinessDays(now, targetBusinessDays, timeZone), pausedAt: null, resumedAt: null, completedAt: null };
}

/** Aguardando o estudante: o relógio para (o prazo não corre enquanto o ASA espera uma resposta). */
export function pauseSla(sla: SupportSlaRecord, now: Date): SupportSlaRecord {
  if (sla.pausedAt || sla.completedAt) return sla;
  return { ...sla, pausedAt: now };
}

/** Retomada: o prazo é estendido pelo tempo em pausa. */
export function resumeSla(sla: SupportSlaRecord, now: Date): SupportSlaRecord {
  if (!sla.pausedAt) return sla;
  const paused = Math.max(0, now.getTime() - sla.pausedAt.getTime());
  return { ...sla, dueAt: new Date(sla.dueAt.getTime() + paused), pausedAt: null, resumedAt: now };
}

export function completeSla(sla: SupportSlaRecord, now: Date): SupportSlaRecord {
  if (sla.completedAt) return sla;
  return { ...resumeSla(sla, now), completedAt: now };
}

/** Reabertura: um novo prazo começa do zero. */
export function restartSla(sla: SupportSlaRecord, now: Date, timeZone: string): SupportSlaRecord {
  return startSla(sla.targetBusinessDays, now, timeZone);
}

/**
 * on_track → attention (mais da metade do prazo consumida) → near_deadline (últimos 25% ou menos de 8 h)
 * → overdue. Pausado e concluído têm precedência.
 */
export function slaStatus(sla: SupportSlaRecord, now: Date): SupportSlaStatus {
  if (sla.completedAt) return 'completed';
  if (sla.pausedAt) return 'paused';
  const total = Math.max(1, sla.dueAt.getTime() - sla.startedAt.getTime());
  const remaining = sla.dueAt.getTime() - now.getTime();
  if (remaining <= 0) return 'overdue';
  if (remaining <= total * 0.25 || remaining <= 8 * HOUR_MS) return 'near_deadline';
  if (remaining <= total * 0.5) return 'attention';
  return 'on_track';
}
