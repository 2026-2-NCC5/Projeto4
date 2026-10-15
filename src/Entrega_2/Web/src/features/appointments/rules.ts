import { formatDateTime } from '@/lib/format';
import type { StaffAppointment } from '@/types/api';
import { isActive, STATUS_META } from './labels';

export interface StaffActionState {
  confirm: boolean;
  complete: boolean;
  noShow: boolean;
  cancel: boolean;
  /** por que alguma ação está indisponível (texto para a equipe) */
  hints: string[];
}

/**
 * Espelha as transições aceitas por PATCH /api/asa/appointments/:id — o servidor confere de novo e responde
 * 409 (invalid_transition / appointment_not_active / appointment_changed) se algo mudou:
 * confirmar só de "agendado" e antes do fim; concluir/ausência só depois do início; encerrados não mudam.
 */
export function staffActionState(appointment: Pick<StaffAppointment, 'status' | 'startsAt' | 'endsAt'>, now: Date): StaffActionState {
  const active = isActive(appointment.status);
  const started = now.getTime() >= Date.parse(appointment.startsAt);
  const ended = now.getTime() >= Date.parse(appointment.endsAt);
  const hints: string[] = [];
  if (!active) {
    hints.push(`Atendimento encerrado (${STATUS_META[appointment.status].label.toLowerCase()}): a situação não pode mais ser alterada.`);
  } else {
    if (appointment.status === 'scheduled' && ended) hints.push('O horário já terminou: não é mais possível confirmar.');
    if (!started) hints.push(`Concluir e registrar ausência ficam disponíveis a partir do início do horário (${formatDateTime(appointment.startsAt)}).`);
  }
  return {
    confirm: active && appointment.status === 'scheduled' && !ended,
    complete: active && started,
    noShow: active && started,
    cancel: active,
    hints,
  };
}
