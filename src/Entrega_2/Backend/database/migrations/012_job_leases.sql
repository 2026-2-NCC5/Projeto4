-- =========================================================================
-- ASA Conecta — Migration 012 — Concessões (leases) de tarefas compartilhadas
--
-- Coordena quem executa uma tarefa periódica quando há várias instâncias da API
-- (funções serverless na Vercel, worker residente, réplicas). Substitui o
-- advisory lock de SESSÃO do monitor da fila, que prende uma conexão dedicada e
-- não funciona pelo pooler em modo transação (Supabase, porta 6543).
--
-- Uma linha por tarefa: quem a detém (holder) e até quando (lease_until). Tomar
-- ou renovar é um único UPDATE condicional — atômico e sem conexão reservada.
-- =========================================================================

create table if not exists job_leases (
  name         text primary key check (char_length(name) between 1 and 120),
  holder       text not null check (char_length(holder) between 1 and 200),
  lease_until  timestamptz not null,
  updated_at   timestamptz not null default now()
);

comment on table job_leases is
  'Concessões de tarefas compartilhadas entre instâncias (ex.: leitura da fila presencial). Expiram sozinhas.';
