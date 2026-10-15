-- =========================================================================
-- ASA Conecta — Migration 009 — Metas de SLA e automações do atendimento
--
-- - sla_policies: metas por categoria (primeira resposta em horas e solução
--   em dias úteis) editáveis pela administração. Sem linha, vale o padrão do
--   catálogo versionado no código (ADR-006). Chamados já abertos mantêm o
--   prazo calculado na abertura.
-- - automation_rules / automation_runs: motor mínimo e seguro. Gatilhos
--   aprovados (abertura, prazo próximo, prazo excedido), condições por
--   categoria/prioridade e ações limitadas (avisar a equipe, elevar a
--   prioridade). Nunca envia mensagem ao aluno nem muda a situação do
--   chamado em nome de uma pessoa. Cada regra roda no máximo uma vez por
--   chamado e gatilho (idempotência por restrição única).
-- =========================================================================

create table sla_policies (
  category_id               text primary key,
  first_response_hours      integer not null check (first_response_hours between 1 and 240),
  resolution_business_days  integer not null check (resolution_business_days between 1 and 30),
  updated_by                uuid references users (id) on delete set null,
  updated_at                timestamptz not null default now()
);

comment on table sla_policies is
  'Metas de SLA por categoria do atendimento (sobrepõem o padrão do catálogo). Valem para chamados abertos depois da alteração.';

create table automation_rules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 3 and 120),
  description    text check (description is null or char_length(description) <= 300),
  trigger        text not null check (trigger in ('ticket_created', 'sla_near_deadline', 'sla_overdue')),
  -- {"categoryIds": [...], "priorities": [...]} — vazio = qualquer
  conditions     jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  action         text not null check (action in ('notify_staff', 'raise_priority')),
  -- notify_staff: {"audience": "team" | "assigned"} · raise_priority: {"priority": "high" | "urgent"}
  action_params  jsonb not null default '{}'::jsonb check (jsonb_typeof(action_params) = 'object'),
  enabled        boolean not null default false,
  created_by     uuid references users (id) on delete set null,
  updated_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_automation_rules_updated_at before update on automation_rules
  for each row execute function set_updated_at();

create table automation_runs (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references automation_rules (id) on delete cascade,
  ticket_id   text not null references support_tickets (id) on delete cascade,
  trigger     text not null,
  status      text not null check (status in ('applied', 'skipped', 'failed')),
  detail      text check (detail is null or char_length(detail) <= 300),
  created_at  timestamptz not null default now(),
  -- idempotência: uma execução por regra, chamado e gatilho (mesmo com vários processos)
  unique (rule_id, ticket_id, trigger)
);

create index idx_automation_runs_rule on automation_runs (rule_id, created_at desc);

comment on table automation_runs is 'Histórico das automações executadas (uma por regra, chamado e gatilho).';
