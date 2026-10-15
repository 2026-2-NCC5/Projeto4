import type { AppointmentMode, AppointmentStatus } from '../contracts/mobileApi.v1.js';

export interface AvailabilityRecord {
  id: string;
  attendantUserId: string;
  attendantName: string;
  weekday: number;
  /** "HH:MM" */
  startTime: string;
  endTime: string;
  slotMinutes: number;
  mode: AppointmentMode;
  location: string | null;
  /** YYYY-MM-DD */
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  updatedAt: Date;
}

export interface NewAvailability {
  attendantUserId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  mode: AppointmentMode;
  location: string | null;
  validFrom: string;
  validUntil: string | null;
  createdBy: string;
}

export type AvailabilityPatch = Partial<Pick<AvailabilityRecord, 'startTime' | 'endTime' | 'slotMinutes' | 'mode' | 'location' | 'validUntil' | 'active'>>;

export interface AppointmentRecord {
  id: string;
  protocol: string;
  studentId: string;
  attendantUserId: string;
  availabilityId: string | null;
  topicId: string;
  startsAt: Date;
  endsAt: Date;
  mode: AppointmentMode;
  location: string | null;
  status: AppointmentStatus;
  studentNotes: string | null;
  staffNotes: string | null;
  cancelReason: string | null;
  cancelledBy: 'student' | 'staff' | null;
  rescheduledFrom: string | null;
  /** agendamento que substituiu este (remarcação) */
  rescheduledTo: string | null;
  ticketId: string | null;
  clientRequestId: string;
  channel: 'app' | 'web';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentEventRecord {
  id: string;
  appointmentId: string;
  type: 'scheduled' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show' | 'note';
  visibility: 'public' | 'internal';
  title: string;
  description: string | null;
  actorType: 'student' | 'staff' | 'system';
  actorUserId: string | null;
  createdAt: Date;
}

export type NewAppointmentEvent = Omit<AppointmentEventRecord, 'id' | 'appointmentId' | 'createdAt'>;

export interface NewAppointment {
  id: string;
  studentId: string;
  attendantUserId: string;
  availabilityId: string | null;
  topicId: string;
  startsAt: Date;
  endsAt: Date;
  mode: AppointmentMode;
  location: string | null;
  studentNotes: string | null;
  rescheduledFrom: string | null;
  ticketId: string | null;
  clientRequestId: string;
  channel: 'app' | 'web';
  now: Date;
}

export type AppointmentPatch = Partial<Pick<AppointmentRecord, 'status' | 'staffNotes' | 'cancelReason' | 'cancelledBy'>>;

export interface BusyInterval {
  attendantUserId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface StaffAppointmentRow extends AppointmentRecord {
  studentName: string;
  registrationNumber: string;
  attendantName: string;
}

/** Conflito de horário detectado pelo banco (restrições de exclusão). */
export class OverlapError extends Error {
  constructor(readonly kind: 'attendant' | 'student') {
    super(`overlap:${kind}`);
    this.name = 'OverlapError';
  }
}

export interface AppointmentRepository {
  /** `excludeDemo` (demonstração desligada): janelas de atendentes fictícios não geram horários nem aparecem para a equipe */
  listAvailability(filter: { attendantUserId?: string; activeOnly?: boolean; excludeDemo?: boolean }): Promise<AvailabilityRecord[]>;
  findAvailability(id: string): Promise<AvailabilityRecord | null>;
  createAvailability(input: NewAvailability): Promise<AvailabilityRecord>;
  updateAvailability(id: string, patch: AvailabilityPatch): Promise<AvailabilityRecord | null>;
  /** agendamentos ativos que tocam o intervalo [from, to) */
  busyIntervals(from: Date, to: Date): Promise<BusyInterval[]>;
  /** quantos agendamentos ativos cada atendente já tem no intervalo (para distribuir a carga) */
  loadByAttendant(attendantIds: string[], from: Date, to: Date): Promise<Map<string, number>>;
  findById(id: string): Promise<AppointmentRecord | null>;
  findByClientRequest(studentId: string, clientRequestId: string): Promise<AppointmentRecord | null>;
  listByStudent(studentId: string, scope: 'upcoming' | 'past' | 'all', now: Date, limit: number): Promise<AppointmentRecord[]>;
  countActiveByStudent(studentId: string, now: Date): Promise<number>;
  /** Insere o agendamento e o evento na mesma transação. Lança OverlapError em conflito de horário. */
  insert(input: NewAppointment, event: NewAppointmentEvent): Promise<AppointmentRecord>;
  /** Remarcação atômica: cancela o atual (se ainda na versão esperada) e cria o novo; nada muda se falhar. */
  reschedule(input: { current: AppointmentRecord; reason: string; next: NewAppointment; events: { cancelled: NewAppointmentEvent; scheduled: NewAppointmentEvent } }): Promise<AppointmentRecord | null>;
  /** Atualiza se ainda estiver na versão esperada (null = mudou no meio do caminho). */
  update(id: string, expectedVersion: number, patch: AppointmentPatch, event: NewAppointmentEvent | null, now: Date): Promise<AppointmentRecord | null>;
  listEvents(appointmentId: string, includeInternal: boolean): Promise<AppointmentEventRecord[]>;
  listForStaff(filter: { from: Date; to: Date; statuses?: string[]; attendantUserId?: string; excludeDemo: boolean }): Promise<StaffAppointmentRow[]>;
  findForStaff(id: string): Promise<StaffAppointmentRow | null>;
  /** contagens por situação de agendamentos que começam no intervalo */
  countByStatus(from: Date, to: Date, excludeDemo: boolean): Promise<Partial<Record<AppointmentStatus, number>>>;
  /** próximos agendamentos ativos por aluno (contexto de atendimento) */
  upcomingCountByStudent(studentIds: string[], now: Date): Promise<Map<string, number>>;
}
