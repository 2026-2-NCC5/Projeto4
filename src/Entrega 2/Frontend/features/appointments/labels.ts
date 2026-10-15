import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';

import type { BadgeTone } from '../../components/ui/Badge';
import type { Appointment, AppointmentMode, AppointmentSlot, AppointmentStatus } from '../../types/api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AppointmentStatusMeta {
  label: string;
  tone: BadgeTone;
  /** glifo convertido em ícone pelo Badge (status nunca só por cor) */
  icon: string;
  description: string;
}

/** O estudante nunca vê o identificador técnico da situação. */
export const APPOINTMENT_STATUS: Record<AppointmentStatus, AppointmentStatusMeta> = {
  scheduled: { label: 'Agendado', tone: 'info', icon: '◷', description: 'Seu horário está reservado. O ASA confirma em breve.' },
  confirmed: { label: 'Confirmado', tone: 'success', icon: '✓', description: 'O ASA confirmou o seu horário.' },
  completed: { label: 'Realizado', tone: 'neutral', icon: '✓', description: 'Este atendimento já aconteceu.' },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: '⊘', description: 'Este agendamento foi cancelado.' },
  no_show: { label: 'Ausência registrada', tone: 'warning', icon: '⚠', description: 'O ASA registrou que você não compareceu neste horário.' },
};

const RESCHEDULED: AppointmentStatusMeta = { label: 'Remarcado', tone: 'neutral', icon: 'ⓘ', description: 'Este horário foi trocado por um novo agendamento.' };

/** Um cancelamento que veio de uma remarcação aparece como "Remarcado" (o novo horário é outro agendamento). */
export function appointmentStatusMeta(appointment: Pick<Appointment, 'status' | 'events'> & { rescheduledToId?: string | null }): AppointmentStatusMeta {
  if (appointment.status === 'cancelled' && (appointment.rescheduledToId || appointment.events.some((event) => event.type === 'rescheduled'))) return RESCHEDULED;
  return APPOINTMENT_STATUS[appointment.status] ?? APPOINTMENT_STATUS.scheduled;
}

export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['scheduled', 'confirmed'];

export const MODE_META: Record<AppointmentMode, { label: string; icon: IconName }> = {
  presencial: { label: 'Presencial', icon: 'business-outline' },
  online: { label: 'Online', icon: 'videocam-outline' },
};

export function modeLabel(mode: AppointmentMode): string {
  return MODE_META[mode]?.label ?? mode;
}

/** "Presencial · Central de atendimento ASA" · "Online" */
export function placeLabel(mode: AppointmentMode, location: string | null | undefined): string {
  return [modeLabel(mode), mode === 'presencial' ? location : null].filter(Boolean).join(' · ');
}

/** Uma opção = horário + modalidade + local (v1.8: o aluno escolhe o local e a API reserva exatamente aquele). */
export function slotKey(slot: Pick<AppointmentSlot, 'startsAt' | 'mode' | 'location'>): string {
  return `${slot.startsAt}|${slot.mode}|${slot.location ?? ''}`;
}

export function sameSlot(a: Pick<AppointmentSlot, 'startsAt' | 'mode' | 'location'> | null | undefined, b: Pick<AppointmentSlot, 'startsAt' | 'mode' | 'location'>): boolean {
  return Boolean(a) && slotKey(a as AppointmentSlot) === slotKey(b);
}

/** Horários livres sem repetição: o mesmo início em locais diferentes vira uma opção por local. */
export function uniqueSlots(slots: readonly AppointmentSlot[]): AppointmentSlot[] {
  const seen = new Set<string>();
  const unique: AppointmentSlot[] = [];
  for (const slot of slots) {
    const key = slotKey(slot);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(slot);
  }
  return unique.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || (a.location ?? '').localeCompare(b.location ?? ''));
}
