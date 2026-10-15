import type { RouteObject } from 'react-router';
import { page } from './lazy';

/** Rotas de agendamentos: aluno (/aluno/agendamentos*) e equipe (/asa/agendamentos*). */
export const studentAppointmentRoutes: RouteObject[] = [
  // ?agendamento=<id> abre os detalhes (links dos avisos)
  { path: 'agendamentos', element: page(() => import('@/pages/student/appointments/AppointmentsPage')) },
  { path: 'agendamentos/novo', element: page(() => import('@/pages/student/appointments/BookAppointmentPage')) },
];

export const asaAppointmentRoutes: RouteObject[] = [
  // ?agendamento=<id> abre os detalhes; ?semana=AAAA-MM-DD, ?visao=semana, ?status=…, ?meus=1 ficam no endereço
  { path: 'agendamentos', element: page(() => import('@/pages/asa/appointments/StaffAgendaPage')) },
  { path: 'agendamentos/disponibilidade', element: page(() => import('@/pages/asa/appointments/AvailabilityPage')) },
];
