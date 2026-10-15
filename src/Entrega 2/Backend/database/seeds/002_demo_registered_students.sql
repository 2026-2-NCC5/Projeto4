-- =========================================================================
-- ASA Conecta — Seed 002 — Dados acadêmicos fictícios para contas cadastradas
--
-- Contas criadas pelo cadastro do app nascem sem matrículas, e as telas
-- Início/Acadêmico ficam vazias. Este seed dá a cada estudante cadastrado
-- (id fora de student-demo-*) que ainda não tem matrículas um semestre
-- fictício: 5 disciplinas, notas, frequência e pendências.
--
-- Os estudantes student-demo-* não são tocados: cada um representa um
-- cenário oficial do agente (seed 001), inclusive o de dados insuficientes.
--
-- Idempotente: só age sobre quem não tem matrícula; os ids são derivados
-- do id do estudante e todos os inserts usam on conflict do nothing.
-- TODOS os dados são fictícios.
-- =========================================================================

insert into subjects (id, code, name) values
  ('subject-demo-006', 'CC506', 'Desenvolvimento Mobile')
on conflict (id) do nothing;

do $$
declare
  s record;
  e text; -- prefixo dos ids deste estudante
begin
  for s in
    select st.id
      from students st
     where st.id not like 'student-demo-%'
       and not exists (select 1 from enrollments en where en.student_id = st.id)
  loop
    e := 'seed-' || s.id;

    insert into enrollments (id, student_id, subject_id, status) values
      (e || '-ia',     s.id, 'subject-demo-001', 'active'),
      (e || '-bd',     s.id, 'subject-demo-002', 'active'),
      (e || '-es',     s.id, 'subject-demo-003', 'active'),
      (e || '-ed',     s.id, 'subject-demo-005', 'active'),
      (e || '-mobile', s.id, 'subject-demo-006', 'active')
    on conflict do nothing;

    -- Notas: bom desempenho geral; Estruturas de Dados merece atenção (média 5,5)
    insert into assessments (id, enrollment_id, title, type, score, max_score, applied_at) values
      (e || '-ia-p1',     e || '-ia',     'Prova 1',                      'exam',       8.5,  10.0, current_date - 30),
      (e || '-ia-t1',     e || '-ia',     'Trabalho de redes neurais',    'assignment', 9.0,  10.0, current_date - 12),
      (e || '-bd-p1',     e || '-bd',     'Prova 1',                      'exam',       7.0,  10.0, current_date - 28),
      (e || '-bd-proj',   e || '-bd',     'Projeto de modelagem',         'project',    null, 10.0, current_date + 9),
      (e || '-es-p1',     e || '-es',     'Prova 1',                      'exam',       6.5,  10.0, current_date - 26),
      (e || '-es-sem',    e || '-es',     'Seminário de metodologias ágeis', 'other',   8.0,  10.0, current_date - 6),
      (e || '-ed-p1',     e || '-ed',     'Prova 1',                      'exam',       5.0,  10.0, current_date - 24),
      (e || '-ed-l2',     e || '-ed',     'Lista avaliativa 2',           'assignment', 6.0,  10.0, current_date - 9),
      (e || '-mobile-p1', e || '-mobile', 'Prova 1',                      'exam',       9.5,  10.0, current_date - 20),
      (e || '-mobile-app',e || '-mobile', 'Protótipo do app',             'project',    8.8,  10.0, current_date - 4)
    on conflict do nothing;

    -- Frequência: 12 aulas por disciplina (uma por semana);
    -- Desenvolvimento Mobile tem 18 aulas e 14 presenças (77,8%, merece atenção)
    insert into attendance (id, enrollment_id, class_date, present)
    select e || '-ia-' || g, e || '-ia', current_date - (g * 7), (g <> 5)
    from generate_series(1, 12) as g
    on conflict do nothing;

    insert into attendance (id, enrollment_id, class_date, present)
    select e || '-bd-' || g, e || '-bd', current_date - (g * 7) - 1, true
    from generate_series(1, 12) as g
    on conflict do nothing;

    insert into attendance (id, enrollment_id, class_date, present)
    select e || '-es-' || g, e || '-es', current_date - (g * 7) - 2, (g not in (3, 8))
    from generate_series(1, 12) as g
    on conflict do nothing;

    insert into attendance (id, enrollment_id, class_date, present)
    select e || '-ed-' || g, e || '-ed', current_date - (g * 7) - 3, (g <> 10)
    from generate_series(1, 12) as g
    on conflict do nothing;

    insert into attendance (id, enrollment_id, class_date, present)
    select e || '-mobile-' || g, e || '-mobile', current_date - (g * 4), (g not in (2, 6, 11, 15))
    from generate_series(1, 18) as g
    on conflict do nothing;

    insert into pending_items (id, student_id, subject_id, type, description, due_date, status) values
      (e || '-pend-ed',   s.id, 'subject-demo-005', 'assignment', 'Lista de exercícios 3 — árvores balanceadas', current_date + 3,  'pending'),
      (e || '-pend-bd',   s.id, 'subject-demo-002', 'assignment', 'Entrega do projeto de modelagem do banco',    current_date + 9,  'pending'),
      (e || '-pend-doc',  s.id, null,               'document',   'Atualizar comprovante de residência na Secretaria', current_date + 15, 'pending'),
      (e || '-pend-ia',   s.id, 'subject-demo-001', 'assessment', 'Questionário sobre aprendizado supervisionado', current_date - 2, 'overdue'),
      (e || '-pend-es',   s.id, 'subject-demo-003', 'assignment', 'Resumo do seminário de metodologias ágeis',   current_date - 7,  'completed')
    on conflict do nothing;
  end loop;
end
$$;
