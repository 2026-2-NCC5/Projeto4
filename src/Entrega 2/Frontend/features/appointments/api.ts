import { createCorrelationId, request } from '../../services/apiClient';
import type {
  Appointment,
  AppointmentCancelRequest,
  AppointmentCatalog,
  AppointmentCreateRequest,
  AppointmentList,
  AppointmentMode,
  AppointmentRescheduleRequest,
  AppointmentSlotList,
} from '../../types/api';

import { APPOINTMENT_ROUTES } from './config';

export type AppointmentScope = 'upcoming' | 'past' | 'all';

export interface SlotsQuery {
  /** YYYY-MM-DD no fuso da instituição */
  from: string;
  to: string;
  mode?: AppointmentMode | null;
}

/** Operações de agendamento usadas pelo app (as telas nunca montam URLs). */
export interface AppointmentsApi {
  getCatalog(): Promise<AppointmentCatalog>;
  getSlots(query: SlotsQuery): Promise<AppointmentSlotList>;
  list(scope: AppointmentScope): Promise<AppointmentList>;
  get(id: string): Promise<Appointment>;
  /** 201 (novo) ou 200 (mesmo `clientRequestId`: devolve o agendamento já criado) */
  create(body: AppointmentCreateRequest): Promise<Appointment>;
  cancel(id: string, body: AppointmentCancelRequest): Promise<Appointment>;
  /** Devolve o NOVO agendamento; o anterior passa a "cancelado" (remarcado). */
  reschedule(id: string, body: AppointmentRescheduleRequest): Promise<Appointment>;
}

export function slotsPath(query: SlotsQuery): string {
  const params = [`from=${encodeURIComponent(query.from)}`, `to=${encodeURIComponent(query.to)}`];
  if (query.mode) params.push(`mode=${encodeURIComponent(query.mode)}`);
  return `${APPOINTMENT_ROUTES.slots}?${params.join('&')}`;
}

export const httpAppointmentsApi: AppointmentsApi = {
  getCatalog: () => request<AppointmentCatalog>(APPOINTMENT_ROUTES.catalog),
  getSlots: (query) => request<AppointmentSlotList>(slotsPath(query)),
  list: (scope) => request<AppointmentList>(`${APPOINTMENT_ROUTES.list}?scope=${scope}`),
  get: (id) => request<Appointment>(APPOINTMENT_ROUTES.appointment(id)),
  create: (body) => request<Appointment>(APPOINTMENT_ROUTES.list, { method: 'POST', body }),
  cancel: (id, body) => request<Appointment>(APPOINTMENT_ROUTES.cancel(id), { method: 'POST', body }),
  reschedule: (id, body) => request<Appointment>(APPOINTMENT_ROUTES.reschedule(id), { method: 'POST', body }),
};

let current: AppointmentsApi | null = null;

export function getAppointmentsApi(): AppointmentsApi {
  return current ?? httpAppointmentsApi;
}

/** Substitui a implementação (testes e previews). `null` volta à API real. */
export function setAppointmentsApi(api: AppointmentsApi | null): void {
  current = api;
}

/** Chave de idempotência de uma tentativa de agendamento (padrão aceito pela API: [A-Za-z0-9._:-]{8,128}). */
export function newAppointmentRequestId(): string {
  return createCorrelationId().replace(/^corr-/, 'appt-req-');
}
