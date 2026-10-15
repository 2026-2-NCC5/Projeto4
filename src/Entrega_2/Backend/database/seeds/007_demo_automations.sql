-- =========================================================================
-- ASA Conecta — Seed 007 — Regras de automação de exemplo (DESLIGADAS)
--
-- Exemplos para a administração revisar e ligar. Nenhuma roda até alguém
-- ativá-la no portal (Administração → Automações). Idempotente.
-- =========================================================================

insert into automation_rules (id, name, description, trigger, conditions, action, action_params, enabled) values
  ('b0000000-0000-4000-8000-000000000001', 'Avisar a equipe sobre novos chamados de Matrícula',
   'Matrícula tem prazos curtos: a equipe recebe um aviso no portal quando um chamado da categoria é aberto.',
   'ticket_created', '{"categoryIds": ["enrollment"]}', 'notify_staff', '{"audience": "team"}', false),
  ('b0000000-0000-4000-8000-000000000002', 'Avisar o responsável quando o prazo estiver perto',
   'O atendente que assumiu o chamado recebe um aviso quando o prazo entra nas últimas horas.',
   'sla_near_deadline', '{}', 'notify_staff', '{"audience": "assigned"}', false),
  ('b0000000-0000-4000-8000-000000000003', 'Elevar a prioridade quando o prazo estourar',
   'Chamado com prazo excedido passa para prioridade alta (registro interno, sem mensagem ao aluno).',
   'sla_overdue', '{}', 'raise_priority', '{"priority": "high"}', false)
on conflict (id) do nothing;
