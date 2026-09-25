-- =========================================================================
-- ASA Conecta — Migration 001 — Schema inicial (PostgreSQL standalone)
--
-- Derivada do schema legado de src/Entrega 1/Backend/001_init_schema.sql
-- (Supabase), adaptada para a arquitetura oficial (TASK-001 §13, TASK-004
-- §18-19): autenticação própria na API Node.js, sem dependência de
-- auth.users. Identificadores das entidades acadêmicas são TEXT para
-- permitir IDs legíveis nos dados sintéticos (student-demo-001 etc.).
-- =========================================================================

create extension if not exists "pgcrypto";

create type user_role as enum ('student', 'institutional_staff', 'technical_admin');
create type agent_run_status as enum ('recommendation', 'no_action', 'abstained');

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- USERS (credenciais fictícias, senha SEMPRE com hash bcrypt)
-- -------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  full_name     text not null,
  role          user_role not null default 'student',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

comment on table users is 'Usuários da aplicação. Apenas contas fictícias em dev/demo. Nunca armazenar senha em texto puro.';

-- -------------------------------------------------------------------------
-- REFRESH SESSIONS (renovação e expiração de sessão)
-- -------------------------------------------------------------------------
create table refresh_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_refresh_sessions_user on refresh_sessions (user_id);

-- -------------------------------------------------------------------------
-- STUDENTS
-- -------------------------------------------------------------------------
create table students (
  id                  text primary key,
  user_id             uuid not null unique references users (id) on delete cascade,
  registration_number text not null unique,
  program             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_students_updated_at before update on students
  for each row execute function set_updated_at();

comment on table students is 'Dados de identificação acadêmica. Usar apenas dados fictícios/sintéticos (TASK-001 §8).';

-- -------------------------------------------------------------------------
-- SUBJECTS / ENROLLMENTS
-- -------------------------------------------------------------------------
create table subjects (
  id          text primary key default ('subject-' || gen_random_uuid()::text),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table enrollments (
  id          text primary key default ('enrollment-' || gen_random_uuid()::text),
  student_id  text not null references students (id) on delete cascade,
  subject_id  text not null references subjects (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, subject_id)
);

create trigger trg_enrollments_updated_at before update on enrollments
  for each row execute function set_updated_at();

create index idx_enrollments_student on enrollments (student_id);
create index idx_enrollments_subject on enrollments (subject_id);

-- -------------------------------------------------------------------------
-- ASSESSMENTS / ATTENDANCE
-- -------------------------------------------------------------------------
create table assessments (
  id             text primary key default ('assessment-' || gen_random_uuid()::text),
  enrollment_id  text not null references enrollments (id) on delete cascade,
  title          text not null,
  type           text not null default 'exam' check (type in ('exam', 'assignment', 'project', 'other')),
  score          numeric(5,2),
  max_score      numeric(5,2) not null default 10.0 check (max_score > 0),
  applied_at     date,
  created_at     timestamptz not null default now(),
  check (score is null or (score >= 0 and score <= max_score))
);

create index idx_assessments_enrollment on assessments (enrollment_id);

create table attendance (
  id             text primary key default ('attendance-' || gen_random_uuid()::text),
  enrollment_id  text not null references enrollments (id) on delete cascade,
  class_date     date not null,
  present        boolean not null,
  created_at     timestamptz not null default now(),
  unique (enrollment_id, class_date)
);

create index idx_attendance_enrollment on attendance (enrollment_id);

-- -------------------------------------------------------------------------
-- PENDING ITEMS
-- -------------------------------------------------------------------------
create table pending_items (
  id          text primary key default ('pending-' || gen_random_uuid()::text),
  student_id  text not null references students (id) on delete cascade,
  subject_id  text references subjects (id) on delete set null,
  type        text not null,
  description text not null,
  due_date    date,
  status      text not null default 'pending' check (status in ('pending', 'completed', 'overdue')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_pending_items_updated_at before update on pending_items
  for each row execute function set_updated_at();

create index idx_pending_items_student on pending_items (student_id);
create index idx_pending_items_status on pending_items (status);

-- -------------------------------------------------------------------------
-- AGENT RUNS (TASK-001 §13.1 + TASK-004 §27-31)
-- -------------------------------------------------------------------------
create table agent_runs (
  run_id                     text primary key,
  student_id                 text not null references students (id) on delete cascade,
  agent_name                 text not null default 'student_agent',
  agent_version              text not null,
  config_version             text not null,
  contract_version           text not null,
  request_id                 text not null,
  correlation_id             text not null,
  status                     agent_run_status not null,
  summary                    text not null,
  confidence                 numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  abstained                  boolean not null default false,
  abstention_reason          text,
  requires_human_validation  boolean not null default false,
  duration_ms                integer,
  evaluated_at               timestamptz not null,
  created_at                 timestamptz not null default now(),
  check ((status = 'abstained') = abstained)
);

create index idx_agent_runs_student_created on agent_runs (student_id, created_at desc);
create index idx_agent_runs_correlation on agent_runs (correlation_id);

comment on table agent_runs is 'Uma linha por execução oficial do Agente para o Estudante, com rastreabilidade por request_id/correlation_id/run_id.';

-- -------------------------------------------------------------------------
-- AGENT RECOMMENDATIONS / EVIDENCE
-- -------------------------------------------------------------------------
create table agent_recommendations (
  id                         text primary key,
  run_id                     text not null references agent_runs (run_id) on delete cascade,
  type                       text not null,
  message                    text not null,
  next_action                text,
  confidence                 numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  requires_human_validation  boolean not null default false,
  priority                   integer not null default 1,
  subject_id                 text,
  created_at                 timestamptz not null default now()
);

create index idx_agent_recommendations_run on agent_recommendations (run_id, priority);

create table agent_evidence (
  id                  uuid primary key default gen_random_uuid(),
  recommendation_id   text not null references agent_recommendations (id) on delete cascade,
  position            integer not null,
  evidence_type       text not null,
  description         text not null,
  source_reference    text,
  created_at          timestamptz not null default now()
);

create index idx_agent_evidence_recommendation on agent_evidence (recommendation_id, position);

-- -------------------------------------------------------------------------
-- AGENT FEEDBACK (opcional no MVP; estrutura prevista na TASK-001 §13.4)
-- -------------------------------------------------------------------------
create table agent_feedback (
  id                  uuid primary key default gen_random_uuid(),
  recommendation_id   text not null references agent_recommendations (id) on delete cascade,
  student_id          text not null references students (id) on delete cascade,
  feedback_type       text not null check (feedback_type in ('helpful', 'not_helpful')),
  comment             text,
  created_at          timestamptz not null default now()
);

create index idx_agent_feedback_recommendation on agent_feedback (recommendation_id);
