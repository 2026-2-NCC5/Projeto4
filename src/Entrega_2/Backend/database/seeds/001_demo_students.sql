-- =========================================================================
-- ASA Conecta — Seed 001 — Dados sintéticos de demonstração
--
-- TODOS os dados aqui são fictícios (TASK-001 §8, TASK-002 §31, TASK-004
-- §90). Não representam pessoas reais.
--
-- Um estudante por cenário oficial (TASK-002 §26):
--   student-demo-001  SCENARIO-002  atividade pendente (fluxo E2E-001)
--   student-demo-002  SCENARIO-001  sem alertas relevantes
--   student-demo-003  SCENARIO-003  frequência que merece atenção
--   student-demo-004  SCENARIO-004  desempenho que merece atenção
--   student-demo-005  SCENARIO-005  múltiplos fatores simultâneos
--   student-demo-006  SCENARIO-006  dados insuficientes (abstenção, E2E-005)
--   student-demo-007  SCENARIO-007  dados inconsistentes (validação humana)
--   student-demo-008  SCENARIO-008  validação humana necessária (E2E-006)
--
-- Senha fictícia de TODAS as contas de demonstração: Demo@2026
-- (armazenada apenas como hash bcrypt; troque em qualquer ambiente
-- que não seja de demonstração local).
-- =========================================================================

insert into users (id, email, password_hash, full_name, role) values
  ('00000000-0000-4000-8000-000000000001', 'estudante.exemplo@demo.asa',   '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Exemplo',    'student'),
  ('00000000-0000-4000-8000-000000000002', 'estudante.regular@demo.asa',   '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Regular',    'student'),
  ('00000000-0000-4000-8000-000000000003', 'estudante.frequencia@demo.asa','$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Frequência', 'student'),
  ('00000000-0000-4000-8000-000000000004', 'estudante.desempenho@demo.asa','$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Desempenho', 'student'),
  ('00000000-0000-4000-8000-000000000005', 'estudante.multiplo@demo.asa',  '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Múltiplo',   'student'),
  ('00000000-0000-4000-8000-000000000006', 'estudante.semdados@demo.asa',  '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Sem Dados',  'student'),
  ('00000000-0000-4000-8000-000000000007', 'estudante.inconsistente@demo.asa','$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Inconsistente', 'student'),
  ('00000000-0000-4000-8000-000000000008', 'estudante.validacao@demo.asa', '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Estudante Validação',  'student'),
  ('00000000-0000-4000-8000-000000000099', 'responsavel.exemplo@demo.asa', '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Responsável Exemplo',  'institutional_staff')
on conflict (id) do nothing;

insert into students (id, user_id, registration_number, program) values
  ('student-demo-001', '00000000-0000-4000-8000-000000000001', 'DEMO-2026-001', 'Ciências da Computação'),
  ('student-demo-002', '00000000-0000-4000-8000-000000000002', 'DEMO-2026-002', 'Ciências da Computação'),
  ('student-demo-003', '00000000-0000-4000-8000-000000000003', 'DEMO-2026-003', 'Análise e Desenvolvimento de Sistemas'),
  ('student-demo-004', '00000000-0000-4000-8000-000000000004', 'DEMO-2026-004', 'Ciências da Computação'),
  ('student-demo-005', '00000000-0000-4000-8000-000000000005', 'DEMO-2026-005', 'Administração'),
  ('student-demo-006', '00000000-0000-4000-8000-000000000006', 'DEMO-2026-006', 'Ciências Contábeis'),
  ('student-demo-007', '00000000-0000-4000-8000-000000000007', 'DEMO-2026-007', 'Ciências da Computação'),
  ('student-demo-008', '00000000-0000-4000-8000-000000000008', 'DEMO-2026-008', 'Ciências da Computação')
on conflict (id) do nothing;

insert into subjects (id, code, name) values
  ('subject-demo-001', 'CC501', 'Inteligência Artificial'),
  ('subject-demo-002', 'CC502', 'Banco de Dados'),
  ('subject-demo-003', 'CC503', 'Engenharia de Software'),
  ('subject-demo-004', 'CC504', 'Computação em Nuvem'),
  ('subject-demo-005', 'CC505', 'Estruturas de Dados')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-001 — SCENARIO-002 (atividade pendente)
-- 2 disciplinas, frequência boa, notas ok, 1 pendência com prazo próximo
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-001-1', 'student-demo-001', 'subject-demo-001', 'active'),
  ('enrollment-demo-001-2', 'student-demo-001', 'subject-demo-002', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-001-1', 'enrollment-demo-001-1', 'Prova 1', 'exam', 8.2, 10.0, current_date - 20),
  ('assessment-demo-001-2', 'enrollment-demo-001-2', 'Prova 1', 'exam', 7.0, 10.0, current_date - 18),
  ('assessment-demo-001-3', 'enrollment-demo-001-2', 'Trabalho prático', 'assignment', null, 10.0, current_date + 5)
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-001-1-' || g, 'enrollment-demo-001-1', current_date - (g * 3), (g <> 4)
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-001-2-' || g, 'enrollment-demo-001-2', current_date - (g * 3) - 1, true
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into pending_items (id, student_id, subject_id, type, description, due_date, status) values
  ('pending-demo-001', 'student-demo-001', 'subject-demo-002', 'assignment', 'Entrega do trabalho prático de Banco de Dados', current_date + 5, 'pending')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-002 — SCENARIO-001 (sem alertas relevantes)
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-002-1', 'student-demo-002', 'subject-demo-001', 'active'),
  ('enrollment-demo-002-2', 'student-demo-002', 'subject-demo-003', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-002-1', 'enrollment-demo-002-1', 'Prova 1', 'exam', 9.0, 10.0, current_date - 20),
  ('assessment-demo-002-2', 'enrollment-demo-002-2', 'Prova 1', 'exam', 8.5, 10.0, current_date - 15),
  ('assessment-demo-002-3', 'enrollment-demo-002-2', 'Projeto', 'project', 9.2, 10.0, current_date - 5)
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-002-1-' || g, 'enrollment-demo-002-1', current_date - (g * 3), true
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-002-2-' || g, 'enrollment-demo-002-2', current_date - (g * 3) - 1, (g <> 7)
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into pending_items (id, student_id, subject_id, type, description, due_date, status) values
  ('pending-demo-002-done', 'student-demo-002', 'subject-demo-003', 'assignment', 'Lista de exercícios 1', current_date - 10, 'completed')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-003 — SCENARIO-003 (frequência que merece atenção: 78%)
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-003-1', 'student-demo-003', 'subject-demo-004', 'active'),
  ('enrollment-demo-003-2', 'student-demo-003', 'subject-demo-001', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-003-1', 'enrollment-demo-003-1', 'Prova 1', 'exam', 7.5, 10.0, current_date - 20),
  ('assessment-demo-003-2', 'enrollment-demo-003-2', 'Prova 1', 'exam', 8.0, 10.0, current_date - 12)
on conflict (id) do nothing;

-- 18 aulas, 14 presenças = 77,8%
insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-003-1-' || g, 'enrollment-demo-003-1', current_date - (g * 2), (g not in (2, 5, 9, 14))
from generate_series(1, 18) as g
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-003-2-' || g, 'enrollment-demo-003-2', current_date - (g * 3) - 1, true
from generate_series(1, 10) as g
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-004 — SCENARIO-004 (desempenho que merece atenção: média 4,5)
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-004-1', 'student-demo-004', 'subject-demo-005', 'active'),
  ('enrollment-demo-004-2', 'student-demo-004', 'subject-demo-003', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-004-1', 'enrollment-demo-004-1', 'Prova 1', 'exam', 4.0, 10.0, current_date - 25),
  ('assessment-demo-004-2', 'enrollment-demo-004-1', 'Lista avaliativa', 'assignment', 5.0, 10.0, current_date - 10),
  ('assessment-demo-004-3', 'enrollment-demo-004-2', 'Prova 1', 'exam', 8.0, 10.0, current_date - 15)
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-004-1-' || g, 'enrollment-demo-004-1', current_date - (g * 3), true
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-004-2-' || g, 'enrollment-demo-004-2', current_date - (g * 3) - 1, true
from generate_series(1, 10) as g
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-005 — SCENARIO-005 (múltiplos fatores: pendência + frequência + desempenho)
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-005-1', 'student-demo-005', 'subject-demo-002', 'active'),
  ('enrollment-demo-005-2', 'student-demo-005', 'subject-demo-004', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-005-1', 'enrollment-demo-005-1', 'Prova 1', 'exam', 4.5, 10.0, current_date - 20),
  ('assessment-demo-005-2', 'enrollment-demo-005-1', 'Trabalho', 'assignment', 5.5, 10.0, current_date - 8),
  ('assessment-demo-005-3', 'enrollment-demo-005-2', 'Prova 1', 'exam', 7.0, 10.0, current_date - 15)
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-005-1-' || g, 'enrollment-demo-005-1', current_date - (g * 3), true
from generate_series(1, 10) as g
on conflict (id) do nothing;

-- 18 aulas, 14 presenças = 77,8%
insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-005-2-' || g, 'enrollment-demo-005-2', current_date - (g * 2) - 1, (g not in (3, 6, 11, 15))
from generate_series(1, 18) as g
on conflict (id) do nothing;

insert into pending_items (id, student_id, subject_id, type, description, due_date, status) values
  ('pending-demo-005-1', 'student-demo-005', 'subject-demo-002', 'assignment', 'Entrega do projeto de modelagem', current_date + 2, 'pending'),
  ('pending-demo-005-2', 'student-demo-005', 'subject-demo-004', 'assessment', 'Questionário sobre containers', current_date - 1, 'overdue')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-006 — SCENARIO-006 (dados insuficientes → abstenção)
-- sem matrículas, sem pendências, sem frequência, sem avaliações
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- student-demo-007 — SCENARIO-007 (dados inconsistentes → validação humana)
-- pendência aponta para disciplina sem matrícula; avaliação futura já tem nota
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-007-1', 'student-demo-007', 'subject-demo-001', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-007-1', 'enrollment-demo-007-1', 'Prova 1', 'exam', 8.0, 10.0, current_date - 20),
  ('assessment-demo-007-2', 'enrollment-demo-007-1', 'Prova 2', 'exam', 9.0, 10.0, current_date + 30)
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-007-1-' || g, 'enrollment-demo-007-1', current_date - (g * 3), true
from generate_series(1, 10) as g
on conflict (id) do nothing;

insert into pending_items (id, student_id, subject_id, type, description, due_date, status) values
  ('pending-demo-007-1', 'student-demo-007', 'subject-demo-005', 'document', 'Documento de matrícula pendente em Estruturas de Dados', current_date + 3, 'pending')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- student-demo-008 — SCENARIO-008 (frequência abaixo do mínimo institucional: 65%)
-- situação que pode afetar direitos → validação humana obrigatória
-- ---------------------------------------------------------------------
insert into enrollments (id, student_id, subject_id, status) values
  ('enrollment-demo-008-1', 'student-demo-008', 'subject-demo-002', 'active'),
  ('enrollment-demo-008-2', 'student-demo-008', 'subject-demo-003', 'active')
on conflict (id) do nothing;

insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
  ('assessment-demo-008-1', 'enrollment-demo-008-1', 'Prova 1', 'exam', 7.5, 10.0, current_date - 20),
  ('assessment-demo-008-2', 'enrollment-demo-008-2', 'Prova 1', 'exam', 8.0, 10.0, current_date - 12)
on conflict (id) do nothing;

-- 20 aulas, 13 presenças = 65%
insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-008-1-' || g, 'enrollment-demo-008-1', current_date - (g * 2), (g not in (1, 4, 6, 9, 12, 15, 18))
from generate_series(1, 20) as g
on conflict (id) do nothing;

insert into attendance (id, enrollment_id, class_date, present)
select 'attendance-demo-008-2-' || g, 'enrollment-demo-008-2', current_date - (g * 3) - 1, true
from generate_series(1, 10) as g
on conflict (id) do nothing;
