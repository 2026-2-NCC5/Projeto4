-- =========================================================================
-- ASA Conecta — Migration 007 — Agendamentos com o ASA
--
-- Disponibilidade cadastrada por atendente (dia da semana + faixa de horário),
-- agendamentos do aluno e histórico de cada agendamento.
--
-- REGRAS
-- - Horários oferecidos são gerados a partir da disponibilidade real
--   (nunca uma lista fixa) e conferidos de novo na reserva.
-- - Reserva dupla é impossível no próprio banco: restrições de exclusão
--   (btree_gist) impedem dois agendamentos ativos que se sobrepõem para o
--   mesmo atendente ou para o mesmo aluno, inclusive em requisições
--   simultâneas.
-- - Idempotência: (student_id, client_request_id) é único — reenviar a
--   mesma reserva devolve o agendamento já criado.
-- - appointment_events é somente-inserção (auditoria do agendamento); só some
--   junto com o agendamento (exclusão em cascata da conta).
-- =========================================================================

create extension if not exists btree_gist;

create table appointment_availability (
  id                 uuid primary key default gen_random_uuid(),
  attendant_user_id  uuid not null references users (id) on delete cascade,
  -- 0 = domingo … 6 = sábado (no fuso da instituição)
  weekday            smallint not null check (weekday between 0 and 6),
  start_time         time not null,
  end_time           time not null,
  slot_minutes       integer not null default 30 check (slot_minutes between 10 and 120),
  mode               text not null default 'presencial' check (mode in ('presencial', 'online')),
  location           text check (location is null or char_length(location) <= 120),
  valid_from         date not null default current_date,
  valid_until        date,
  active             boolean not null default true,
  created_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_until is null or valid_until >= valid_from)
);

create trigger trg_appointment_availability_updated_at before update on appointment_availability
  for each row execute function set_updated_at();

create index idx_appointment_availability_attendant on appointment_availability (attendant_user_id) where active;

comment on table appointment_availability is
  'Faixas de atendimento de cada atendente do ASA. Os horários oferecidos ao aluno são gerados daqui.';

-- Protocolo legível: AGD-<ano>-<sequência com 5 dígitos>
create sequence appointment_protocol_seq start 100;

create table appointments (
  id                 text primary key,
  protocol           text not null unique,
  student_id         text not null references students (id) on delete cascade,
  attendant_user_id  uuid not null references users (id) on delete restrict,
  availability_id    uuid references appointment_availability (id) on delete set null,
  -- assunto: categoria do catálogo de atendimento (validada na API)
  topic_id           text not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  mode               text not null check (mode in ('presencial', 'online')),
  location           text,
  status             text not null check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  student_notes      text check (student_notes is null or char_length(student_notes) <= 500),
  -- anotações internas da equipe (nunca enviadas ao aluno)
  staff_notes        text check (staff_notes is null or char_length(staff_notes) <= 1000),
  cancel_reason      text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  cancelled_by       text check (cancelled_by is null or cancelled_by in ('student', 'staff')),
  rescheduled_from   text references appointments (id) on delete set null,
  ticket_id          text references support_tickets (id) on delete set null,
  client_request_id  text not null,
  channel            text not null check (channel in ('app', 'web')),
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (student_id, client_request_id),
  check (ends_at > starts_at),
  check ((status = 'cancelled') = (cancelled_by is not null)),
  constraint appointments_no_attendant_overlap exclude using gist (
    attendant_user_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed')),
  constraint appointments_no_student_overlap exclude using gist (
    student_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'))
);

create trigger trg_appointments_updated_at before update on appointments
  for each row execute function set_updated_at();

create index idx_appointments_student on appointments (student_id, starts_at desc);
create index idx_appointments_attendant on appointments (attendant_user_id, starts_at);
create index idx_appointments_active_start on appointments (starts_at) where status in ('scheduled', 'confirmed');

comment on table appointments is
  'Atendimentos agendados com o ASA. Sobreposição de horários ativos é bloqueada no banco (sem reserva dupla).';

create table appointment_events (
  id              uuid primary key default gen_random_uuid(),
  seq             bigserial not null,
  appointment_id  text not null references appointments (id) on delete cascade,
  type            text not null check (type in ('scheduled', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show', 'note')),
  visibility      text not null default 'public' check (visibility in ('public', 'internal')),
  title           text not null,
  description     text,
  actor_type      text not null check (actor_type in ('student', 'staff', 'system')),
  actor_user_id   uuid references users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_appointment_events_appointment on appointment_events (appointment_id, created_at, seq);

create or replace function appointment_events_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.actor_user_id is not null and new.actor_user_id is null
     and (new.id, new.seq, new.appointment_id, new.type, new.visibility, new.title, new.description, new.actor_type, new.created_at)
         is not distinct from
         (old.id, old.seq, old.appointment_id, old.type, old.visibility, old.title, old.description, old.actor_type, old.created_at) then
    return new;
  end if;
  raise exception 'appointment_events é somente-inserção: registre um novo evento';
end;
$$;

create trigger trg_appointment_events_append_only before update on appointment_events
  for each row execute function appointment_events_append_only();
