import { randomUUID } from 'node:crypto';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
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
  UserRole,
} from '../contracts/mobileApi.v1.js';
import { hasPermission } from '../auth/permissions.js';
import { ConflictError, DependencyError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from '../errors/AppError.js';
import { addDays, dateRange, isCalendarDate, localDate, localMidnight } from '../lib/zonedTime.js';
import type { AuditActor, AuditService } from '../platform/auditService.js';
import type { InboxService } from '../platform/inboxService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { SettingsService } from '../platform/settingsService.js';
import type { Repositories } from '../repositories/types.js';
import { findCategory, SUPPORT_CATEGORIES } from '../support/catalog.js';
import { appointmentIcs } from './ics.js';
import { generateSlots } from './slots.js';
import { OverlapError, type AppointmentEventRecord, type AppointmentRecord, type AppointmentRepository, type AvailabilityRecord, type NewAppointmentEvent, type StaffAppointmentRow } from './types.js';

const HOUR_MS = 3_600_000;
const MAX_SLOT_RANGE_DAYS = 31;
const ACTIVE = new Set(['scheduled', 'confirmed']);
const TEAM_LABEL = 'Equipe ASA';

export const MODE_META: Record<AppointmentMode, { label: string; description: string }> = {
  presencial: { label: 'Presencial', description: 'Atendimento no ASA, no horário marcado. Chegue alguns minutos antes.' },
  online: { label: 'Online', description: 'Videochamada. O link é combinado pela equipe do ASA na confirmação.' },
};

export interface AppointmentsConfig {
  timeZone: string;
  rateLimitEnabled: boolean;
  excludeDemo: boolean;
}

interface StudentRef {
  id: string;
  userId: string;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Agendamentos com o ASA. Horários vêm da disponibilidade real; a reserva confere de novo o horário e o
 * banco impede sobreposição (duas pessoas no mesmo horário recebem 409). Ações do aluno exigem o próprio
 * agendamento; a equipe confirma, conclui, registra ausência ou cancela com justificativa.
 */
export class AppointmentService {
  private readonly bookingLimiter: FixedWindowLimiter;

  constructor(
    private readonly repos: Repositories,
    private readonly store: AppointmentRepository | null,
    private readonly settings: SettingsService,
    private readonly platform: PlatformService,
    private readonly inbox: InboxService,
    private readonly audit: AuditService,
    private readonly config: AppointmentsConfig,
    private readonly now: () => Date,
  ) {
    this.bookingLimiter = new FixedWindowLimiter({ windowMs: HOUR_MS, max: 15 }, () => this.now().getTime());
  }

  private repo(): AppointmentRepository {
    if (!this.store) throw new DependencyError('Agendamentos exigem o banco de dados PostgreSQL.', undefined, 'database_required');
    return this.store;
  }

  /** Recurso ligado + banco disponível + política vigente (parâmetros da administração). */
  private async ready() {
    await this.platform.assertEnabled('appointments');
    const repo = this.repo();
    const policy = await this.settings.get('appointments.policy');
    return { repo, policy };
  }

  private format(date: Date): string {
    const day = new Intl.DateTimeFormat('pt-BR', { timeZone: this.config.timeZone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
    const time = new Intl.DateTimeFormat('pt-BR', { timeZone: this.config.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    return `${day} às ${time}`;
  }

  private topicLabel(topicId: string): string {
    return findCategory(topicId)?.label ?? topicId;
  }

  private deadline(record: AppointmentRecord, cancellationMinHours: number): Date {
    return new Date(record.startsAt.getTime() - cancellationMinHours * HOUR_MS);
  }

  private async view(record: AppointmentRecord, cancellationMinHours: number): Promise<Appointment> {
    const events = await this.repo().listEvents(record.id, false);
    const changeDeadline = this.deadline(record, cancellationMinHours);
    const changeable = ACTIVE.has(record.status) && this.now() <= changeDeadline;
    return {
      id: record.id,
      protocol: record.protocol,
      status: record.status,
      topicId: record.topicId,
      topicLabel: this.topicLabel(record.topicId),
      mode: record.mode,
      location: record.location,
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt.toISOString(),
      studentNotes: record.studentNotes,
      channel: record.channel,
      attendantLabel: TEAM_LABEL,
      ticketId: record.ticketId,
      rescheduledFromId: record.rescheduledFrom,
      rescheduledToId: record.rescheduledTo,
      cancelReason: record.cancelReason,
      cancelledBy: record.cancelledBy,
      canCancel: changeable,
      canReschedule: changeable,
      changeDeadline: ACTIVE.has(record.status) ? changeDeadline.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      events: events.map((event) => ({ id: event.id, type: event.type, title: event.title, description: event.description, actorType: event.actorType, createdAt: event.createdAt.toISOString() })),
    };
  }

  // ------------------------------------------------------------------ aluno

  async catalog(): Promise<AppointmentCatalog> {
    await this.platform.assertEnabled('appointments');
    const policy = await this.settings.get('appointments.policy');
    return {
      topics: SUPPORT_CATEGORIES.map((category) => ({ id: category.id, label: category.label, description: category.description })),
      modes: (Object.keys(MODE_META) as AppointmentMode[]).map((id) => ({ id, ...MODE_META[id] })),
      policy: { ...policy, timezone: this.config.timeZone },
    };
  }

  async slots(input: { from?: string; to?: string; mode?: AppointmentMode }): Promise<AppointmentSlotList> {
    const { repo, policy } = await this.ready();
    const now = this.now();
    const today = localDate(now, this.config.timeZone);
    const lastAllowed = localDate(new Date(now.getTime() + policy.maxDaysAhead * 24 * HOUR_MS), this.config.timeZone);
    const from = input.from ?? today;
    const to = input.to ?? addDays(from, 13);
    if (!isCalendarDate(from) || !isCalendarDate(to) || to < from) throw new ValidationError('Período inválido (use AAAA-MM-DD).', [{ field: 'from', message: 'período inválido' }]);
    if (dateRange(from, to).length > MAX_SLOT_RANGE_DAYS) throw new ValidationError(`Consulte no máximo ${MAX_SLOT_RANGE_DAYS} dias por vez.`, [{ field: 'to', message: 'período longo demais' }]);
    const start = from < today ? today : from;
    const end = to > lastAllowed ? lastAllowed : to;
    const days = dateRange(from, to).map((date) => ({ date, slots: [] as AppointmentSlotList['days'][number]['slots'] }));
    if (start <= end) {
      const [rules, busy] = await Promise.all([
        repo.listAvailability({ activeOnly: true, excludeDemo: this.config.excludeDemo }),
        repo.busyIntervals(localMidnight(start, this.config.timeZone), localMidnight(addDays(end, 1), this.config.timeZone)),
      ]);
      const generated = generateSlots({ rules, from: start, to: end, timeZone: this.config.timeZone, now, minLeadHours: policy.minLeadHours, busy, ...(input.mode ? { mode: input.mode } : {}) });
      for (const slot of generated) {
        const day = days.find((item) => item.date === localDate(slot.startsAt, this.config.timeZone));
        day?.slots.push({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), mode: slot.mode, location: slot.location, available: slot.candidates.length });
      }
    }
    return { from, to, timezone: this.config.timeZone, days, generatedAt: now.toISOString() };
  }

  async list(studentId: string, scope: 'upcoming' | 'past' | 'all'): Promise<AppointmentList> {
    const { repo, policy } = await this.ready();
    const records = await repo.listByStudent(studentId, scope, this.now(), 50);
    return { items: await Promise.all(records.map((record) => this.view(record, policy.cancellationMinHours))) };
  }

  private async owned(studentId: string, id: string): Promise<AppointmentRecord> {
    const record = await this.repo().findById(id);
    if (!record) throw new NotFoundError('Agendamento não encontrado.');
    // de outro aluno: 403, como nos chamados (ids aleatórios: confirmar a existência não revela nada útil)
    if (record.studentId !== studentId) throw new ForbiddenError('Este agendamento pertence a outro aluno.');
    return record;
  }

  async get(studentId: string, id: string): Promise<Appointment> {
    const { policy } = await this.ready();
    return this.view(await this.owned(studentId, id), policy.cancellationMinHours);
  }

  /** Confere antecedência e horizonte, devolve os atendentes livres no horário em ordem de menor carga. */
  private async candidatesFor(startsAt: Date, mode: AppointmentMode, minLeadHours: number, maxDaysAhead: number, ignore?: AppointmentRecord, location?: string | null) {
    const repo = this.repo();
    const now = this.now();
    if (Number.isNaN(startsAt.getTime())) throw new ValidationError('Horário inválido.', [{ field: 'startsAt', message: 'data/hora ISO inválida' }]);
    if (startsAt.getTime() < now.getTime() + minLeadHours * HOUR_MS) {
      throw new ValidationError(`Escolha um horário com pelo menos ${minLeadHours} h de antecedência.`, [{ field: 'startsAt', message: 'antecedência insuficiente' }], { reason: 'too_soon' });
    }
    if (startsAt.getTime() > now.getTime() + maxDaysAhead * 24 * HOUR_MS) {
      throw new ValidationError(`A agenda está aberta para os próximos ${maxDaysAhead} dias.`, [{ field: 'startsAt', message: 'fora do horizonte' }], { reason: 'too_far' });
    }
    const day = localDate(startsAt, this.config.timeZone);
    const dayStart = localMidnight(day, this.config.timeZone);
    const dayEnd = localMidnight(addDays(day, 1), this.config.timeZone);
    const [rules, busy] = await Promise.all([repo.listAvailability({ activeOnly: true, excludeDemo: this.config.excludeDemo }), repo.busyIntervals(dayStart, dayEnd)]);
    const freeBusy = ignore ? busy.filter((item) => !(item.attendantUserId === ignore.attendantUserId && item.startsAt.getTime() === ignore.startsAt.getTime())) : busy;
    // o mesmo início pode existir em locais diferentes: com `location` informado, reserva exatamente o local escolhido
    const slot = generateSlots({ rules, from: day, to: day, timeZone: this.config.timeZone, now, minLeadHours, busy: freeBusy, mode }).find(
      (item) => item.startsAt.getTime() === startsAt.getTime() && (location === undefined || (item.location ?? null) === (location ?? null)),
    );
    if (!slot) throw new ConflictError('Esse horário não está mais disponível. Escolha outro.', 'slot_unavailable');
    const load = await repo.loadByAttendant(slot.candidates.map((candidate) => candidate.attendantUserId), dayStart, dayEnd);
    const candidates = [...slot.candidates].sort((a, b) => (load.get(a.attendantUserId) ?? 0) - (load.get(b.attendantUserId) ?? 0) || a.attendantUserId.localeCompare(b.attendantUserId));
    return { slot, candidates };
  }

  private limitBooking(studentId: string): void {
    if (!this.config.rateLimitEnabled) return;
    const result = this.bookingLimiter.hit(studentId);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
  }

  async book(student: StudentRef, actor: AuditActor, body: AppointmentCreateRequest, channel: 'app' | 'web'): Promise<{ appointment: Appointment; created: boolean }> {
    const { repo, policy } = await this.ready();
    const existing = await repo.findByClientRequest(student.id, body.clientRequestId);
    if (existing) return { appointment: await this.view(existing, policy.cancellationMinHours), created: false };
    if (!findCategory(body.topicId)) throw new ValidationError('Assunto inválido.', [{ field: 'topicId', message: 'assunto desconhecido' }]);
    if (body.ticketId) {
      const ticket = await this.repos.support.findTicket(body.ticketId);
      if (!ticket || ticket.studentId !== student.id) throw new ValidationError('Chamado relacionado inválido.', [{ field: 'ticketId', message: 'chamado não encontrado' }]);
    }
    if ((await repo.countActiveByStudent(student.id, this.now())) >= policy.maxActivePerStudent) {
      throw new ConflictError(`Você já tem ${policy.maxActivePerStudent} agendamento(s) ativo(s). Cancele ou aguarde um deles para marcar outro.`, 'active_limit');
    }
    this.limitBooking(student.id);
    const startsAt = new Date(body.startsAt);
    const { slot, candidates } = await this.candidatesFor(startsAt, body.mode, policy.minLeadHours, policy.maxDaysAhead, undefined, body.location);
    const now = this.now();
    const event: NewAppointmentEvent = { type: 'scheduled', visibility: 'public', title: 'Atendimento agendado', description: `${this.topicLabel(body.topicId)} · ${MODE_META[body.mode].label}`, actorType: 'student', actorUserId: student.userId };
    for (const candidate of candidates) {
      try {
        const created = await repo.insert(
          {
            id: `appt-${randomUUID()}`,
            studentId: student.id,
            attendantUserId: candidate.attendantUserId,
            availabilityId: candidate.availabilityId,
            topicId: body.topicId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            mode: slot.mode,
            location: slot.location,
            studentNotes: body.notes?.trim() || null,
            rescheduledFrom: null,
            ticketId: body.ticketId ?? null,
            clientRequestId: body.clientRequestId,
            channel,
            now,
          },
          event,
        );
        await this.afterChange(created, actor, 'appointment.booked', [
          { userId: student.userId, kind: 'appointment_booked', title: 'Atendimento agendado', body: `${created.protocol} · ${this.format(created.startsAt)} · ${this.topicLabel(created.topicId)}` },
          { userId: created.attendantUserId, kind: 'appointment_booked', title: 'Novo agendamento', body: `${this.format(created.startsAt)} · ${this.topicLabel(created.topicId)} (${MODE_META[created.mode].label})` },
        ]);
        return { appointment: await this.view(created, policy.cancellationMinHours), created: true };
      } catch (error) {
        if (error instanceof OverlapError && error.kind === 'student') throw new ConflictError('Você já tem um atendimento nesse horário.', 'student_conflict');
        if (error instanceof OverlapError) continue; // outro aluno reservou este atendente: tenta o próximo livre
        if ((error as { code?: string }).code === '23505') {
          const duplicate = await repo.findByClientRequest(student.id, body.clientRequestId);
          if (duplicate) return { appointment: await this.view(duplicate, policy.cancellationMinHours), created: false };
        }
        throw error;
      }
    }
    throw new ConflictError('Esse horário acabou de ser reservado. Escolha outro.', 'slot_unavailable');
  }

  async cancel(student: StudentRef, actor: AuditActor, id: string, reason: string | undefined): Promise<Appointment> {
    const { repo, policy } = await this.ready();
    const record = await this.owned(student.id, id);
    if (!ACTIVE.has(record.status)) throw new ConflictError('Este agendamento não está ativo.', 'appointment_not_active');
    if (this.now() > this.deadline(record, policy.cancellationMinHours)) {
      throw new ConflictError(`Cancelamentos pelo portal/app vão até ${policy.cancellationMinHours} h antes. Fale com o ASA.`, 'change_window_closed');
    }
    const text = reason?.trim() || null;
    const updated = await repo.update(record.id, record.version, { status: 'cancelled', cancelledBy: 'student', cancelReason: text }, { type: 'cancelled', visibility: 'public', title: 'Cancelado pelo aluno', description: text, actorType: 'student', actorUserId: student.userId }, this.now());
    if (!updated) throw new ConflictError('O agendamento mudou. Atualize a página.', 'appointment_changed');
    await this.afterChange(updated, actor, 'appointment.cancelled', [{ userId: updated.attendantUserId, kind: 'appointment_cancelled', title: 'Agendamento cancelado pelo aluno', body: `${updated.protocol} · ${this.format(updated.startsAt)}` }]);
    return this.view(updated, policy.cancellationMinHours);
  }

  async reschedule(student: StudentRef, actor: AuditActor, id: string, body: AppointmentRescheduleRequest, channel: 'app' | 'web'): Promise<Appointment> {
    const { repo, policy } = await this.ready();
    const repeated = await repo.findByClientRequest(student.id, body.clientRequestId);
    if (repeated) return this.view(repeated, policy.cancellationMinHours);
    const record = await this.owned(student.id, id);
    if (!ACTIVE.has(record.status)) throw new ConflictError('Este agendamento não está ativo.', 'appointment_not_active');
    if (this.now() > this.deadline(record, policy.cancellationMinHours)) {
      throw new ConflictError(`Remarcações pelo portal/app vão até ${policy.cancellationMinHours} h antes. Fale com o ASA.`, 'change_window_closed');
    }
    const startsAt = new Date(body.startsAt);
    if (startsAt.getTime() === record.startsAt.getTime() && (body.mode ?? record.mode) === record.mode) throw new ValidationError('Escolha um horário diferente do atual.', [{ field: 'startsAt', message: 'mesmo horário' }]);
    const mode = body.mode ?? record.mode;
    const { slot, candidates } = await this.candidatesFor(startsAt, mode, policy.minLeadHours, policy.maxDaysAhead, record, body.location);
    const now = this.now();
    for (const candidate of candidates) {
      try {
        const created = await repo.reschedule({
          current: record,
          reason: 'Remarcado pelo aluno',
          next: {
            id: `appt-${randomUUID()}`,
            studentId: student.id,
            attendantUserId: candidate.attendantUserId,
            availabilityId: candidate.availabilityId,
            topicId: record.topicId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            mode: slot.mode,
            location: slot.location,
            studentNotes: record.studentNotes,
            rescheduledFrom: record.id,
            ticketId: record.ticketId,
            clientRequestId: body.clientRequestId,
            channel,
            now,
          },
          events: {
            cancelled: { type: 'rescheduled', visibility: 'public', title: 'Remarcado pelo aluno', description: `Novo horário: ${this.format(slot.startsAt)}`, actorType: 'student', actorUserId: student.userId },
            scheduled: { type: 'scheduled', visibility: 'public', title: 'Atendimento remarcado', description: `Horário anterior: ${this.format(record.startsAt)}`, actorType: 'student', actorUserId: student.userId },
          },
        });
        if (!created) throw new ConflictError('O agendamento mudou. Atualize a página.', 'appointment_changed');
        await this.afterChange(created, actor, 'appointment.rescheduled', [
          { userId: created.attendantUserId, kind: 'appointment_rescheduled', title: 'Agendamento remarcado', body: `${created.protocol} · ${this.format(created.startsAt)}` },
          ...(created.attendantUserId !== record.attendantUserId ? [{ userId: record.attendantUserId, kind: 'appointment_cancelled', title: 'Agendamento remarcado para outro atendente', body: `${record.protocol} · ${this.format(record.startsAt)}` }] : []),
        ]);
        return this.view(created, policy.cancellationMinHours);
      } catch (error) {
        if (error instanceof OverlapError && error.kind === 'student') throw new ConflictError('Você já tem um atendimento nesse horário.', 'student_conflict');
        if (error instanceof OverlapError) continue;
        throw error;
      }
    }
    throw new ConflictError('Esse horário acabou de ser reservado. Escolha outro.', 'slot_unavailable');
  }

  async calendar(studentId: string, id: string): Promise<{ filename: string; content: string }> {
    await this.ready();
    const record = await this.owned(studentId, id);
    const label = this.topicLabel(record.topicId);
    return {
      filename: `${record.protocol}.ics`,
      content: appointmentIcs({
        id: record.id,
        protocol: record.protocol,
        title: `Atendimento ASA — ${label}`,
        description: `Protocolo ${record.protocol}. ${MODE_META[record.mode].description}`,
        location: record.mode === 'online' ? 'Online (link combinado pela equipe do ASA)' : record.location,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        now: this.now(),
        cancelled: record.status === 'cancelled',
      }),
    };
  }

  private async afterChange(record: AppointmentRecord, actor: AuditActor, action: string, notices: Array<{ userId: string; kind: string; title: string; body: string }>): Promise<void> {
    await this.inbox.notify(
      notices.map((notice) => ({
        userId: notice.userId,
        category: 'appointment' as const,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        resourceType: 'appointment' as const,
        resourceId: record.id,
        dedupeKey: `appointment:${record.id}:${record.version}:${notice.kind}:${notice.userId}`,
        push: true,
      })),
    );
    await this.audit.record(actor, { action, resourceType: 'appointment', resourceId: record.id, metadata: { status: record.status, mode: record.mode, startsAt: record.startsAt.toISOString() } });
  }

  // ----------------------------------------------------------------- equipe

  private toStaff(row: StaffAppointmentRow, events: AppointmentEventRecord[], names: Map<string, string>, cancellationMinHours: number): StaffAppointment {
    const changeDeadline = this.deadline(row, cancellationMinHours);
    return {
      id: row.id,
      protocol: row.protocol,
      status: row.status,
      topicId: row.topicId,
      topicLabel: this.topicLabel(row.topicId),
      mode: row.mode,
      location: row.location,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      studentNotes: row.studentNotes,
      channel: row.channel,
      attendantLabel: row.attendantName,
      ticketId: row.ticketId,
      rescheduledFromId: row.rescheduledFrom,
      rescheduledToId: row.rescheduledTo,
      cancelReason: row.cancelReason,
      cancelledBy: row.cancelledBy,
      canCancel: ACTIVE.has(row.status),
      canReschedule: false,
      changeDeadline: ACTIVE.has(row.status) ? changeDeadline.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      student: { id: row.studentId, fullName: row.studentName, registrationNumber: row.registrationNumber },
      attendant: { id: row.attendantUserId, fullName: row.attendantName },
      staffNotes: row.staffNotes,
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        title: event.title,
        description: event.description,
        actorType: event.actorType,
        createdAt: event.createdAt.toISOString(),
        visibility: event.visibility,
        actorName: event.actorUserId ? (names.get(event.actorUserId) ?? null) : null,
      })),
    };
  }

  async staffList(input: { from?: string; to?: string; status?: string; mine?: boolean }, viewerUserId: string): Promise<StaffAppointmentList> {
    const { repo, policy } = await this.ready();
    const today = localDate(this.now(), this.config.timeZone);
    const from = input.from ?? today;
    const to = input.to ?? addDays(from, 6);
    if (!isCalendarDate(from) || !isCalendarDate(to) || to < from || dateRange(from, to).length > 62) {
      throw new ValidationError('Período inválido (use AAAA-MM-DD, até 62 dias).', [{ field: 'from', message: 'período inválido' }]);
    }
    const statuses = input.status ? input.status.split(',').filter((value) => ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'].includes(value)) : undefined;
    const all = await repo.listForStaff({
      from: localMidnight(from, this.config.timeZone),
      to: localMidnight(addDays(to, 1), this.config.timeZone),
      ...(input.mine ? { attendantUserId: viewerUserId } : {}),
      excludeDemo: this.config.excludeDemo,
    });
    // contagens por situação do período inteiro (o filtro de situação só limita os itens)
    const counts = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const row of all) counts[row.status] += 1;
    const rows = statuses && statuses.length > 0 ? all.filter((row) => (statuses as string[]).includes(row.status)) : all;
    return { from, to, items: rows.map((row) => this.toStaff(row, [], new Map(), policy.cancellationMinHours)), counts };
  }

  async staffGet(id: string): Promise<StaffAppointment> {
    const { repo, policy } = await this.ready();
    const row = await repo.findForStaff(id);
    if (!row) throw new NotFoundError('Agendamento não encontrado.');
    const events = await repo.listEvents(id, true);
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(events.map((event) => event.actorUserId).filter((value): value is string => Boolean(value)))].map(async (userId) => {
        names.set(userId, (await this.repos.users.findById(userId))?.fullName ?? 'Conta removida');
      }),
    );
    return this.toStaff(row, events, names, policy.cancellationMinHours);
  }

  /**
   * Transições da equipe: confirmar (antes do fim), concluir/ausência (depois do início), cancelar com
   * justificativa (vai para o aluno). Anotações internas nunca vão para o aluno.
   */
  async staffUpdate(actor: AuditActor & { userId: string }, id: string, body: StaffAppointmentUpdateRequest): Promise<StaffAppointment> {
    const { repo } = await this.ready();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Agendamento não encontrado.');
    const now = this.now();
    const patch: Parameters<AppointmentRepository['update']>[2] = {};
    let event: NewAppointmentEvent | null = null;
    let notice: { title: string; body: string; kind: string } | null = null;
    if (body.status) {
      const to = body.status;
      if (!ACTIVE.has(record.status)) throw new ConflictError('Este agendamento já foi encerrado.', 'appointment_not_active');
      if (to === 'confirmed') {
        if (record.status !== 'scheduled') throw new ConflictError('Só é possível confirmar um agendamento ainda não confirmado.', 'invalid_transition');
        if (now >= record.endsAt) throw new ConflictError('O horário já passou.', 'invalid_transition');
        event = { type: 'confirmed', visibility: 'public', title: 'Confirmado pelo ASA', description: null, actorType: 'staff', actorUserId: actor.userId };
        notice = { kind: 'appointment_confirmed', title: 'Atendimento confirmado', body: `${record.protocol} · ${this.format(record.startsAt)}` };
      } else if (to === 'completed' || to === 'no_show') {
        if (now < record.startsAt) throw new ConflictError('Só depois do início do horário.', 'invalid_transition');
        event = to === 'completed'
          ? { type: 'completed', visibility: 'public', title: 'Atendimento realizado', description: null, actorType: 'staff', actorUserId: actor.userId }
          : { type: 'no_show', visibility: 'public', title: 'Ausência registrada', description: null, actorType: 'staff', actorUserId: actor.userId };
      } else if (to === 'cancelled') {
        const reason = body.reason?.trim() ?? '';
        if (reason.length < 5) throw new ValidationError('Informe o motivo do cancelamento (mínimo 5 caracteres).', [{ field: 'reason', message: 'obrigatório' }]);
        patch.cancelledBy = 'staff';
        patch.cancelReason = reason;
        event = { type: 'cancelled', visibility: 'public', title: 'Cancelado pelo ASA', description: reason, actorType: 'staff', actorUserId: actor.userId };
        notice = { kind: 'appointment_cancelled', title: 'Atendimento cancelado pelo ASA', body: `${record.protocol} · ${this.format(record.startsAt)} — ${reason}` };
      }
      patch.status = to;
    }
    if (body.staffNotes !== undefined) {
      patch.staffNotes = body.staffNotes?.trim() || null;
      event ??= { type: 'note', visibility: 'internal', title: 'Anotação interna atualizada', description: patch.staffNotes, actorType: 'staff', actorUserId: actor.userId };
    }
    if (!body.status && body.staffNotes === undefined) throw new ValidationError('Nada para alterar.', [{ field: 'body', message: 'vazio' }]);
    const updated = await repo.update(record.id, record.version, patch, event, now);
    if (!updated) throw new ConflictError('O agendamento mudou. Atualize a página.', 'appointment_changed');
    const student = await this.repos.students.findById(updated.studentId);
    if (notice && student) {
      await this.inbox.notify([{ userId: student.userId, category: 'appointment', kind: notice.kind, title: notice.title, body: notice.body, resourceType: 'appointment', resourceId: updated.id, dedupeKey: `appointment:${updated.id}:${updated.version}:${notice.kind}`, push: true }]);
    }
    await this.audit.record(actor, { action: 'appointment.status_changed', resourceType: 'appointment', resourceId: updated.id, metadata: { status: updated.status, notesChanged: body.staffNotes !== undefined } });
    return this.staffGet(updated.id);
  }

  // ---------------------------------------------------------- disponibilidade

  private toRule(record: AvailabilityRecord): AvailabilityRule {
    return {
      id: record.id,
      attendant: { id: record.attendantUserId, fullName: record.attendantName },
      weekday: record.weekday,
      startTime: record.startTime,
      endTime: record.endTime,
      slotMinutes: record.slotMinutes,
      mode: record.mode,
      location: record.location,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
      active: record.active,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async availability(input: { attendantUserId?: string }): Promise<AvailabilityList> {
    const repo = this.repo();
    return { items: (await repo.listAvailability({ ...(input.attendantUserId ? { attendantUserId: input.attendantUserId } : {}), excludeDemo: this.config.excludeDemo })).map((record) => this.toRule(record)) };
  }

  private validateRule(input: { weekday?: number; startTime?: string; endTime?: string; slotMinutes?: number; location?: string | null; validFrom?: string; validUntil?: string | null }): void {
    const details: Array<{ field: string; message: string }> = [];
    if (input.weekday !== undefined && (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)) details.push({ field: 'weekday', message: '0 (domingo) a 6 (sábado)' });
    for (const field of ['startTime', 'endTime'] as const) if (input[field] !== undefined && !timePattern.test(input[field]!)) details.push({ field, message: 'use HH:MM' });
    if (input.startTime && input.endTime && input.startTime >= input.endTime) details.push({ field: 'endTime', message: 'deve ser depois do início' });
    if (input.slotMinutes !== undefined && (!Number.isInteger(input.slotMinutes) || input.slotMinutes < 10 || input.slotMinutes > 120)) details.push({ field: 'slotMinutes', message: '10 a 120 minutos' });
    if (input.location && input.location.length > 120) details.push({ field: 'location', message: 'até 120 caracteres' });
    if (input.validFrom !== undefined && !isCalendarDate(input.validFrom)) details.push({ field: 'validFrom', message: 'use AAAA-MM-DD' });
    if (input.validUntil && !isCalendarDate(input.validUntil)) details.push({ field: 'validUntil', message: 'use AAAA-MM-DD' });
    if (input.validFrom && input.validUntil && input.validUntil < input.validFrom) details.push({ field: 'validUntil', message: 'antes do início' });
    if (details.length > 0) throw new ValidationError('Disponibilidade inválida.', details);
  }

  /** Mesmo atendente, mesmo dia da semana, horários e vigências que se cruzam → conflito. */
  private async assertNoOverlap(rule: { id?: string; attendantUserId: string; weekday: number; startTime: string; endTime: string; validFrom: string; validUntil: string | null }): Promise<void> {
    const existing = await this.repo().listAvailability({ attendantUserId: rule.attendantUserId });
    const clash = existing.find(
      (item) =>
        item.active &&
        item.id !== rule.id &&
        item.weekday === rule.weekday &&
        item.startTime < rule.endTime &&
        rule.startTime < item.endTime &&
        (item.validUntil === null || item.validUntil >= rule.validFrom) &&
        (rule.validUntil === null || rule.validUntil >= item.validFrom),
    );
    if (clash) throw new ConflictError(`Já existe disponibilidade nesse dia e horário (${clash.startTime}–${clash.endTime}).`, 'availability_overlap');
  }

  private assertCanManage(role: UserRole, actorUserId: string, attendantUserId: string): void {
    if (attendantUserId !== actorUserId && !hasPermission(role, 'availability:manage:any')) {
      throw new ForbiddenError('Você só pode alterar a sua própria disponibilidade.', 'permission_denied');
    }
  }

  async createAvailability(actor: AuditActor & { userId: string; role: UserRole }, input: AvailabilityRuleInput): Promise<AvailabilityRule> {
    const repo = this.repo();
    const attendantUserId = input.attendantUserId ?? actor.userId;
    this.assertCanManage(actor.role, actor.userId, attendantUserId);
    const attendant = await this.repos.users.findById(attendantUserId);
    if (!attendant || !attendant.isActive || attendant.role === 'student') throw new ValidationError('Atendente inválido.', [{ field: 'attendantUserId', message: 'precisa ser da equipe' }]);
    const validFrom = input.validFrom ?? localDate(this.now(), this.config.timeZone);
    this.validateRule({ ...input, validFrom });
    await this.assertNoOverlap({ attendantUserId, weekday: input.weekday, startTime: input.startTime, endTime: input.endTime, validFrom, validUntil: input.validUntil ?? null });
    const created = await repo.createAvailability({
      attendantUserId,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      slotMinutes: input.slotMinutes,
      mode: input.mode,
      location: input.location?.trim() || null,
      validFrom,
      validUntil: input.validUntil ?? null,
      createdBy: actor.userId,
    });
    await this.audit.record(actor, { action: 'availability.created', resourceType: 'availability', resourceId: created.id, metadata: { attendantUserId, weekday: created.weekday, startTime: created.startTime, endTime: created.endTime } });
    return this.toRule(created);
  }

  async updateAvailability(actor: AuditActor & { userId: string; role: UserRole }, id: string, patch: AvailabilityRuleUpdate): Promise<AvailabilityRule> {
    const repo = this.repo();
    const current = await repo.findAvailability(id);
    if (!current) throw new NotFoundError('Disponibilidade não encontrada.');
    this.assertCanManage(actor.role, actor.userId, current.attendantUserId);
    const next = { ...current, ...patch };
    this.validateRule({ startTime: next.startTime, endTime: next.endTime, slotMinutes: next.slotMinutes, location: next.location, validFrom: current.validFrom, validUntil: next.validUntil });
    if (next.active) await this.assertNoOverlap({ id, attendantUserId: current.attendantUserId, weekday: current.weekday, startTime: next.startTime, endTime: next.endTime, validFrom: current.validFrom, validUntil: next.validUntil });
    const updated = await repo.updateAvailability(id, { ...patch, ...(patch.location !== undefined ? { location: patch.location?.trim() || null } : {}) });
    if (!updated) throw new NotFoundError('Disponibilidade não encontrada.');
    await this.audit.record(actor, { action: 'availability.updated', resourceType: 'availability', resourceId: id, metadata: { active: updated.active, startTime: updated.startTime, endTime: updated.endTime } });
    return this.toRule(updated);
  }
}
