import type {
  Appointment,
  AppointmentCatalog,
  AppointmentMode,
  AppointmentSlot,
  AppointmentSlotList,
  AppointmentStatus,
  AvailabilityRule,
  StaffAppointment,
  StaffAppointmentList,
} from '@/types/api';
import { dateRange } from './dates';

/** Dados fixos para os testes (datas absolutas em UTC; a interface mostra em America/Sao_Paulo, UTC−3). */
export function makeCatalog(): AppointmentCatalog {
  return {
    topics: [
      { id: 'enrollment', label: 'Matrícula', description: 'Rematrícula, trancamento e ajustes de matrícula.' },
      { id: 'documents', label: 'Documentos', description: 'Declarações, histórico e certificados.' },
      { id: 'financial', label: 'Financeiro', description: 'Boletos, acordos e bolsas.' },
    ],
    modes: [
      { id: 'presencial', label: 'Presencial', description: 'Atendimento no ASA, no horário marcado. Chegue alguns minutos antes.' },
      { id: 'online', label: 'Online', description: 'Videochamada. O link é combinado pela equipe do ASA na confirmação.' },
    ],
    policy: { minLeadHours: 2, maxDaysAhead: 30, cancellationMinHours: 2, maxActivePerStudent: 2, timezone: 'America/Sao_Paulo' },
  };
}

export function makeSlot(startsAt: string, minutes = 30, location: string | null = 'Sala 3 — Prédio ASA', mode: AppointmentMode = 'presencial'): AppointmentSlot {
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(), mode, location, available: 1 };
}

/**
 * 15 a 28/10/2026: sexta 16/10 tem 09:00 e 09:30 (SP); segunda 19/10 tem 14:00 (SP); os demais dias vêm vazios,
 * como a API faz. `without` remove horários (simula reserva feita por outra pessoa); `extra` acrescenta horários
 * (ex.: o mesmo início em outro local).
 */
export function makeSlotList(options: { without?: string[]; extra?: Record<string, AppointmentSlot[]> } = {}): AppointmentSlotList {
  const base: Record<string, AppointmentSlot[]> = {
    '2026-10-16': [makeSlot('2026-10-16T12:00:00.000Z'), makeSlot('2026-10-16T12:30:00.000Z')],
    '2026-10-19': [makeSlot('2026-10-19T17:00:00.000Z')],
  };
  const slots: Record<string, AppointmentSlot[]> = { ...base };
  for (const [date, extra] of Object.entries(options.extra ?? {})) slots[date] = [...(slots[date] ?? []), ...extra];
  const removed = new Set(options.without ?? []);
  return {
    from: '2026-10-15',
    to: '2026-10-28',
    timezone: 'America/Sao_Paulo',
    days: dateRange('2026-10-15', '2026-10-28').map((date) => ({ date, slots: (slots[date] ?? []).filter((slot) => !removed.has(slot.startsAt)) })),
    generatedAt: '2026-10-15T12:00:00.000Z',
  };
}

export function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    protocol: 'AGD-2026-00012',
    status: 'scheduled',
    topicId: 'enrollment',
    topicLabel: 'Matrícula',
    mode: 'presencial',
    location: 'Sala 3 — Prédio ASA',
    startsAt: '2026-10-20T13:00:00.000Z',
    endsAt: '2026-10-20T13:30:00.000Z',
    studentNotes: 'Quero tirar dúvidas sobre a rematrícula.',
    channel: 'web',
    attendantLabel: 'Equipe ASA',
    ticketId: null,
    rescheduledFromId: null,
    rescheduledToId: null,
    cancelReason: null,
    cancelledBy: null,
    canCancel: true,
    canReschedule: true,
    changeDeadline: '2026-10-20T11:00:00.000Z',
    createdAt: '2026-10-14T20:00:00.000Z',
    updatedAt: '2026-10-14T20:00:00.000Z',
    events: [{ id: 'ev-1', type: 'scheduled', title: 'Atendimento agendado', description: 'Matrícula · Presencial', actorType: 'student', createdAt: '2026-10-14T20:00:00.000Z' }],
    ...overrides,
  };
}

export function makeStaffAppointment(overrides: Partial<StaffAppointment> = {}): StaffAppointment {
  const base = makeAppointment();
  return {
    ...base,
    attendantLabel: 'Atendente ASA',
    canReschedule: false,
    student: { id: 'student-1', fullName: 'Maria Souza', registrationNumber: '2026001' },
    attendant: { id: 'user-institutional_staff', fullName: 'Atendente ASA' },
    staffNotes: null,
    events: [{ ...base.events[0]!, visibility: 'public', actorName: 'Maria Souza' }],
    ...overrides,
  };
}

export function makeStaffList(items: StaffAppointment[], from = '2026-10-12', to = '2026-10-18'): StaffAppointmentList {
  const counts: Record<AppointmentStatus, number> = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  for (const item of items) counts[item.status] += 1;
  // a lista da API não traz eventos (só o detalhe)
  return { from, to, items: items.map((item) => ({ ...item, events: [] })), counts };
}

export function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: 'rule-1',
    attendant: { id: 'user-institutional_staff', fullName: 'Atendente ASA' },
    weekday: 1,
    startTime: '09:00',
    endTime: '12:00',
    slotMinutes: 30,
    mode: 'presencial',
    location: 'Sala 3 — Prédio ASA',
    validFrom: '2026-10-01',
    validUntil: null,
    active: true,
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}
