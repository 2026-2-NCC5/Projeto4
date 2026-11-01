-- ASA Match: catálogo autorizado de oportunidades e recomendações explicáveis.
-- A autenticação e o isolamento por aluno são aplicados pela API; nenhuma fonte vem habilitada por padrão.

create table career_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique references students(id) on delete cascade,
  course text,
  academic_data_verified boolean not null default false,
  semester smallint check (semester between 1 and 20),
  career_objective text check (char_length(career_objective) <= 2000),
  first_internship boolean not null default false,
  skills jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  interests jsonb not null default '[]'::jsonb check (jsonb_typeof(interests) = 'array'),
  city text check (char_length(city) <= 120),
  state char(2),
  region text check (char_length(region) <= 160),
  preferred_radius_km smallint check (preferred_radius_km between 0 and 500),
  modalities text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb check (jsonb_typeof(availability) = 'object'),
  personalization_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state is null or state ~ '^[A-Z]{2}$'),
  check (modalities <@ array['onsite','hybrid','remote']::text[])
);
create trigger trg_career_profiles_updated_at before update on career_profiles
  for each row execute function set_updated_at();

create table career_job_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  connector_type text not null check (connector_type in ('greenhouse','lever')),
  board_slug text not null check (board_slug ~ '^[A-Za-z0-9_-]{1,100}$'),
  authorization_status text not null default 'review_required'
    check (authorization_status in ('review_required','approved','rejected')),
  authorization_reference text check (authorization_reference is null or char_length(authorization_reference) <= 500),
  enabled boolean not null default false,
  sync_interval_minutes integer not null default 360 check (sync_interval_minutes between 60 and 10080),
  health_status text not null default 'not_checked'
    check (health_status in ('not_checked','healthy','degraded','failed','paused')),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_type, board_slug)
);
create trigger trg_career_job_sources_updated_at before update on career_job_sources
  for each row execute function set_updated_at();

create table career_job_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references career_job_sources(id) on delete restrict,
  external_id text not null,
  canonical_url text not null check (canonical_url ~ '^https://'),
  company_name text not null check (char_length(company_name) between 1 and 200),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  job_type text not null default 'employment' check (job_type in ('internship','trainee','apprentice','employment','program')),
  professional_area text,
  accepted_courses jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_courses) = 'array'),
  min_semester smallint check (min_semester between 1 and 20),
  max_semester smallint check (max_semester between 1 and 20),
  required_skills jsonb not null default '[]'::jsonb check (jsonb_typeof(required_skills) = 'array'),
  desired_skills jsonb not null default '[]'::jsonb check (jsonb_typeof(desired_skills) = 'array'),
  city text,
  state char(2),
  country text not null default 'BR',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  work_mode text not null default 'unknown' check (work_mode in ('onsite','hybrid','remote','unknown')),
  stipend_min numeric(12,2) check (stipend_min >= 0),
  stipend_max numeric(12,2) check (stipend_max >= 0),
  workload_hours numeric(5,2) check (workload_hours between 1 and 80),
  published_at timestamptz,
  expires_at timestamptz,
  last_verified_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','expired','unavailable','under_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index career_jobs_active_published_idx on career_job_opportunities(status, published_at desc);
create index career_jobs_location_idx on career_job_opportunities(state, city, work_mode);
create index career_jobs_source_verified_idx on career_job_opportunities(source_id, last_verified_at desc);
create trigger trg_career_job_opportunities_updated_at before update on career_job_opportunities
  for each row execute function set_updated_at();

create table career_job_matches (
  profile_id uuid not null references career_profiles(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  match_score smallint not null check (match_score between 0 and 100),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  eligibility text not null check (eligibility in ('eligible','ineligible','unverified')),
  factors jsonb not null,
  explanation jsonb not null,
  algorithm_version text not null,
  calculated_at timestamptz not null default now(),
  primary key (profile_id, opportunity_id)
);
create index career_job_matches_rank_idx on career_job_matches(profile_id, match_score desc, calculated_at desc);

create table career_saved_opportunities (
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table career_job_feedback (
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  feedback text not null check (feedback in ('interested','not_interested','irrelevant')),
  use_for_personalization boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table career_student_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  application_status text not null check (application_status in ('interested','saved','plan_to_apply','applied','interview','offer','closed','not_selected')),
  status_source text not null default 'student' check (status_source in ('student','official_integration')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create trigger trg_career_student_applications_updated_at before update on career_student_applications
  for each row execute function set_updated_at();

create table career_job_alert_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  enabled boolean not null default false,
  minimum_match_score smallint not null default 70 check (minimum_match_score between 0 and 100),
  frequency text not null default 'weekly' check (frequency in ('immediate','daily','weekly','off')),
  channels text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (channels <@ array['in_app','email','push']::text[])
);

create table career_job_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  delivery_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','delivered')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (user_id, opportunity_id)
);
create index career_job_alert_outbox_due_idx on career_job_alert_outbox(delivery_at) where status='queued';

create table career_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid not null references career_job_opportunities(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create index career_notifications_user_idx on career_notifications(user_id, created_at desc);

create table career_job_collection_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references career_job_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('queued','running','completed','partial','failed')),
  total_fetched integer not null default 0,
  total_created integer not null default 0,
  total_updated integer not null default 0,
  total_duplicates integer not null default 0,
  error_code text,
  error_summary text
);
create index career_collection_runs_source_idx on career_job_collection_runs(source_id, started_at desc);
create unique index career_collection_runs_one_pending_source_idx on career_job_collection_runs(source_id) where status in ('queued','running');

create table career_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null check (char_length(action) <= 100),
  entity_type text not null check (char_length(entity_type) <= 80),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index career_audit_logs_entity_idx on career_audit_logs(entity_type, entity_id, created_at desc);

comment on table career_job_sources is 'Fontes ASA Match; habilitar somente após registrar autorização/licença verificada.';
comment on table career_job_opportunities is 'Oportunidades publicadas por fontes habilitadas. Não contém candidaturas sincronizadas por padrão.';
comment on table career_job_matches is 'Score determinístico de afinidade, não probabilidade de contratação.';
