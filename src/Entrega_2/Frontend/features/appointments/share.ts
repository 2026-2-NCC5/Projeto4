import type { Appointment } from '../../types/api';

import { APPOINTMENTS } from './config';
import { formatAppointmentDate, formatTimeRange, timezoneLabel } from './format';
import { appointmentStatusMeta, placeLabel } from './labels';

/**
 * Resumo em texto para "Compartilhar" (mensagem, e-mail, anotação). É só texto: nada é adicionado a calendários.
 */
export function appointmentShareText(appointment: Appointment, timeZone: string = APPOINTMENTS.TIMEZONE): string {
  const lines = [
    `Atendimento com o ASA — ${appointment.topicLabel}`,
    `${formatAppointmentDate(appointment.startsAt, timeZone)}, das ${formatTimeRange(appointment.startsAt, appointment.endsAt, timeZone)} (${timezoneLabel(timeZone)})`,
    placeLabel(appointment.mode, appointment.location),
    appointment.mode === 'online' ? 'O link da videochamada é combinado pela equipe do ASA na confirmação.' : null,
    `Situação: ${appointmentStatusMeta(appointment).label}`,
    `Protocolo: ${appointment.protocol}`,
  ];
  return lines.filter(Boolean).join('\n');
}
