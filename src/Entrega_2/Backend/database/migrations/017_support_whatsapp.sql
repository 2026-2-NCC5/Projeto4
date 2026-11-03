-- =========================================================================
-- ASA Conecta — Migration 017 — Central de Atendimento WhatsApp
--
-- Evolui o Atendimento ASA (migration 004) em vez de criar um segundo domínio:
-- o chamado, o histórico, as mensagens e os anexos continuam sendo os mesmos
-- registros, agora com origem WhatsApp e um log de eventos para tempo real.
--
-- O QUE NÃO FOI DUPLICADO (ver docs/whatsapp/00-audit.md)
-- - notas internas: continuam sendo eventos `internal_note` em support_ticket_events;
-- - auditoria: continua em audit_events (migration 006);
-- - filas: continuam sendo as equipes do catálogo (assigned_team);
-- - SLA: continua nas metas da administração (migration 009).
--
-- REGRAS
-- - Telefone/JID nunca fica em texto puro: `*_fingerprint` (HMAC, para correlação)
--   + `*_encrypted` (AES-256-GCM, chave fora do repositório) + `*_masked` (exibição).
-- - Estudante nunca é criado a partir de um número. Conversa sem vínculo verificado
--   fica sem student_id e o chamado aparece só para a equipe.
-- - support_event_log é só-inserção; a leitura respeita a ordem de commit
--   (tx_id < pg_snapshot_xmin), senão um leitor perderia eventos de transações lentas.
-- - O status de entrega (delivery_state) é da mensagem; nunca é o status do chamado.
--
-- Reversão: database/rollback/017_support_whatsapp.down.sql
-- =========================================================================

-- -------------------------------------------------------------------------
-- Canais e conexão com o provedor
-- -------------------------------------------------------------------------
create table support_channels (
  id                       uuid primary key default gen_random_uuid(),
  type                     text not null default 'whatsapp' check (type in ('whatsapp')),
  name                     text not null check (char_length(name) between 3 and 80),
  provider                 text not null check (provider in ('fake', 'wa-akg', 'meta-cloud-api')),
  state                    text not null default 'enabled' check (state in ('enabled', 'paused', 'disabled')),
  -- equipe (fila) que recebe as conversas novas deste canal
  team                     text not null,
  -- número institucional exibido ao estudante na vinculação; nunca um número pessoal
  public_number            text check (public_number is null or public_number ~ '^\+[0-9]{8,15}$'),
  -- referência ao documento que autoriza o uso do número (exigida para conectar provedor real)
  authorization_reference  text check (authorization_reference is null or char_length(authorization_reference) <= 200),
  is_demo                  boolean not null default false,
  created_by               uuid references users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table support_channels is 'Canais de atendimento institucionais. Credenciais nunca ficam aqui: só em variáveis de ambiente.';

create table support_provider_connections (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null unique references support_channels (id) on delete cascade,
  -- só reflete o que o provedor confirmou; sem confirmação, nunca CONNECTED
  status                text not null default 'DISCONNECTED' check (status in ('DISCONNECTED', 'CONNECTING', 'QR_REQUIRED', 'CONNECTED', 'DEGRADED', 'ERROR')),
  -- decisão da administração: a leitura de estado nunca religa um canal que ela desconectou (ou nunca conectou)
  desired_connected     boolean not null default false,
  external_session_id   text,
  masked_number         text,
  last_connected_at     timestamptz,
  last_disconnected_at  timestamptz,
  last_error_code       text,
  health_checked_at     timestamptz,
  last_webhook_at       timestamptz,
  -- disjuntor do provedor: falhas seguidas abrem o circuito até esse instante
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  circuit_open_until    timestamptz,
  -- simulador do provedor fake (sem efeito nos demais): próximo envio falha, rejeita ou fica ambíguo
  fake_next_send        text check (fake_next_send is null or fake_next_send in ('fail', 'reject', 'timeout')),
  updated_at            timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Consentimento e vínculo verificado estudante ↔ WhatsApp
-- -------------------------------------------------------------------------
create table support_consent_records (
  id           uuid primary key default gen_random_uuid(),
  student_id   text not null references students (id) on delete cascade,
  scope        text not null check (scope in ('whatsapp_support')),
  channel      text not null check (channel in ('whatsapp')),
  source       text not null check (source in ('app', 'web')),
  -- versão do aviso de privacidade aceito
  version      text not null check (char_length(version) between 1 and 40),
  accepted_at  timestamptz not null,
  revoked_at   timestamptz
);

create index idx_support_consent_student on support_consent_records (student_id, accepted_at desc);

create table support_contact_links (
  id                   uuid primary key default gen_random_uuid(),
  student_id           text not null references students (id) on delete cascade,
  contact_fingerprint  text not null,
  contact_encrypted    text not null,
  contact_masked       text not null,
  verification_method  text not null check (verification_method in ('whatsapp_inbound_code')),
  verified_at          timestamptz not null,
  consent_record_id    uuid not null references support_consent_records (id),
  revoked_at           timestamptz,
  created_at           timestamptz not null default now()
);

-- um contato ativo pertence a um único estudante
create unique index uq_support_contact_links_active on support_contact_links (contact_fingerprint) where revoked_at is null;
create index idx_support_contact_links_student on support_contact_links (student_id) where revoked_at is null;

create table support_contact_verifications (
  id                   uuid primary key default gen_random_uuid(),
  student_id           text not null references students (id) on delete cascade,
  channel_id           uuid not null references support_channels (id) on delete cascade,
  -- HMAC do código de uso único; o código em si nunca é armazenado
  code_hash            text not null,
  status               text not null check (status in ('pending', 'proven', 'confirmed', 'expired', 'cancelled', 'review_required')),
  consent_version      text not null,
  consent_source       text not null check (consent_source in ('app', 'web')),
  contact_fingerprint  text,
  contact_encrypted    text,
  contact_masked       text,
  expires_at           timestamptz not null,
  proven_at            timestamptz,
  confirmed_at         timestamptz,
  created_at           timestamptz not null default now()
);

create unique index uq_support_contact_verifications_code on support_contact_verifications (code_hash) where status = 'pending';
create index idx_support_contact_verifications_student on support_contact_verifications (student_id, created_at desc);
create index idx_support_contact_verifications_review on support_contact_verifications (created_at desc) where status = 'review_required';

-- -------------------------------------------------------------------------
-- Conversas: podem começar sem estudante identificado
-- -------------------------------------------------------------------------
create table support_conversations (
  id                   uuid primary key default gen_random_uuid(),
  channel_id           uuid not null references support_channels (id) on delete restrict,
  contact_fingerprint  text not null,
  contact_encrypted    text not null,
  contact_masked       text not null,
  -- nome informado pelo próprio WhatsApp: dado não verificado, nunca identidade
  contact_display_name text check (contact_display_name is null or char_length(contact_display_name) <= 120),
  student_id           text references students (id) on delete set null,
  contact_link_id      uuid references support_contact_links (id) on delete set null,
  linked_at            timestamptz,
  -- janela de atendimento de provedores oficiais é calculada a partir daqui
  last_inbound_at      timestamptz,
  last_outbound_at     timestamptz,
  last_message_at      timestamptz,
  -- pedido de parar de receber mensagens: novas respostas ficam bloqueadas até a pessoa voltar a escrever
  opted_out_at         timestamptz,
  created_at           timestamptz not null default now(),
  unique (channel_id, contact_fingerprint)
);

create index idx_support_conversations_student on support_conversations (student_id) where student_id is not null;
create index idx_support_conversations_recent on support_conversations (channel_id, last_message_at desc);

-- -------------------------------------------------------------------------
-- Chamados: origem WhatsApp, estudante opcional e sequência monotônica
-- -------------------------------------------------------------------------
alter table support_tickets alter column student_id drop not null;
alter table support_tickets drop constraint support_tickets_channel_check;
alter table support_tickets add constraint support_tickets_channel_check check (channel in ('app', 'web', 'whatsapp'));
alter table support_tickets add column conversation_id uuid references support_conversations (id) on delete set null;
alter table support_tickets add column last_sequence bigint not null default 0;
-- chamado sem estudante só existe quando veio de uma conversa
alter table support_tickets add constraint support_tickets_owner_check check (student_id is not null or conversation_id is not null or channel = 'whatsapp');

-- uma conversa tem no máximo um chamado aberto (webhooks concorrentes não abrem dois)
create unique index uq_support_tickets_open_conversation on support_tickets (conversation_id)
  where conversation_id is not null and status not in ('resolved', 'closed', 'cancelled');
create index idx_support_tickets_assignee_status on support_tickets (assigned_agent_id, status, updated_at desc);
create index idx_support_tickets_team_status on support_tickets (assigned_team, status, priority);
create index idx_support_tickets_channel_updated on support_tickets (channel, updated_at desc);
create index idx_support_tickets_unidentified on support_tickets (updated_at desc) where student_id is null;

-- -------------------------------------------------------------------------
-- Mensagens: transporte, entrega e visibilidade
-- -------------------------------------------------------------------------
alter table support_ticket_messages drop constraint support_ticket_messages_sender_type_check;
alter table support_ticket_messages add constraint support_ticket_messages_sender_type_check check (sender_type in ('student', 'agent', 'contact'));
-- o WhatsApp aceita mensagens maiores que o limite do formulário; o excesso é cortado com aviso no serviço
alter table support_ticket_messages drop constraint support_ticket_messages_content_check;
alter table support_ticket_messages add constraint support_ticket_messages_content_check check (char_length(content) <= 8000);
alter table support_ticket_messages add column transport text not null default 'in_app' check (transport in ('in_app', 'whatsapp'));
alter table support_ticket_messages add column channel_id uuid references support_channels (id) on delete set null;
alter table support_ticket_messages add column external_message_id text;
alter table support_ticket_messages add column delivery_state text not null default 'not_applicable'
  check (delivery_state in ('not_applicable', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown'));
alter table support_ticket_messages add column delivery_error_code text;
alter table support_ticket_messages add column delivery_updated_at timestamptz;
alter table support_ticket_messages add column provider_timestamp timestamptz;
alter table support_ticket_messages add column content_kind text not null default 'text'
  check (content_kind in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contact', 'unsupported'));
alter table support_ticket_messages add column reply_to_external_id text;
-- mensagem do WhatsApp só aparece no app do estudante com vínculo verificado e espelhamento autorizado
alter table support_ticket_messages add column student_visible boolean not null default true;

-- idempotência de mensagens do provedor (provedor + canal + id externo)
create unique index uq_support_messages_external on support_ticket_messages (channel_id, external_message_id) where external_message_id is not null;
create index idx_support_messages_delivery on support_ticket_messages (ticket_id, delivery_state) where transport = 'whatsapp';

-- -------------------------------------------------------------------------
-- Anexos: origem, visibilidade e análise
-- -------------------------------------------------------------------------
alter table support_attachments drop constraint support_attachments_uploaded_by_type_check;
alter table support_attachments add constraint support_attachments_uploaded_by_type_check check (uploaded_by_type in ('student', 'agent', 'contact'));
alter table support_attachments add column origin text not null default 'upload' check (origin in ('upload', 'whatsapp'));
alter table support_attachments add column provider_media_ref text;
alter table support_attachments add column student_visible boolean not null default true;
alter table support_attachments add column review_status text not null default 'received' check (review_status in ('received', 'analyzed', 'rejected', 'released'));

-- -------------------------------------------------------------------------
-- Etiquetas, respostas salvas e presença
-- -------------------------------------------------------------------------
create table support_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 40),
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table support_ticket_tags (
  ticket_id   text not null references support_tickets (id) on delete cascade,
  tag_id      uuid not null references support_tags (id) on delete cascade,
  added_by    uuid references users (id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (ticket_id, tag_id)
);

create index idx_support_ticket_tags_tag on support_ticket_tags (tag_id, ticket_id);

create table support_saved_replies (
  id               uuid primary key default gen_random_uuid(),
  category_id      text,
  title            text not null check (char_length(title) between 3 and 80),
  body             text not null check (char_length(body) between 1 and 2000),
  approval_status  text not null default 'draft' check (approval_status in ('draft', 'approved', 'archived')),
  created_by       uuid references users (id) on delete set null,
  approved_by      uuid references users (id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_support_saved_replies_status on support_saved_replies (approval_status, title);

-- presença: linhas antigas são ignoradas na leitura e removidas pela manutenção
create table support_ticket_presence (
  ticket_id     text not null references support_tickets (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  composing     boolean not null default false,
  last_seen_at  timestamptz not null,
  primary key (ticket_id, user_id)
);

-- -------------------------------------------------------------------------
-- Inbox (webhooks): deduplicação e reprocessamento
-- -------------------------------------------------------------------------
create table support_inbox_dedup (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  channel_id         uuid not null references support_channels (id) on delete cascade,
  provider_event_id  text not null,
  kind               text not null check (kind in ('message', 'delivery', 'connection')),
  status             text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  -- evento canônico cifrado; apagado quando o processamento termina
  payload_encrypted  text,
  attempt_count      integer not null default 0,
  error_code         text,
  -- reprocessamento com espera crescente; também serve de concessão (várias instâncias não pegam a mesma linha)
  next_attempt_at    timestamptz not null default now(),
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  unique (provider, channel_id, provider_event_id)
);

create index idx_support_inbox_pending on support_inbox_dedup (next_attempt_at) where status in ('received', 'failed');

-- -------------------------------------------------------------------------
-- Outbox: envio confiável e reprocessável
-- -------------------------------------------------------------------------
create table support_outbox (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('whatsapp.send')),
  ticket_id        text not null references support_tickets (id) on delete cascade,
  message_id       uuid not null references support_ticket_messages (id) on delete cascade,
  channel_id       uuid not null references support_channels (id) on delete restrict,
  -- impede dois envios para a mesma tentativa
  dedupe_key       text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'unknown')),
  attempt_count    integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  locked_until     timestamptz,
  last_error_code  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_support_outbox_ready on support_outbox (next_attempt_at) where status in ('pending', 'processing');
create index idx_support_outbox_backlog on support_outbox (status, created_at);

-- -------------------------------------------------------------------------
-- Log de eventos (tempo real e reconciliação por cursor)
-- -------------------------------------------------------------------------
create table support_event_log (
  id              bigserial primary key,
  event_id        uuid not null unique default gen_random_uuid(),
  tx_id           xid8 not null default pg_current_xact_id(),
  ticket_id       text references support_tickets (id) on delete cascade,
  -- sequência monotônica por chamado (nula em eventos de canal)
  sequence        bigint,
  type            text not null,
  audience        text not null check (audience in ('STUDENT_VISIBLE', 'STAFF_ONLY', 'ADMIN_ONLY')),
  -- dono do chamado no momento do evento: filtro do feed do estudante
  student_id      text references students (id) on delete set null,
  actor_type      text not null,
  actor_user_id   uuid references users (id) on delete set null,
  correlation_id  text,
  -- só identificadores e rótulos públicos: nunca conteúdo de mensagem, telefone ou nota
  data            jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  unique (ticket_id, sequence)
);

create index idx_support_event_log_feed on support_event_log (tx_id, id);
create index idx_support_event_log_student on support_event_log (student_id, tx_id, id) where audience = 'STUDENT_VISIBLE';
create index idx_support_event_log_retention on support_event_log (occurred_at);

-- até onde a retenção já apagou: cursor anterior a isto perdeu eventos e precisa recarregar tudo
create table support_event_log_state (
  id                 boolean primary key default true check (id),
  purged_through_tx  xid8 not null,
  updated_at         timestamptz not null default now()
);

create or replace function support_event_log_append_only()
returns trigger language plpgsql as $$
begin
  -- on delete set null (autor ou estudante removidos) continua permitido; o restante é imutável
  if (new.id, new.event_id, new.tx_id, new.ticket_id, new.sequence, new.type, new.audience, new.actor_type, new.correlation_id, new.data, new.occurred_at)
     is not distinct from
     (old.id, old.event_id, old.tx_id, old.ticket_id, old.sequence, old.type, old.audience, old.actor_type, old.correlation_id, old.data, old.occurred_at) then
    return new;
  end if;
  raise exception 'support_event_log é somente-inserção: registre um novo evento';
end;
$$;

create trigger trg_support_event_log_append_only before update on support_event_log
  for each row execute function support_event_log_append_only();
