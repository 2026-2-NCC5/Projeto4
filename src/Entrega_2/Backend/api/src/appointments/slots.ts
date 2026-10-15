import type { AppointmentMode } from '../contracts/mobileApi.v1.js';
import { addDays, dateRange, weekdayOf, zonedTimeToUtc } from '../lib/zonedTime.js';
import type { AvailabilityRecord, BusyInterval } from './types.js';

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  mode: AppointmentMode;
  location: string | null;
  /** atendentes livres neste horário, com a faixa de disponibilidade de cada um */
  candidates: Array<{ attendantUserId: string; availabilityId: string }>;
}

export interface SlotQuery {
  rules: AvailabilityRecord[];
  /** YYYY-MM-DD inclusive, no fuso da instituição */
  from: string;
  to: string;
  timeZone: string;
  now: Date;
  /** antecedência mínima: horários antes de now + minLeadHours não são oferecidos */
  minLeadHours: number;
  busy: BusyInterval[];
  mode?: AppointmentMode;
}

const timeToMinutes = (time: string): number => {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
};

const minutesToTime = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean => aStart < bEnd && bStart < aEnd;

/**
 * Gera os horários livres a partir da disponibilidade cadastrada (regras por dia da semana), descontando
 * agendamentos ativos de cada atendente e a antecedência mínima. Puro e determinístico (testável sem banco);
 * a reserva confere tudo de novo e o banco ainda impede sobreposição.
 */
export function generateSlots(query: SlotQuery): GeneratedSlot[] {
  const earliest = new Date(query.now.getTime() + query.minLeadHours * 3_600_000);
  const grouped = new Map<string, GeneratedSlot>();
  for (const date of dateRange(query.from, query.to)) {
    const weekday = weekdayOf(date);
    for (const rule of query.rules) {
      if (!rule.active || rule.weekday !== weekday) continue;
      if (date < rule.validFrom || (rule.validUntil && date > rule.validUntil)) continue;
      if (query.mode && rule.mode !== query.mode) continue;
      const end = timeToMinutes(rule.endTime);
      for (let start = timeToMinutes(rule.startTime); start + rule.slotMinutes <= end; start += rule.slotMinutes) {
        const startsAt = zonedTimeToUtc(date, minutesToTime(start), query.timeZone);
        const endsAt = new Date(startsAt.getTime() + rule.slotMinutes * 60_000);
        if (startsAt < earliest) continue;
        const busy = query.busy.some((interval) => interval.attendantUserId === rule.attendantUserId && overlaps(startsAt, endsAt, interval.startsAt, interval.endsAt));
        if (busy) continue;
        const key = `${startsAt.toISOString()}|${endsAt.toISOString()}|${rule.mode}|${rule.location ?? ''}`;
        const slot = grouped.get(key) ?? { startsAt, endsAt, mode: rule.mode, location: rule.location, candidates: [] };
        if (!slot.candidates.some((candidate) => candidate.attendantUserId === rule.attendantUserId)) {
          slot.candidates.push({ attendantUserId: rule.attendantUserId, availabilityId: rule.id });
        }
        grouped.set(key, slot);
      }
    }
  }
  return [...grouped.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.mode.localeCompare(b.mode));
}

/** Data seguinte (para consultas [from, to+1)). */
export const nextDay = (date: string): string => addDays(date, 1);
