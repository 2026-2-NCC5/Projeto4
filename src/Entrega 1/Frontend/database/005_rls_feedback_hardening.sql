-- Corrige a inserção de feedback para garantir que a recomendação pertença ao estudante autenticado.
drop policy if exists agent_feedback_insert_own on agent_feedback;

create policy agent_feedback_insert_own
  on agent_feedback for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1
      from agent_recommendations rec
      join agent_runs r on r.id = rec.agent_run_id
      where rec.id = agent_feedback.recommendation_id
        and r.student_id = auth.uid()
    )
  );
