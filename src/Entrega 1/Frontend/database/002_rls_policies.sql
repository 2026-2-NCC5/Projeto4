-- =========================================================================
-- ASA — Migration 002 — Row Level Security
--
-- Regra vinda de TASK-003 §5.5 e TASK-004 §91 checklist:
-- "o estudante deverá visualizar somente seus próprios dados" e
-- "o usuário não pode selecionar arbitrariamente dados de outro estudante".
--
-- A API Node.js normalmente acessa o banco com uma service role (que
-- ignora RLS). Estas policies existem para o caso de o Supabase client
-- ser usado diretamente com o JWT do estudante (auth.uid()), e como
-- camada extra de segurança caso a service role não seja usada em algum
-- ponto do fluxo.
-- =========================================================================

alter table app_users            enable row level security;
alter table students             enable row level security;
alter table enrollments          enable row level security;
alter table assessments          enable row level security;
alter table attendance           enable row level security;
alter table pending_items        enable row level security;
alter table agent_runs           enable row level security;
alter table agent_recommendations enable row level security;
alter table agent_evidence       enable row level security;
alter table agent_feedback       enable row level security;

-- subjects não tem dado sensível por estudante -> leitura liberada a
-- qualquer usuário autenticado.
alter table subjects enable row level security;
create policy subjects_select_authenticated
  on subjects for select
  to authenticated
  using (true);

-- ---- app_users: cada usuário só enxerga o próprio registro ----
create policy app_users_select_own
  on app_users for select
  to authenticated
  using (id = auth.uid());

-- ---- students: estudante só enxerga o próprio registro ----
create policy students_select_own
  on students for select
  to authenticated
  using (id = auth.uid());

-- ---- enrollments ----
create policy enrollments_select_own
  on enrollments for select
  to authenticated
  using (student_id = auth.uid());

-- ---- assessments (via enrollment) ----
create policy assessments_select_own
  on assessments for select
  to authenticated
  using (
    exists (
      select 1 from enrollments e
      where e.id = assessments.enrollment_id
        and e.student_id = auth.uid()
    )
  );

-- ---- attendance (via enrollment) ----
create policy attendance_select_own
  on attendance for select
  to authenticated
  using (
    exists (
      select 1 from enrollments e
      where e.id = attendance.enrollment_id
        and e.student_id = auth.uid()
    )
  );

-- ---- pending_items ----
create policy pending_items_select_own
  on pending_items for select
  to authenticated
  using (student_id = auth.uid());

-- ---- agent_runs ----
create policy agent_runs_select_own
  on agent_runs for select
  to authenticated
  using (student_id = auth.uid());

-- ---- agent_recommendations (via agent_run) ----
create policy agent_recommendations_select_own
  on agent_recommendations for select
  to authenticated
  using (
    exists (
      select 1 from agent_runs r
      where r.id = agent_recommendations.agent_run_id
        and r.student_id = auth.uid()
    )
  );

-- ---- agent_evidence (via recommendation -> agent_run) ----
create policy agent_evidence_select_own
  on agent_evidence for select
  to authenticated
  using (
    exists (
      select 1
      from agent_recommendations rec
      join agent_runs r on r.id = rec.agent_run_id
      where rec.id = agent_evidence.recommendation_id
        and r.student_id = auth.uid()
    )
  );

-- ---- agent_feedback ----
create policy agent_feedback_select_own
  on agent_feedback for select
  to authenticated
  using (student_id = auth.uid());

create policy agent_feedback_insert_own
  on agent_feedback for insert
  to authenticated
  with check (student_id = auth.uid());

-- Nenhuma policy de INSERT/UPDATE/DELETE foi criada para as tabelas
-- acadêmicas (enrollments, assessments, attendance, pending_items,
-- agent_runs, agent_recommendations, agent_evidence): essas escritas
-- devem ocorrer via service role (Node.js API / Agent Service), nunca
-- diretamente pelo cliente do estudante — condizente com TASK-002 §11
-- (o agente não pode alterar registros acadêmicos) e TASK-003 §5.5.
