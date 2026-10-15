import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Appointment, StaffAppointment } from '@/types/api';
import { appointmentKeys, appointmentsApi, type AppointmentScope } from './api';

/** Relógio para regras que dependem do horário (prazos, ações da equipe) e textos "há 2 min". */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Assuntos, modalidades e política (antecedência, horizonte, prazo de cancelamento, limite de ativos). */
export function useAppointmentCatalog() {
  return useQuery({ queryKey: appointmentKeys.catalog, queryFn: appointmentsApi.catalog, staleTime: 10 * 60_000 });
}

export function useMyAppointments(scope: AppointmentScope, options: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: appointmentKeys.list(scope), queryFn: () => appointmentsApi.list(scope), ...options });
}

/** Depois de agendar, cancelar ou remarcar: listas, horários livres e avisos voltam a buscar. */
export function refreshStudentViews(queryClient: QueryClient, appointment?: Appointment): void {
  if (appointment) queryClient.setQueryData(appointmentKeys.detail(appointment.id), appointment);
  void queryClient.invalidateQueries({ queryKey: appointmentKeys.lists });
  void queryClient.invalidateQueries({ queryKey: appointmentKeys.slotsAll });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

/** Depois de uma ação da equipe: detalhe gravado, agenda, painel e avisos atualizados. */
export function refreshStaffViews(queryClient: QueryClient, appointment?: StaffAppointment): void {
  if (appointment) queryClient.setQueryData(appointmentKeys.staffDetail(appointment.id), appointment);
  void queryClient.invalidateQueries({ queryKey: appointmentKeys.staffLists });
  void queryClient.invalidateQueries({ queryKey: ['asa', 'dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
