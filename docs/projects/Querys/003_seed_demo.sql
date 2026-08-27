-- =========================================================================
-- ASA — Seed de demonstração — apenas dados fictícios/sintéticos
-- (TASK-001 §8, TASK-002 §31, TASK-004 §90: nunca usar dados reais aqui)
--
-- Pré-requisito: os usuários abaixo precisam existir em auth.users antes
-- de rodar este seed (crie-os pelo Supabase Auth e substitua os UUIDs).
-- =========================================================================

-- Substitua pelos UUIDs reais gerados no auth.users ao criar os usuários
-- de teste no Supabase Auth (Dashboard > Authentication > Users).
insert into app_users (id, role, full_name, email) values
  ('00000000-0000-0000-0000-000000000001', 'student', 'Estudante Exemplo', 'estudante.exemplo@demo.asa'),
  ('00000000-0000-0000-0000-000000000002', 'institutional_staff', 'Responsável Exemplo', 'responsavel.exemplo@demo.asa');

insert into students (id, registration_number, program) values
  ('00000000-0000-0000-0000-000000000001', 'DEMO-2026-001', 'Análise e Desenvolvimento de Sistemas');

insert into subjects (id, code, name) values
  ('10000000-0000-0000-0000-000000000001', 'ASA-101', 'Fundamentos de Sistemas Inteligentes'),
  ('10000000-0000-0000-0000-000000000002', 'ASA-102', 'Banco de Dados');

insert into enrollments (id, student_id, subject_id, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active');

insert into assessments (enrollment_id, title, type, score, max_score, applied_at) values
  ('20000000-0000-0000-0000-000000000001', 'Prova 1', 'exam', 6.5, 10.0, current_date - interval '20 days'),
  ('20000000-0000-0000-0000-000000000002', 'Trabalho prático', 'assignment', null, 10.0, current_date + interval '5 days');

insert into attendance (enrollment_id, class_date, present) values
  ('20000000-0000-0000-0000-000000000001', current_date - interval '7 days', true),
  ('20000000-0000-0000-0000-000000000001', current_date - interval '3 days', false);

insert into pending_items (student_id, subject_id, type, description, due_date, status) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'assignment', 'Entrega do trabalho prático de Banco de Dados', current_date + interval '5 days', 'pending');

-- Execução do agente (simulando uma abstenção por dados insuficientes)
insert into agent_runs (id, student_id, agent_version, config_version, request_id, correlation_id, status, confidence, abstained, abstention_reason, requires_human_validation) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '1.0.0', 'config-1.0.0', 'req-demo-001', 'corr-demo-001', 'recommendation', 0.82, false, null, false);

insert into agent_recommendations (id, agent_run_id, type, message, next_action, requires_human_validation) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'pending_activity', 'Considere revisar as atividades pendentes da disciplina.', 'Consultar as atividades da disciplina no aplicativo.', false);

insert into agent_evidence (recommendation_id, evidence_type, description, source_reference) values
  ('40000000-0000-0000-0000-000000000001', 'pending_item', 'Existe uma atividade sem registro de conclusão.', 'pending_items');
