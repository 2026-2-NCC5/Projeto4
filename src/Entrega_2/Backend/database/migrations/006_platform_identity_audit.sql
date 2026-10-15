-- =========================================================================
-- ASA Conecta — Migration 006 — Plataforma: identidade, sessões por canal,
-- auditoria geral, configurações e central de notificações
--
-- Base para o portal web (aluno, equipe ASA e administração) sobre a MESMA
-- API e o MESMO banco do aplicativo. Somente adições: nenhuma tabela ou
-- coluna existente é removida ou renomeada.
--
-- REGRAS
-- - users.is_demo identifica contas fictícias (seeds de demonstração). Com
--   DEMO_DATA_ENABLED=false elas não entram e seus dados não aparecem.
-- - refresh_sessions ganha canal (app ou portal web) e uma "família" estável:
--   a rotação do refresh token cria uma linha nova com o mesmo family_id,
--   o que permite listar e encerrar sessões por aparelho/navegador.
-- - audit_events é somente-inserção (trigger). A única alteração aceita é
--   anonimizar o autor quando a conta é removida (on delete set null).
--   Endereço IP e e-mail nunca são gravados em claro: só HMAC do servidor.
-- - platform_settings guarda parâmetros validados pela API (horário do ASA,
--   mensagens, políticas). Segredos nunca ficam no banco.
-- - user_notifications complementa support_notifications (que continua
--   sendo usada pelo app): a central unificada lê as duas.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Usuários: conta de demonstração, último acesso e convite
-- -------------------------------------------------------------------------
alter table users add column is_demo boolean not null default false;
alter table users add column last_login_at timestamptz;
alter table users add column invited_by uuid references users (id) on delete set null;
alter table users add column invited_at timestamptz;

-- contas fictícias existentes (seeds e cadastros de teste) usam o domínio reservado demo.asa
update users set is_demo = true where lower(email) like '%@demo.asa';

create index idx_users_role_active on users (role, is_active);

comment on column users.is_demo is 'Conta fictícia de demonstração. Com DEMO_DATA_ENABLED=false não autentica e seus dados não aparecem.';

-- -------------------------------------------------------------------------
-- Sessões: canal, família estável entre rotações e último uso
-- -------------------------------------------------------------------------
alter table refresh_sessions add column channel text not null default 'mobile' check (channel in ('mobile', 'web'));
alter table refresh_sessions add column family_id uuid;
update refresh_sessions set family_id = id where family_id is null;
alter table refresh_sessions alter column family_id set default gen_random_uuid();
alter table refresh_sessions alter column family_id set not null;
alter table refresh_sessions add column device_label text check (device_label is null or char_length(device_label) <= 120);
alter table refresh_sessions add column last_used_at timestamptz;

create index idx_refresh_sessions_family on refresh_sessions (family_id);

-- -------------------------------------------------------------------------
-- Chamados abertos pelo portal web (antes só o app abria chamados)
-- -------------------------------------------------------------------------
alter table support_tickets drop constraint support_tickets_channel_check;
alter table support_tickets add constraint support_tickets_channel_check check (channel in ('app', 'web'));

-- -------------------------------------------------------------------------
-- Auditoria geral (complementa support_ticket_events, que é por chamado)
-- -------------------------------------------------------------------------
create table audit_events (
  id              uuid primary key default gen_random_uuid(),
  seq             bigserial not null,
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid references users (id) on delete set null,
  actor_role      text check (actor_role is null or actor_role in ('student', 'institutional_staff', 'technical_admin')),
  -- ação estável (ex.: auth.login, user.role_changed, report.exported)
  action          text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  resource_type   text,
  resource_id     text,
  outcome         text not null default 'success' check (outcome in ('success', 'failure', 'denied')),
  channel         text not null default 'system' check (channel in ('mobile', 'web', 'system')),
  -- HMAC do IP (pseudonimizado com o segredo do servidor); nunca o IP em claro
  ip_hash         text,
  request_id      text,
  correlation_id  text,
  -- só metadados mínimos e mascarados (sem senhas, tokens, e-mails ou conteúdo de mensagens)
  metadata        jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index idx_audit_events_occurred on audit_events (occurred_at desc, seq desc);
create index idx_audit_events_actor on audit_events (actor_user_id, occurred_at desc);
create index idx_audit_events_resource on audit_events (resource_type, resource_id);
create index idx_audit_events_action on audit_events (action, occurred_at desc);

create or replace function audit_events_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.actor_user_id is not null and new.actor_user_id is null
     and (new.id, new.seq, new.occurred_at, new.actor_role, new.action, new.resource_type, new.resource_id,
          new.outcome, new.channel, new.ip_hash, new.request_id, new.correlation_id, new.metadata)
         is not distinct from
         (old.id, old.seq, old.occurred_at, old.actor_role, old.action, old.resource_type, old.resource_id,
          old.outcome, old.channel, old.ip_hash, old.request_id, old.correlation_id, old.metadata) then
    return new;
  end if;
  raise exception 'audit_events é somente-inserção: registre um novo evento';
end;
$$;

create trigger trg_audit_events_append_only before update or delete on audit_events
  for each row execute function audit_events_append_only();

comment on table audit_events is
  'Trilha de auditoria da plataforma (autenticação, administração, exportações, acessos a contexto de aluno). Somente-inserção.';

-- -------------------------------------------------------------------------
-- Configurações da plataforma (chaves e formatos validados pela API)
-- -------------------------------------------------------------------------
create table platform_settings (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  value       jsonb not null,
  updated_by  uuid references users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table platform_settings is
  'Parâmetros institucionais editáveis pela administração (horário do ASA, mensagens, políticas). Nunca segredos.';

-- -------------------------------------------------------------------------
-- Central de notificações por usuário (aluno, equipe ou administração)
-- -------------------------------------------------------------------------
create table user_notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  category       text not null check (category in ('support', 'appointment', 'agent', 'account', 'system', 'knowledge')),
  kind           text not null check (char_length(kind) between 1 and 60),
  title          text not null check (char_length(title) between 1 and 120),
  body           text not null check (char_length(body) between 1 and 500),
  resource_type  text check (resource_type is null or resource_type in ('ticket', 'appointment', 'recommendation', 'article')),
  resource_id    text,
  -- idempotência: o mesmo evento nunca gera dois avisos para a mesma pessoa
  dedupe_key     text,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  unique (user_id, dedupe_key)
);

create index idx_user_notifications_user on user_notifications (user_id, created_at desc);
create index idx_user_notifications_unread on user_notifications (user_id) where read_at is null;

comment on table user_notifications is
  'Avisos internos (inbox) do portal e do app. Conteúdo mínimo; avisos de chamados do aluno continuam em support_notifications.';

create table notification_preferences (
  user_id       uuid not null references users (id) on delete cascade,
  category      text not null check (category in ('support', 'appointment', 'agent', 'account', 'system', 'knowledge')),
  push_enabled  boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (user_id, category)
);

comment on table notification_preferences is
  'Preferência de push por categoria. O inbox interno é sempre gravado; push só com aparelho registrado e preferência ativa.';
