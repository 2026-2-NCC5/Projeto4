import type { AppointmentStatus } from '../contracts/mobileApi.v1.js';
import { withTransaction, type DbClient, type DbPool } from '../db/pool.js';
import {
  OverlapError,
  type AppointmentEventRecord,
  type AppointmentPatch,
  type AppointmentRecord,
  type AppointmentRepository,
  type AvailabilityPatch,
  type AvailabilityRecord,
  type BusyInterval,
  type NewAppointment,
  type NewAppointmentEvent,
  type NewAvailability,
  type StaffAppointmentRow,
} from './types.js';

const ACTIVE = "('scheduled', 'confirmed')";

const AVAILABILITY_SELECT = `
  select a.id, a.attendant_user_id, u.full_name as attendant_name, a.weekday, to_char(a.start_time, 'HH24:MI') as start_time,
         to_char(a.end_time, 'HH24:MI') as end_time, a.slot_minutes, a.mode, a.location, to_char(a.valid_from, 'YYYY-MM-DD') as valid_from,
         to_char(a.valid_until, 'YYYY-MM-DD') as valid_until, a.active, a.updated_at
    from appointment_availability a join users u on u.id = a.attendant_user_id`;

interface AvailabilityRow {
  id: string;
  attendant_user_id: string;
  attendant_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  mode: AvailabilityRecord['mode'];
  location: string | null;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
  updated_at: Date;
}

const mapAvailability = (row: AvailabilityRow): AvailabilityRecord => ({
  id: row.id,
  attendantUserId: row.attendant_user_id,
  attendantName: row.attendant_name,
  weekday: row.weekday,
  startTime: row.start_time,
  endTime: row.end_time,
  slotMinutes: row.slot_minutes,
  mode: row.mode,
  location: row.location,
  validFrom: row.valid_from,
  validUntil: row.valid_until,
  active: row.active,
  updatedAt: row.updated_at,
});

const APPOINTMENT_COLUMNS = `id, protocol, student_id, attendant_user_id, availability_id, topic_id, starts_at, ends_at, mode, location, status,
  student_notes, staff_notes, cancel_reason, cancelled_by, rescheduled_from, ticket_id, client_request_id, channel, version, created_at, updated_at`;

const prefixed = (alias: string) => APPOINTMENT_COLUMNS.split(',').map((column) => `${alias}.${column.trim()}`).join(', ');
/** substituto de um agendamento remarcado (índice parcial da migration 010) */
const replacement = (alias: string) => `(select n.id from appointments n where n.rescheduled_from = ${alias}.id order by n.created_at desc limit 1) as rescheduled_to`;

interface AppointmentRow {
  id: string;
  protocol: string;
  student_id: string;
  attendant_user_id: string;
  availability_id: string | null;
  topic_id: string;
  starts_at: Date;
  ends_at: Date;
  mode: AppointmentRecord['mode'];
  location: string | null;
  status: AppointmentStatus;
  student_notes: string | null;
  staff_notes: string | null;
  cancel_reason: string | null;
  cancelled_by: AppointmentRecord['cancelledBy'];
  rescheduled_from: string | null;
  /** só nas leituras (não nos `returning`) */
  rescheduled_to?: string | null;
  ticket_id: string | null;
  client_request_id: string;
  channel: AppointmentRecord['channel'];
  version: number;
  created_at: Date;
  updated_at: Date;
}

const mapAppointment = (row: AppointmentRow): AppointmentRecord => ({
  id: row.id,
  protocol: row.protocol,
  studentId: row.student_id,
  attendantUserId: row.attendant_user_id,
  availabilityId: row.availability_id,
  topicId: row.topic_id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  mode: row.mode,
  location: row.location,
  status: row.status,
  studentNotes: row.student_notes,
  staffNotes: row.staff_notes,
  cancelReason: row.cancel_reason,
  cancelledBy: row.cancelled_by,
  rescheduledFrom: row.rescheduled_from,
  rescheduledTo: row.rescheduled_to ?? null,
  ticketId: row.ticket_id,
  clientRequestId: row.client_request_id,
  channel: row.channel,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

interface StaffRow extends AppointmentRow {
  student_name: string;
  registration_number: string;
  attendant_name: string;
}

const mapStaff = (row: StaffRow): StaffAppointmentRow => ({
  ...mapAppointment(row),
  studentName: row.student_name,
  registrationNumber: row.registration_number,
  attendantName: row.attendant_name,
});

/**
 * Duas reservas concorrentes que se sobrepõem podem se travar mutuamente na verificação das restrições de
 * exclusão (cada uma espera pela entrada de índice da outra): o PostgreSQL aborta uma delas com 40P01. A
 * transação abortada é repetida — aí ela enxerga a outra já gravada (23P01, horário ocupado) ou segue livre.
 */
const DEADLOCK_RETRIES = 3;
const isDeadlock = (error: unknown) => (error as { code?: string }).code === '40P01';

async function retryOnDeadlock<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= DEADLOCK_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 40)));
    }
  }
}

/** Converte violação das restrições de exclusão (23P01) em erro de domínio. */
function overlapFrom(error: unknown): OverlapError | null {
  const pg = error as { code?: string; constraint?: string };
  if (pg.code !== '23P01') return null;
  return new OverlapError(pg.constraint === 'appointments_no_student_overlap' ? 'student' : 'attendant');
}

async function insertEvent(client: DbClient | DbPool, appointmentId: string, event: NewAppointmentEvent, now: Date): Promise<void> {
  await client.query(
    `insert into appointment_events (appointment_id, type, visibility, title, description, actor_type, actor_user_id, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [appointmentId, event.type, event.visibility, event.title, event.description, event.actorType, event.actorUserId, now],
  );
}

async function insertAppointment(client: DbClient, input: NewAppointment): Promise<AppointmentRecord> {
  // Serializa reservas do mesmo atendente e do mesmo aluno (sempre nesta ordem, em espaços de chave distintos):
  // a segunda transação espera a primeira terminar e recebe 23P01 limpo, sem impasse entre as restrições de exclusão.
  await client.query('select pg_advisory_xact_lock(1, hashtext($1))', [input.attendantUserId]);
  await client.query('select pg_advisory_xact_lock(2, hashtext($1))', [input.studentId]);
  const { rows } = await client.query<AppointmentRow>(
    `insert into appointments (id, protocol, student_id, attendant_user_id, availability_id, topic_id, starts_at, ends_at, mode, location, status,
        student_notes, rescheduled_from, ticket_id, client_request_id, channel, created_at, updated_at)
     values ($1, 'AGD-' || to_char($15::timestamptz at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('appointment_protocol_seq')::text, 5, '0'),
        $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, $11, $12, $13, $14, $15, $15)
     returning ${APPOINTMENT_COLUMNS}`,
    [
      input.id,
      input.studentId,
      input.attendantUserId,
      input.availabilityId,
      input.topicId,
      input.startsAt,
      input.endsAt,
      input.mode,
      input.location,
      input.studentNotes,
      input.rescheduledFrom,
      input.ticketId,
      input.clientRequestId,
      input.channel,
      input.now,
    ],
  );
  return mapAppointment(rows[0]!);
}

export class PgAppointmentRepository implements AppointmentRepository {
  constructor(private readonly pool: DbPool) {}

  async listAvailability(filter: { attendantUserId?: string; activeOnly?: boolean; excludeDemo?: boolean }): Promise<AvailabilityRecord[]> {
    const { rows } = await this.pool.query<AvailabilityRow>(
      `${AVAILABILITY_SELECT}
       where ($1::uuid is null or a.attendant_user_id = $1) and (not $2::boolean or (a.active and u.is_active)) and not ($3::boolean and u.is_demo)
       order by u.full_name, a.weekday, a.start_time`,
      [filter.attendantUserId ?? null, filter.activeOnly ?? false, filter.excludeDemo ?? false],
    );
    return rows.map(mapAvailability);
  }

  async findAvailability(id: string): Promise<AvailabilityRecord | null> {
    const { rows } = await this.pool.query<AvailabilityRow>(`${AVAILABILITY_SELECT} where a.id = $1`, [id]);
    return rows[0] ? mapAvailability(rows[0]) : null;
  }

  async createAvailability(input: NewAvailability): Promise<AvailabilityRecord> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into appointment_availability (attendant_user_id, weekday, start_time, end_time, slot_minutes, mode, location, valid_from, valid_until, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [input.attendantUserId, input.weekday, input.startTime, input.endTime, input.slotMinutes, input.mode, input.location, input.validFrom, input.validUntil, input.createdBy],
    );
    return (await this.findAvailability(rows[0]!.id))!;
  }

  async updateAvailability(id: string, patch: AvailabilityPatch): Promise<AvailabilityRecord | null> {
    const has = (key: keyof AvailabilityPatch) => Object.prototype.hasOwnProperty.call(patch, key);
    const result = await this.pool.query(
      `update appointment_availability set
          start_time = coalesce($2::time, start_time), end_time = coalesce($3::time, end_time), slot_minutes = coalesce($4, slot_minutes),
          mode = coalesce($5, mode), location = case when $6 then $7 else location end,
          valid_until = case when $8 then $9::date else valid_until end, active = coalesce($10, active)
        where id = $1`,
      [id, patch.startTime ?? null, patch.endTime ?? null, patch.slotMinutes ?? null, patch.mode ?? null, has('location'), patch.location ?? null, has('validUntil'), patch.validUntil ?? null, patch.active ?? null],
    );
    return (result.rowCount ?? 0) > 0 ? this.findAvailability(id) : null;
  }

  async busyIntervals(from: Date, to: Date): Promise<BusyInterval[]> {
    const { rows } = await this.pool.query<{ attendant_user_id: string; starts_at: Date; ends_at: Date }>(
      `select attendant_user_id, starts_at, ends_at from appointments where status in ${ACTIVE} and starts_at < $2 and ends_at > $1`,
      [from, to],
    );
    return rows.map((row) => ({ attendantUserId: row.attendant_user_id, startsAt: row.starts_at, endsAt: row.ends_at }));
  }

  async loadByAttendant(attendantIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
    const { rows } = await this.pool.query<{ attendant_user_id: string; total: number }>(
      `select attendant_user_id, count(*)::int as total from appointments
        where status in ${ACTIVE} and attendant_user_id = any($1::uuid[]) and starts_at >= $2 and starts_at < $3 group by 1`,
      [attendantIds, from, to],
    );
    return new Map(rows.map((row) => [row.attendant_user_id, row.total]));
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const { rows } = await this.pool.query<AppointmentRow>(`select ${APPOINTMENT_COLUMNS}, ${replacement('appointments')} from appointments where id = $1`, [id]);
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  async findByClientRequest(studentId: string, clientRequestId: string): Promise<AppointmentRecord | null> {
    const { rows } = await this.pool.query<AppointmentRow>(`select ${APPOINTMENT_COLUMNS}, ${replacement('appointments')} from appointments where student_id = $1 and client_request_id = $2`, [studentId, clientRequestId]);
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  async listByStudent(studentId: string, scope: 'upcoming' | 'past' | 'all', now: Date, limit: number): Promise<AppointmentRecord[]> {
    const where = scope === 'upcoming' ? `and status in ${ACTIVE} and ends_at > $2` : scope === 'past' ? `and (status not in ${ACTIVE} or ends_at <= $2)` : 'and $2::timestamptz is not null';
    const order = scope === 'upcoming' ? 'starts_at asc' : 'starts_at desc';
    const { rows } = await this.pool.query<AppointmentRow>(
      `select ${APPOINTMENT_COLUMNS}, ${replacement('appointments')} from appointments where student_id = $1 ${where} order by ${order}, id limit $3`,
      [studentId, now, limit],
    );
    return rows.map(mapAppointment);
  }

  async countActiveByStudent(studentId: string, now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>(
      `select count(*)::int as total from appointments where student_id = $1 and status in ${ACTIVE} and ends_at > $2`,
      [studentId, now],
    );
    return rows[0]?.total ?? 0;
  }

  async insert(input: NewAppointment, event: NewAppointmentEvent): Promise<AppointmentRecord> {
    try {
      return await retryOnDeadlock(() =>
        withTransaction(this.pool, async (client) => {
          const created = await insertAppointment(client, input);
          await insertEvent(client, created.id, event, input.now);
          return created;
        }),
      );
    } catch (error) {
      throw overlapFrom(error) ?? error;
    }
  }

  async reschedule(input: Parameters<AppointmentRepository['reschedule']>[0]): Promise<AppointmentRecord | null> {
    try {
      return await retryOnDeadlock(() => withTransaction(this.pool, async (client) => {
        // libera o horário atual primeiro (o novo pode se sobrepor ao antigo para o mesmo aluno)
        const cancelled = await client.query(
          `update appointments set status = 'cancelled', cancelled_by = 'student', cancel_reason = $3, version = version + 1
            where id = $1 and version = $2 and status in ${ACTIVE}`,
          [input.current.id, input.current.version, input.reason],
        );
        if ((cancelled.rowCount ?? 0) === 0) return null;
        await insertEvent(client, input.current.id, input.events.cancelled, input.next.now);
        const created = await insertAppointment(client, input.next);
        await insertEvent(client, created.id, input.events.scheduled, input.next.now);
        return created;
      }));
    } catch (error) {
      throw overlapFrom(error) ?? error;
    }
  }

  async update(id: string, expectedVersion: number, patch: AppointmentPatch, event: NewAppointmentEvent | null, now: Date): Promise<AppointmentRecord | null> {
    const has = (key: keyof AppointmentPatch) => Object.prototype.hasOwnProperty.call(patch, key);
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<AppointmentRow>(
        `update appointments set
            status = coalesce($3, status),
            staff_notes = case when $4 then $5 else staff_notes end,
            cancel_reason = case when $6 then $7 else cancel_reason end,
            cancelled_by = case when $8 then $9 else cancelled_by end,
            version = version + 1
          where id = $1 and version = $2
          returning ${APPOINTMENT_COLUMNS}`,
        [id, expectedVersion, patch.status ?? null, has('staffNotes'), patch.staffNotes ?? null, has('cancelReason'), patch.cancelReason ?? null, has('cancelledBy'), patch.cancelledBy ?? null],
      );
      const row = rows[0];
      if (!row) return null;
      if (event) await insertEvent(client, id, event, now);
      return mapAppointment(row);
    });
  }

  async listEvents(appointmentId: string, includeInternal: boolean): Promise<AppointmentEventRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      appointment_id: string;
      type: AppointmentEventRecord['type'];
      visibility: AppointmentEventRecord['visibility'];
      title: string;
      description: string | null;
      actor_type: AppointmentEventRecord['actorType'];
      actor_user_id: string | null;
      created_at: Date;
    }>(
      `select id, appointment_id, type, visibility, title, description, actor_type, actor_user_id, created_at
         from appointment_events where appointment_id = $1 and ($2 or visibility = 'public') order by created_at, seq`,
      [appointmentId, includeInternal],
    );
    return rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      type: row.type,
      visibility: row.visibility,
      title: row.title,
      description: row.description,
      actorType: row.actor_type,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
    }));
  }

  private staffSelect(where: string): string {
    return `select ${prefixed('a')}, ${replacement('a')}, su.full_name as student_name, s.registration_number, au.full_name as attendant_name
              from appointments a
              join students s on s.id = a.student_id
              join users su on su.id = s.user_id
              join users au on au.id = a.attendant_user_id
             ${where}`;
  }

  async listForStaff(filter: { from: Date; to: Date; statuses?: string[]; attendantUserId?: string; excludeDemo: boolean }): Promise<StaffAppointmentRow[]> {
    const { rows } = await this.pool.query<StaffRow>(
      `${this.staffSelect(`where a.starts_at >= $1 and a.starts_at < $2
          and ($3::text[] is null or a.status = any($3))
          and ($4::uuid is null or a.attendant_user_id = $4)
          and not ($5::boolean and su.is_demo)`)}
        order by a.starts_at, a.id limit 500`,
      [filter.from, filter.to, filter.statuses ?? null, filter.attendantUserId ?? null, filter.excludeDemo],
    );
    return rows.map(mapStaff);
  }

  async findForStaff(id: string): Promise<StaffAppointmentRow | null> {
    const { rows } = await this.pool.query<StaffRow>(this.staffSelect('where a.id = $1'), [id]);
    return rows[0] ? mapStaff(rows[0]) : null;
  }

  async countByStatus(from: Date, to: Date, excludeDemo: boolean): Promise<Partial<Record<AppointmentStatus, number>>> {
    const { rows } = await this.pool.query<{ status: AppointmentStatus; total: number }>(
      `select a.status, count(*)::int as total from appointments a join students s on s.id = a.student_id join users u on u.id = s.user_id
        where a.starts_at >= $1 and a.starts_at < $2 and not ($3::boolean and u.is_demo) group by 1`,
      [from, to, excludeDemo],
    );
    return Object.fromEntries(rows.map((row) => [row.status, row.total]));
  }

  async upcomingCountByStudent(studentIds: string[], now: Date): Promise<Map<string, number>> {
    if (studentIds.length === 0) return new Map();
    const { rows } = await this.pool.query<{ student_id: string; total: number }>(
      `select student_id, count(*)::int as total from appointments where student_id = any($1::text[]) and status in ${ACTIVE} and ends_at > $2 group by 1`,
      [studentIds, now],
    );
    return new Map(rows.map((row) => [row.student_id, row.total]));
  }
}
