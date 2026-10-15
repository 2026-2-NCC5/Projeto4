-- =========================================================================
-- ASA Conecta — Migration 002 — Metadados das interações do assistente
--
-- Registra apenas metadados técnicos de cada mensagem enviada ao assistente
-- (voz ou texto) para rastreabilidade e observabilidade.
--
-- PRIVACIDADE: não há coluna para texto transcrito, pergunta digitada ou
-- áudio. Nenhum conteúdo da fala do estudante é persistido.
-- =========================================================================

create table assistant_interactions (
  interaction_id          text primary key,
  student_id              text not null references students (id) on delete cascade,
  input_type              text not null check (input_type in ('voice', 'text')),
  intent                  text not null,
  intent_confidence       numeric(4,3) not null check (intent_confidence >= 0 and intent_confidence <= 1),
  status                  text not null,
  run_id                  text references agent_runs (run_id) on delete set null,
  request_id              text not null,
  correlation_id          text not null,
  speech_recognition_ms   integer check (speech_recognition_ms is null or speech_recognition_ms >= 0),
  intent_duration_ms      integer not null check (intent_duration_ms >= 0),
  agent_duration_ms       integer check (agent_duration_ms is null or agent_duration_ms >= 0),
  total_duration_ms       integer not null check (total_duration_ms >= 0),
  created_at              timestamptz not null default now()
);

create index idx_assistant_interactions_student_created on assistant_interactions (student_id, created_at desc);
create index idx_assistant_interactions_correlation on assistant_interactions (correlation_id);

comment on table assistant_interactions is
  'Metadados de interações do assistente (voz/texto). Sem texto, transcrição ou áudio por decisão de privacidade.';
