-- =========================================================================
-- ASA Conecta — Migration 005 — Fila presencial do ASA + notificações push
--
-- A fila pública (https://presencial.fecap.br/) é lida por UM monitor no backend;
-- aqui ficam apenas dados internos do ASA Conecta:
-- - acompanhamentos temporários (estudante ↔ senha do dia) — nunca expostos;
-- - eventos de cada acompanhamento (linha do tempo + idempotência dos alertas);
-- - histórico de chamadas observadas e o último snapshot (cache entre instâncias);
-- - dispositivos para push e o registro de entregas (idempotência e auditoria).
--
-- PRIVACIDADE: tokens de push só aparecem mascarados nos logs; senhas do painel
-- não identificam o estudante e o vínculo expira no fim do dia.
-- =========================================================================

create table queue_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users (id) on delete cascade,
  -- senha como texto: zeros à esquerda fazem parte dela ("0029")
  ticket             text not null check (char_length(ticket) between 1 and 12),
  ticket_key         text not null,
  service_date       date not null,
  status             text not null check (status in ('waiting', 'approaching', 'next', 'called', 'completed', 'expired', 'cancelled')),
  position           integer check (position is null or position > 0),
  ahead              integer check (ahead is null or ahead >= 0),
  called_desk        text,
  called_at          timestamptz,
  call_source_id     text,
  already_called     boolean not null default false,
  -- alerta mais urgente já disparado: avança só para frente (idempotência entre ciclos/instâncias)
  last_alert         text check (last_alert is null or last_alert in ('QUEUE_5_AHEAD', 'QUEUE_3_AHEAD', 'QUEUE_NEXT', 'QUEUE_CALLED')),
  push_enabled       boolean not null default true,
  voice_enabled      boolean not null default true,
  vibration_enabled  boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  ended_at           timestamptz
);

-- no máximo um acompanhamento ativo por estudante
create unique index uq_queue_subscriptions_active_user on queue_subscriptions (user_id)
  where status in ('waiting', 'approaching', 'next', 'called');
create index idx_queue_subscriptions_active on queue_subscriptions (service_date)
  where status in ('waiting', 'approaching', 'next', 'called');
create index idx_queue_subscriptions_user_recent on queue_subscriptions (user_id, service_date desc, created_at desc);

comment on table queue_subscriptions is
  'Acompanhamento temporário de uma senha da fila presencial do ASA. Vale só para o dia (expires_at); nunca é público.';

create table queue_subscription_events (
  id               bigserial primary key,
  subscription_id  uuid not null references queue_subscriptions (id) on delete cascade,
  event_type       text not null check (event_type in ('subscribed', 'QUEUE_5_AHEAD', 'QUEUE_3_AHEAD', 'QUEUE_NEXT', 'QUEUE_CALLED', 'completed', 'expired', 'cancelled')),
  ahead            integer check (ahead is null or ahead >= 0),
  desk             text,
  occurred_at      timestamptz not null default now(),
  -- cada marco acontece no máximo uma vez por acompanhamento
  unique (subscription_id, event_type)
);

comment on table queue_subscription_events is
  'Linha do tempo de cada acompanhamento ("Seu acompanhamento") e controle de idempotência dos alertas.';

create table queue_calls (
  call_key      text primary key,
  service_date  date not null,
  ticket        text not null,
  desk          text,
  called_at     timestamptz,
  observed_at   timestamptz not null default now()
);

create index idx_queue_calls_date on queue_calls (service_date desc, called_at desc);

comment on table queue_calls is
  'Chamadas observadas no painel público do ASA (senha, mesa e horário). Sem dados de estudantes.';

create table queue_monitor_state (
  id                    smallint primary key default 1 check (id = 1),
  snapshot              jsonb,
  last_success_at       timestamptz,
  last_error            text,
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  updated_at            timestamptz not null default now()
);

comment on table queue_monitor_state is
  'Último snapshot válido da fila e saúde do monitor (cache compartilhado entre instâncias da API).';

-- -------------------------------------------------------------------------
-- Notificações push (Expo Push Service)
-- -------------------------------------------------------------------------
create table push_devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  token            text not null unique,
  platform         text not null check (platform in ('ios', 'android', 'web')),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  disabled_at      timestamptz,
  disabled_reason  text
);

create index idx_push_devices_user_active on push_devices (user_id) where disabled_at is null;

comment on table push_devices is
  'Tokens de push do Expo por aparelho. Desativados quando o serviço informa DeviceNotRegistered ou no logout.';

create table notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users (id) on delete cascade,
  idempotency_key      text not null unique,
  category             text not null,
  status               text not null check (status in ('pending', 'sent', 'partial', 'failed', 'skipped')),
  attempts             integer not null default 0 check (attempts >= 0),
  devices              integer not null default 0 check (devices >= 0),
  provider_ticket_ids  text[] not null default '{}',
  error                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_notification_deliveries_user_created on notification_deliveries (user_id, created_at desc);

comment on table notification_deliveries is
  'Uma linha por notificação lógica (chave de idempotência): impede push duplicado e registra o resultado da entrega.';
