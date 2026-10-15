import type { Appointment, AppointmentCatalog, AppointmentList } from '../../../types/api';
import { useSupportResource, type SupportResource } from '../../support/hooks/useSupportResource';
import { getAppointmentsApi, type AppointmentScope } from '../api';
import { APPOINTMENTS } from '../config';
import { ACTIVE_APPOINTMENT_STATUSES } from '../labels';

/** Chaves do cache local (por usuário): a lista e o detalhe aparecem na hora, inclusive offline. */
export const appointmentCacheKeys = {
  catalog: 'appointments:catalog',
  list: (scope: AppointmentScope) => `appointments:${scope}`,
  detail: (id: string) => `appointment:${id}`,
} as const;

/** Assuntos, modalidades e política (antecedência, prazo de alteração, limite de ativos). */
export function useAppointmentCatalog(options: { enabled?: boolean } = {}): SupportResource<AppointmentCatalog> {
  return useSupportResource(appointmentCacheKeys.catalog, () => getAppointmentsApi().getCatalog(), { enabled: options.enabled ?? true });
}

/** "Próximos" (ativos e ainda não encerrados) ou "Histórico" (realizados, cancelados e passados). */
export function useAppointmentList(scope: AppointmentScope, options: { enabled?: boolean } = {}): SupportResource<AppointmentList> {
  return useSupportResource(appointmentCacheKeys.list(scope), () => getAppointmentsApi().list(scope), { enabled: options.enabled ?? true });
}

/** Detalhe do agendamento, atualizado em segundo plano enquanto a tela está aberta (ex.: confirmação do ASA). */
export function useAppointment(id: string, options: { enabled?: boolean; poll?: boolean } = {}): SupportResource<Appointment> {
  const poll = options.poll ?? true;
  return useSupportResource(appointmentCacheKeys.detail(id), () => getAppointmentsApi().get(id), { enabled: options.enabled ?? true, ...(poll ? { pollMs: APPOINTMENTS.DETAIL_POLL_MS } : {}) });
}

export interface NextAppointment {
  appointment: Appointment | null;
  resource: SupportResource<AppointmentList>;
}

/** Próximo atendimento ativo (agendado ou confirmado), para o Início e Serviços. */
export function useNextAppointment(options: { enabled?: boolean } = {}): NextAppointment {
  const resource = useAppointmentList('upcoming', options);
  const appointment =
    [...(resource.data?.items ?? [])].filter((item) => ACTIVE_APPOINTMENT_STATUSES.includes(item.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  return { appointment, resource };
}
