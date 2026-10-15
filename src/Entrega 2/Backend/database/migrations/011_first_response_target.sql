-- =========================================================================
-- ASA Conecta — Migration 011 — Meta de primeira resposta da equipe
--
-- O prazo da primeira resposta é gravado na ABERTURA do chamado a partir da
-- meta vigente da categoria (sla_policies.first_response_hours; padrão 24 h
-- corridas). A primeira resposta é a primeira ação pública da equipe no
-- histórico (mensagem, assumir, encaminhar, resolver) — já registrada em
-- support_ticket_events, sem coluna nova. Chamados abertos antes desta
-- migration ficam sem meta (null) e não entram no indicador.
-- =========================================================================

alter table support_tickets add column if not exists first_response_due_at timestamptz;

comment on column support_tickets.first_response_due_at is
  'Prazo da primeira resposta da equipe, calculado na abertura a partir da meta da categoria (horas corridas).';
