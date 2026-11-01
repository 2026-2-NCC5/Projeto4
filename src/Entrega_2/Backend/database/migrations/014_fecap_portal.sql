-- Portal Educacional FECAP: conexão e inventário são privados por estudante.
create table portal_connections (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references students(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_sync_at timestamptz
);
create unique index portal_connections_one_active_uq on portal_connections(student_id) where revoked_at is null;
create index portal_connections_student_idx on portal_connections(student_id, created_at desc);

create table portal_sync_sessions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references portal_connections(id) on delete cascade,
  client_session_id text not null check (char_length(client_session_id) between 1 and 128),
  status text not null check (status in ('running','completed','partial','failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  pages_discovered integer not null default 0 check (pages_discovered >= 0),
  pages_visited integer not null default 0 check (pages_visited >= 0),
  records_extracted integer not null default 0 check (records_extracted >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique(connection_id, client_session_id)
);
create index portal_sync_sessions_recent_idx on portal_sync_sessions(connection_id, started_at desc);

create table portal_discovered_routes (
  id uuid primary key default gen_random_uuid(),
  sync_session_id uuid not null references portal_sync_sessions(id) on delete cascade,
  route_key text not null,
  route_data jsonb not null check (jsonb_typeof(route_data) = 'object'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  discovered_at timestamptz not null default now(),
  unique(sync_session_id, route_key)
);
create index portal_discovered_routes_session_idx on portal_discovered_routes(sync_session_id);

create table portal_audit_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  action text not null,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index portal_audit_events_connection_idx on portal_audit_events(connection_id, created_at desc);
create or replace function portal_audit_events_append_only() returns trigger language plpgsql as $$
begin raise exception 'portal_audit_events é somente-inserção'; end;
$$;
create trigger trg_portal_audit_events_append_only before update or delete on portal_audit_events for each row execute function portal_audit_events_append_only();
