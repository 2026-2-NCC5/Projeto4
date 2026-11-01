-- Gestão de estágios. Dados pessoais ficam em JSONB privado e são sempre
-- consultados pelo student_id resolvido a partir da sessão autenticada.
create table internships (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references students(id) on delete cascade,
  client_request_id text not null,
  request_type text not null check (request_type in ('first_contract','mandatory','non_mandatory','extension','amendment','supervisor_change','hours_change','benefits_change','company_change','termination','closure','semester_report','regularization')),
  status text not null default 'draft' check (status in ('draft','validation','document','signatures','institutional_review','completed','needs_correction')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version > 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index internships_student_client_request_uq on internships(student_id, client_request_id);
create index internships_student_updated_idx on internships(student_id, updated_at desc);
create trigger trg_internships_updated_at before update on internships for each row execute function set_updated_at();

create table internship_documents (
  id uuid primary key default gen_random_uuid(),
  internship_id uuid not null references internships(id) on delete cascade,
  version integer not null check (version > 0),
  template_key text not null,
  template_version integer not null default 1,
  source_snapshot jsonb not null,
  rendered_fields jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  validation_status text not null check (validation_status in ('valid','invalid')),
  created_at timestamptz not null default now(),
  unique(internship_id, version)
);
create index internship_documents_case_idx on internship_documents(internship_id, version desc);

create table internship_events (
  id uuid primary key default gen_random_uuid(),
  internship_id uuid not null references internships(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index internship_events_case_idx on internship_events(internship_id, created_at desc);
create or replace function internship_events_append_only() returns trigger language plpgsql as $$
begin raise exception 'internship_events é somente-inserção'; end;
$$;
create trigger trg_internship_events_append_only before update or delete on internship_events for each row execute function internship_events_append_only();

create table internship_appeals (
  id uuid primary key default gen_random_uuid(),
  internship_id uuid not null references internships(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open','awaiting_evidence','in_review','awaiting_correction','awaiting_signature','resubmitted','approved','rejected','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index internship_appeals_student_idx on internship_appeals(student_id, created_at desc);
