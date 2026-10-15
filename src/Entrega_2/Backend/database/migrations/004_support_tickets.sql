-- =========================================================================
-- ASA Conecta — Migration 004 — Atendimento ASA (chamados do estudante)
--
-- Abertura e acompanhamento de chamados: protocolo, situação, prazo (SLA),
-- histórico de auditoria, mensagens, anexos, avaliação e avisos.
--
-- REGRAS
-- - O histórico (support_ticket_events) é somente-inserção: UPDATE é
--   bloqueado por trigger. Mudanças de situação viram novos eventos.
-- - Eventos internos (notas da equipe, prioridade) têm visibility = 'internal'
--   e nunca são devolvidos nas rotas do estudante.
-- - Categorias e equipes vivem no catálogo versionado da API
--   (api/src/support/catalog.ts); aqui ficam apenas os ids.
-- - Anexos ficam no próprio banco (bytea, até 5 MB cada). Envios pendentes
--   (ticket_id nulo) expiram em 24 h e são limpos pela API.
-- =========================================================================

-- Protocolo legível: ASA-<ano>-<sequência com 5 dígitos>
create sequence support_ticket_protocol_seq start 400;

create table support_tickets (
  id                         text primary key,
  protocol                   text not null unique,
  student_id                 text not null references students (id) on delete cascade,
  -- idempotência da abertura: reenvio do mesmo pedido devolve o chamado existente
  client_request_id          text not null,
  category_id                text not null,
  subcategory_id             text,
  subject                    text not null check (char_length(subject) between 1 and 120),
  description                text not null check (char_length(description) between 1 and 1500),
  -- protocolo + assunto + categoria, minúsculo e sem acentos (busca)
  search_text                text not null default '',
  status                     text not null check (status in (
                               'submitted', 'received', 'triage', 'assigned', 'in_analysis', 'in_progress',
                               'waiting_student', 'waiting_department', 'waiting_external',
                               'resolved', 'closed', 'cancelled', 'reopened')),
  priority                   text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  channel                    text not null default 'app' check (channel in ('app')),
  assigned_team              text not null,
  assigned_agent_id          uuid references users (id) on delete set null,
  pending_action_title       text,
  pending_action_description text,
  pending_action_requested_at timestamptz,
  pending_action_expects_attachment boolean not null default false,
  resolution                 text,
  resolved_at                timestamptz,
  closed_at                  timestamptz,
  cancelled_at               timestamptz,
  cancel_reason              text,
  reopened_count             integer not null default 0 check (reopened_count >= 0),
  sla_target_business_days   integer not null check (sla_target_business_days > 0),
  sla_started_at             timestamptz not null,
  sla_due_at                 timestamptz not null,
  sla_paused_at              timestamptz,
  sla_resumed_at             timestamptz,
  sla_completed_at           timestamptz,
  version                    integer not null default 1,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (student_id, client_request_id),
  check ((pending_action_title is null) = (pending_action_description is null))
);

create index idx_support_tickets_student_updated on support_tickets (student_id, updated_at desc, id desc);
create index idx_support_tickets_status_updated on support_tickets (status, updated_at desc);

comment on table support_tickets is 'Chamados de atendimento do estudante com o ASA. Dados fictícios em dev/demo.';

-- -------------------------------------------------------------------------
-- Histórico / auditoria (somente-inserção)
-- -------------------------------------------------------------------------
create table support_ticket_events (
  id             uuid primary key default gen_random_uuid(),
  -- ordem estável para eventos gravados na mesma transação (mesmo created_at)
  seq            bigserial not null,
  ticket_id      text not null references support_tickets (id) on delete cascade,
  type           text not null check (type in (
                   'ticket_created', 'ticket_received', 'ticket_triaged', 'ticket_assigned', 'status_changed',
                   'message_received', 'message_sent', 'file_uploaded', 'student_action_required',
                   'student_response_received', 'department_forwarded', 'resolution_proposed', 'ticket_resolved',
                   'ticket_closed', 'ticket_reopened', 'ticket_cancelled', 'rating_submitted', 'priority_changed',
                   'internal_note')),
  visibility     text not null default 'public' check (visibility in ('public', 'internal')),
  title          text not null,
  description    text,
  actor_type     text not null check (actor_type in ('student', 'agent', 'system', 'department')),
  -- quem fez (auditoria interna; nunca exposto ao estudante)
  actor_user_id  uuid references users (id) on delete set null,
  -- nome público (estudante ou equipe)
  actor_name     text,
  from_status    text,
  to_status      text,
  details        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index idx_support_events_ticket on support_ticket_events (ticket_id, created_at, seq);

-- Única alteração aceita: anonimizar o autor quando a conta é removida (on delete set null).
create or replace function support_events_append_only()
returns trigger language plpgsql as $$
begin
  if old.actor_user_id is not null and new.actor_user_id is null
     and (new.id, new.seq, new.ticket_id, new.type, new.visibility, new.title, new.description, new.actor_type,
          new.actor_name, new.from_status, new.to_status, new.details, new.created_at)
         is not distinct from
         (old.id, old.seq, old.ticket_id, old.type, old.visibility, old.title, old.description, old.actor_type,
          old.actor_name, old.from_status, old.to_status, old.details, old.created_at) then
    return new;
  end if;
  raise exception 'support_ticket_events é somente-inserção (auditoria): registre um novo evento';
end;
$$;

create trigger trg_support_events_append_only before update on support_ticket_events
  for each row execute function support_events_append_only();

-- -------------------------------------------------------------------------
-- Mensagens
-- -------------------------------------------------------------------------
create table support_ticket_messages (
  id                 uuid primary key,
  seq                bigserial not null,
  ticket_id          text not null references support_tickets (id) on delete cascade,
  sender_type        text not null check (sender_type in ('student', 'agent')),
  sender_user_id     uuid references users (id) on delete set null,
  sender_name        text not null,
  content            text not null check (char_length(content) <= 2000),
  -- idempotência do envio (reenvio após falha de rede não duplica)
  client_message_id  text,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  unique (ticket_id, client_message_id)
);

create index idx_support_messages_ticket on support_ticket_messages (ticket_id, created_at, seq);
create index idx_support_messages_unread on support_ticket_messages (ticket_id) where sender_type = 'agent' and read_at is null;

-- -------------------------------------------------------------------------
-- Anexos (pendentes: ticket_id nulo até a abertura/mensagem)
-- -------------------------------------------------------------------------
create table support_attachments (
  id                   uuid primary key,
  ticket_id            text references support_tickets (id) on delete cascade,
  message_id           uuid references support_ticket_messages (id) on delete set null,
  uploaded_by_type     text not null check (uploaded_by_type in ('student', 'agent')),
  uploaded_by_user_id  uuid references users (id) on delete set null,
  uploader_name        text not null,
  file_name            text not null check (char_length(file_name) between 1 and 120),
  mime_type            text not null,
  size_bytes           integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256               text not null,
  content              bytea not null,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz,
  check ((ticket_id is null) = (expires_at is not null))
);

create index idx_support_attachments_ticket on support_attachments (ticket_id, created_at);
create index idx_support_attachments_pending on support_attachments (expires_at) where ticket_id is null;

-- -------------------------------------------------------------------------
-- Avaliação (uma por chamado)
-- -------------------------------------------------------------------------
create table support_ticket_ratings (
  ticket_id   text primary key references support_tickets (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 500),
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Avisos do app (centro de avisos; também servem de payload para push)
-- -------------------------------------------------------------------------
create table support_notifications (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null references students (id) on delete cascade,
  ticket_id   text not null references support_tickets (id) on delete cascade,
  kind        text not null check (kind in ('ticket_received', 'status_changed', 'new_message', 'action_required', 'file_available', 'ticket_resolved', 'ticket_closed')),
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index idx_support_notifications_student on support_notifications (student_id, created_at desc);
create index idx_support_notifications_unread on support_notifications (student_id) where read_at is null;
