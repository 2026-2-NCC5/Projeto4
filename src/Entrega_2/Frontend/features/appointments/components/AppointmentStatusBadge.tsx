import React from 'react';

import { Badge } from '../../../components/ui/Badge';
import type { Appointment } from '../../../types/api';
import { appointmentStatusMeta } from '../labels';

/** Situação do agendamento: ícone + texto (nunca só cor). */
export function AppointmentStatusBadge({ appointment, testID }: { appointment: Pick<Appointment, 'status' | 'events'> & { rescheduledToId?: string | null }; testID?: string }) {
  const meta = appointmentStatusMeta(appointment);
  return <Badge label={meta.label} tone={meta.tone} icon={meta.icon} accessibilityLabel={`Situação: ${meta.label}`} testID={testID} />;
}
