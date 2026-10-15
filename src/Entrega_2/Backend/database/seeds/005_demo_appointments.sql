-- =========================================================================
-- ASA Conecta — Seed 005 — Disponibilidade e agendamentos fictícios
--
-- Faixas de atendimento das contas fictícias da equipe (seed 001 e 004) e dois
-- agendamentos de exemplo do "Estudante Exemplo": um próximo (confirmado) e um
-- já realizado. Datas relativas ao dia em que o seed roda pela primeira vez.
-- TODOS os dados são fictícios; o local é identificado como demonstração.
-- Idempotente: ids fixos e "on conflict do nothing".
-- =========================================================================

insert into appointment_availability (id, attendant_user_id, weekday, start_time, end_time, slot_minutes, mode, location, valid_from) values
  -- Atendente ASA (demonstração): manhãs de segunda a sexta, presencial
  ('a0000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000098', 1, '09:00', '12:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000098', 2, '09:00', '12:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000098', 3, '09:00', '12:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000098', 4, '09:00', '12:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000098', 5, '09:00', '12:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  -- Atendente ASA: noites de terça e quinta, online
  ('a0000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000098', 2, '18:00', '20:00', 30, 'online', null, current_date - 30),
  ('a0000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000098', 4, '18:00', '20:00', 30, 'online', null, current_date - 30),
  -- Responsável Exemplo: tardes de segunda, quarta e sexta, presencial
  ('a0000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000099', 1, '14:00', '17:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000099', 3, '14:00', '17:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30),
  ('a0000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000099', 5, '14:00', '17:00', 30, 'presencial', 'Central de atendimento ASA (local de demonstração)', current_date - 30)
on conflict (id) do nothing;

-- Próximo agendamento (primeiro dia útil a partir de daqui a 2 dias, 10h em São Paulo)
with next_day as (
  select d::date as d
    from generate_series((now() at time zone 'America/Sao_Paulo')::date + 2, (now() at time zone 'America/Sao_Paulo')::date + 9, interval '1 day') d
   where extract(isodow from d) < 6
   order by d limit 1
)
insert into appointments (id, protocol, student_id, attendant_user_id, availability_id, topic_id, starts_at, ends_at, mode, location, status,
                          student_notes, client_request_id, channel)
select 'appt-demo-001', 'AGD-' || to_char(now(), 'YYYY') || '-00001', 'student-demo-001', '00000000-0000-4000-8000-000000000098', null, 'documents',
       (d + time '10:00') at time zone 'America/Sao_Paulo', (d + time '10:30') at time zone 'America/Sao_Paulo',
       'presencial', 'Central de atendimento ASA (local de demonstração)', 'confirmed',
       'Retirar o histórico escolar assinado.', 'seed-demo-appointment-001', 'app'
  from next_day
on conflict (id) do nothing;

-- Atendimento já realizado (primeiro dia útil a partir de 12 dias atrás, 15h em São Paulo)
with past_day as (
  select d::date as d
    from generate_series((now() at time zone 'America/Sao_Paulo')::date - 12, (now() at time zone 'America/Sao_Paulo')::date - 5, interval '1 day') d
   where extract(isodow from d) < 6
   order by d limit 1
)
insert into appointments (id, protocol, student_id, attendant_user_id, availability_id, topic_id, starts_at, ends_at, mode, location, status,
                          student_notes, client_request_id, channel)
select 'appt-demo-002', 'AGD-' || to_char(now(), 'YYYY') || '-00002', 'student-demo-001', '00000000-0000-4000-8000-000000000099', null, 'financial',
       (d + time '15:00') at time zone 'America/Sao_Paulo', (d + time '15:30') at time zone 'America/Sao_Paulo',
       'presencial', 'Central de atendimento ASA (local de demonstração)', 'completed',
       'Dúvida sobre a negociação de mensalidades.', 'seed-demo-appointment-002', 'app'
  from past_day
on conflict (id) do nothing;

insert into appointment_events (appointment_id, type, title, description, actor_type)
select a.id, e.type, e.title, e.description, e.actor_type
  from appointments a
  join (values
    ('appt-demo-001', 'scheduled', 'Atendimento agendado', 'Documentos · Presencial', 'student'),
    ('appt-demo-001', 'confirmed', 'Confirmado pelo ASA', null, 'staff'),
    ('appt-demo-002', 'scheduled', 'Atendimento agendado', 'Financeiro · Presencial', 'student'),
    ('appt-demo-002', 'completed', 'Atendimento realizado', null, 'staff')
  ) as e(appointment_id, type, title, description, actor_type) on e.appointment_id = a.id
 where not exists (select 1 from appointment_events existing where existing.appointment_id = a.id);
