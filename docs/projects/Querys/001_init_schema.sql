-- =========================================================================
-- ASA — Agentes Inteligentes para o Sucesso do Estudante
-- Migration 001 — Schema inicial (PostgreSQL / Supabase)
--
-- Base: TASK-001 (entidades e stack), TASK-002 (regras de negócio do
-- agente), TASK-003 (perfis/acesso) e TASK-004 (contratos, IDs de
-- rastreabilidade e regra de "estudante só vê os próprios dados").
--
-- Entidades acadêmicas: users, students, subjects, enrollments,
-- assessments, attendance, pending_items
-- Entidades do agente: agent_runs, agent_recommendations, agent_evidence,
-- agent_feedback
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Extensões
-- -------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- -------------------------------------------------------------------------
-- 1. Tipos enumerados
-- Só foram criados enums para os valores que os markdowns fixam
-- explicitamente (status do agente). Os demais campos de status ficam
-- como TEXT + CHECK, para não travar uma regra de negócio que a task
-- ainda não fechou.
-- -------------------------------------------------------------------------

create type user_role as enum (
  'student',              -- Perfil 1 — Estudante (TASK-003)
  'institutional_staff',  -- Perfil 2 — Responsável Institucional
  'technical_admin'       -- Perfil 3 — Administrador Técnico
);

create type agent_run_status as enum (
  'recommendation',
  'no_action',
  'abstained'
);

-- -------------------------------------------------------------------------
-- 2. Função utilitária de updated_at
-- -------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- 3. USERS / STUDENTS
-- =========================================================================

-- app_users estende auth.users (Supabase Auth) com o papel de cada pessoa
-- no ecossistema do ASA. O id é o mesmo id do auth.users.
create table app_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role not null default 'student',
  full_name   text not null,
  email       text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_app_users_updated_at
  before update on app_users
  for each row execute function set_updated_at();

-- students guarda os dados específicos de quem é estudante.
-- 1:1 com app_users (id compartilhado) quando role = 'student'.
create table students (
  id                  uuid primary key references app_users (id) on delete cascade,
  registration_number text not null unique,   -- matrícula
  program             text,                   -- curso
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_students_updated_at
  before update on students
  for each row execute function set_updated_at();

comment on table students is 'Dados acadêmicos de identificação do estudante. Usar apenas dados fictícios/sintéticos em dev e demo (TASK-001 §8, TASK-004).';

-- =========================================================================
-- 4. SUBJECTS / ENROLLMENTS
-- =========================================================================

create table subjects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,   -- ex.: "ADS-201"
  name        text not null,
  created_at  timestamptz not null default now()
);

create table enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students (id) on delete cascade,
  subject_id  uuid not null references subjects (id) on delete cascade,
  status      text not null default 'active'
              check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, subject_id)
);

create trigger trg_enrollments_updated_at
  before update on enrollments
  for each row execute function set_updated_at();

create index idx_enrollments_student on enrollments (student_id);
create index idx_enrollments_subject on enrollments (subject_id);

-- =========================================================================
-- 5. ASSESSMENTS (avaliações/notas) E ATTENDANCE (frequência)
-- =========================================================================

create table assessments (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references enrollments (id) on delete cascade,
  title          text not null,
  type           text not null default 'exam'
                 check (type in ('exam', 'assignment', 'project', 'other')),
  score          numeric(5,2),
  max_score      numeric(5,2) not null default 10.0,
  applied_at     date,
  created_at     timestamptz not null default now(),
  check (score is null or score <= max_score)
);

create index idx_assessments_enrollment on assessments (enrollment_id);

create table attendance (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references enrollments (id) on delete cascade,
  class_date     date not null,
  present        boolean not null,
  created_at     timestamptz not null default now(),
  unique (enrollment_id, class_date)
);

create index idx_attendance_enrollment on attendance (enrollment_id);

-- =========================================================================
-- 6. PENDING_ITEMS (pendências acadêmicas)
-- =========================================================================

create table pending_items (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students (id) on delete cascade,
  subject_id  uuid references subjects (id) on delete set null,
  type        text not null,      -- ex.: "activity", "document", "assessment"
  description text not null,
  due_date    date,
  status      text not null default 'pending'
              check (status in ('pending', 'completed', 'overdue')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_pending_items_updated_at
  before update on pending_items
  for each row execute function set_updated_at();

create index idx_pending_items_student on pending_items (student_id);
create index idx_pending_items_status on pending_items (status);

-- =========================================================================
-- 7. AGENT_RUNS (execuções do Agente para o Estudante)
-- Campos conceituais da TASK-001 §13.1 + IDs de rastreabilidade da
-- TASK-004 §27-31 (request_id, correlation_id, run_id, contract_version).
-- =========================================================================

create table agent_runs (
  id                          uuid primary key default gen_random_uuid(),
  student_id                  uuid not null references students (id) on delete cascade,
  agent_version               text not null,
  config_version              text,
  contract_version            text not null default '1.0',
  request_id                  text not null,
  correlation_id              text not null,
  status                      agent_run_status not null,
  confidence                  numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  abstained                   boolean not null default false,
  abstention_reason           text,
  requires_human_validation   boolean not null default false,
  created_at                  timestamptz not null default now(),
  check (
    (status = 'abstained' and abstained = true)
    or (status <> 'abstained')
  )
);

create index idx_agent_runs_student on agent_runs (student_id);
create index idx_agent_runs_correlation on agent_runs (correlation_id);
create index idx_agent_runs_created_at on agent_runs (created_at desc);

comment on table agent_runs is 'Registro de cada execução do Agent Engine, com rastreabilidade via request_id/correlation_id (TASK-004 §27-31).';

-- =========================================================================
-- 8. AGENT_RECOMMENDATIONS
-- =========================================================================

create table agent_recommendations (
  id                          uuid primary key default gen_random_uuid(),
  agent_run_id                uuid not null references agent_runs (id) on delete cascade,
  type                        text not null,
  message                     text not null,
  next_action                 text,
  requires_human_validation   boolean not null default false,
  created_at                  timestamptz not null default now()
);

create index idx_agent_recommendations_run on agent_recommendations (agent_run_id);

-- =========================================================================
-- 9. AGENT_EVIDENCE
-- =========================================================================

create table agent_evidence (
  id                  uuid primary key default gen_random_uuid(),
  recommendation_id   uuid not null references agent_recommendations (id) on delete cascade,
  evidence_type       text not null,
  description         text not null,
  source_reference    text,
  created_at          timestamptz not null default now()
);

create index idx_agent_evidence_recommendation on agent_evidence (recommendation_id);

-- =========================================================================
-- 10. AGENT_FEEDBACK
-- =========================================================================

create table agent_feedback (
  id                  uuid primary key default gen_random_uuid(),
  recommendation_id   uuid not null references agent_recommendations (id) on delete cascade,
  student_id          uuid not null references students (id) on delete cascade,
  feedback_type       text not null,   -- ex.: "helpful", "not_helpful"
  comment             text,
  created_at          timestamptz not null default now()
);

create index idx_agent_feedback_recommendation on agent_feedback (recommendation_id);
create index idx_agent_feedback_student on agent_feedback (student_id);
