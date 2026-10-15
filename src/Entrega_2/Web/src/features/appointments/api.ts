import { api, isApiError } from '@/services/api/client';
import type {
  Appointment,
  AppointmentCatalog,
  AppointmentCreateRequest,
  AppointmentList,
  AppointmentMode,
  AppointmentRescheduleRequest,
  AppointmentSlotList,
  AvailabilityList,
  AvailabilityRule,
  AvailabilityRuleInput,
  AvailabilityRuleUpdate,
  StaffAppointment,
  StaffAppointmentList,
  StaffAppointmentUpdateRequest,
} from '@/types/api';

const enc = encodeURIComponent;

export type AppointmentScope = 'upcoming' | 'past' | 'all';

/** Horários livres não dependem do assunto (a disponibilidade é da equipe, não por tema). */
export interface SlotQuery {
  /** AAAA-MM-DD no fuso da instituição (máximo de 31 dias por consulta) */
  from: string;
  to: string;
  mode?: AppointmentMode;
}

/** Agendamentos do aluno (GET/POST /api/appointments…). O servidor decide prazos e permissões. */
export const appointmentsApi = {
  catalog: () => api.get<AppointmentCatalog>('/api/appointments/catalog'),
  slots: (query: SlotQuery) => api.get<AppointmentSlotList>('/api/appointments/slots', { query: { ...query } }),
  list: (scope: AppointmentScope) => api.get<AppointmentList>('/api/appointments', { query: { scope } }),
  get: (id: string) => api.get<Appointment>(`/api/appointments/${enc(id)}`),
  /** 201 = criado, 200 = mesma `clientRequestId` (devolve o agendamento já registrado) */
  book: (body: AppointmentCreateRequest) => api.post<Appointment>('/api/appointments', body),
  cancel: (id: string, reason?: string) => api.post<Appointment>(`/api/appointments/${enc(id)}/cancel`, reason ? { reason } : {}),
  /** troca atômica: o atual vira "cancelado (remarcado)" e a resposta é o NOVO agendamento */
  reschedule: (id: string, body: AppointmentRescheduleRequest) => api.post<Appointment>(`/api/appointments/${enc(id)}/reschedule`, body),
};

/** Arquivo .ics servido pela própria API (mesma origem: o cookie de sessão vai junto no download). */
export const calendarHref = (id: string): string => `/api/appointments/${enc(id)}/calendar.ics`;

export interface StaffAppointmentQuery {
  from: string;
  to: string;
  /** lista separada por vírgula de AppointmentStatus */
  status?: string;
  attendant?: 'mine';
}

/** Agenda da equipe ASA (GET/PATCH /api/asa/appointments…). */
export const staffAppointmentsApi = {
  list: (query: StaffAppointmentQuery) => api.get<StaffAppointmentList>('/api/asa/appointments', { query: { ...query } }),
  get: (id: string) => api.get<StaffAppointment>(`/api/asa/appointments/${enc(id)}`),
  update: (id: string, body: StaffAppointmentUpdateRequest) => api.patch<StaffAppointment>(`/api/asa/appointments/${enc(id)}`, body),
};

/** Disponibilidade dos atendentes (GET/POST/PATCH /api/asa/availability…). */
export const availabilityApi = {
  /** `mine` = só as faixas de quem está logado; sem parâmetro = equipe inteira */
  list: (attendant?: 'mine') => api.get<AvailabilityList>('/api/asa/availability', { query: { attendant } }),
  create: (body: AvailabilityRuleInput) => api.post<AvailabilityRule>('/api/asa/availability', body),
  update: (id: string, body: AvailabilityRuleUpdate) => api.patch<AvailabilityRule>(`/api/asa/availability/${enc(id)}`, body),
};

export const appointmentKeys = {
  /** prefixo do aluno (catálogo, horários, listas e detalhes) */
  all: ['appointments'] as const,
  catalog: ['appointments', 'catalog'] as const,
  slotsAll: ['appointments', 'slots'] as const,
  slots: (query: SlotQuery) => ['appointments', 'slots', query] as const,
  lists: ['appointments', 'list'] as const,
  list: (scope: AppointmentScope) => ['appointments', 'list', scope] as const,
  detail: (id: string) => ['appointments', 'detail', id] as const,
  /** prefixo da equipe (agenda e detalhes) */
  staff: ['asa', 'appointments'] as const,
  staffLists: ['asa', 'appointments', 'list'] as const,
  staffList: (query: StaffAppointmentQuery) => ['asa', 'appointments', 'list', query] as const,
  staffDetail: (id: string) => ['asa', 'appointments', 'detail', id] as const,
  availability: ['asa', 'availability'] as const,
  availabilityList: (scope: 'mine' | 'team') => ['asa', 'availability', scope] as const,
};

/**
 * Chave de idempotência ([A-Za-z0-9._:-], 8–128 caracteres) gerada UMA vez por fluxo de agendamento ou
 * remarcação: repetir o envio após falha de rede devolve o mesmo registro em vez de duplicar.
 */
export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `appt-${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `appt-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export const reasonOf = (error: unknown): string | null => (isApiError(error) ? error.reason : null);
/** 403 `feature_disabled`: a administração desligou os agendamentos neste ambiente. */
export const isFeatureDisabled = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden' && error.reason === 'feature_disabled';
/** 503 `database_required`: agendamentos dependem do PostgreSQL. */
export const isDatabaseRequired = (error: unknown): boolean => isApiError(error) && error.status === 503 && error.reason === 'database_required';
export const isForbidden = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden';
export const isNotFound = (error: unknown): boolean => isApiError(error) && error.kind === 'not_found';
export const isConflict = (error: unknown): boolean => isApiError(error) && error.kind === 'conflict';
/** Falha em que o servidor pode ter recebido o pedido: repetir com a mesma chave é seguro. */
export const isTransientError = (error: unknown): boolean =>
  isApiError(error) && !isDatabaseRequired(error) && ['network', 'offline', 'timeout', 'server', 'dependency', 'contract'].includes(error.kind);
/** Erros que valem para a página inteira (recurso desligado, sem banco, sem permissão). */
export const isBlockingError = (error: unknown): boolean => isFeatureDisabled(error) || isDatabaseRequired(error) || isForbidden(error);

/** Erros de campo devolvidos pela API (details[].field → mensagem). */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    const field = detail.field.split('.')[0] ?? detail.field;
    if (!result[field]) result[field] = detail.message;
  }
  return result;
}
