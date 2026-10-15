import React from 'react';

import type { AppointmentRoute } from '../../types/ui';

import { AppointmentDetailScreen } from './AppointmentDetailScreen';
import { AppointmentsScreen } from './AppointmentsScreen';
import { BookAppointmentScreen } from './BookAppointmentScreen';

/** Telas dos agendamentos: "Meus agendamentos", agendar/remarcar e detalhe. */
export function AppointmentsRouter({ route }: { route: AppointmentRoute }) {
  switch (route.screen) {
    case 'appointment-book':
      // key: remarcar outro agendamento (ou agendar depois de remarcar) começa o fluxo do zero.
      return <BookAppointmentScreen key={route.rescheduleId ?? 'new'} rescheduleId={route.rescheduleId} />;
    case 'appointment':
      return <AppointmentDetailScreen key={route.id} appointmentId={route.id} />;
    default:
      return <AppointmentsScreen />;
  }
}
