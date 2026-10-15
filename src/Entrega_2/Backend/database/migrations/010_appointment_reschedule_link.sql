-- =========================================================================
-- ASA Conecta — Migration 010 — Remarcação: vínculo do agendamento antigo para o novo
--
-- O agendamento remarcado (cancelado) passa a apontar para o substituto na
-- leitura (`rescheduledToId`), sem coluna nova: a busca é pelo
-- `rescheduled_from` do substituto. Índice parcial para essa busca.
-- =========================================================================

create index if not exists idx_appointments_rescheduled_from on appointments (rescheduled_from) where rescheduled_from is not null;
