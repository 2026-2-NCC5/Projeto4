-- =========================================================================
-- ASA Conecta — Seed 003 — Chamados fictícios do Atendimento ASA
--
-- Dá a cada estudante quatro chamados em situações diferentes, para que a
-- lista, o detalhe, o histórico, as mensagens e o centro de avisos tenham
-- conteúdo:
--   1. Em análise          — Acadêmico / Revisão de prova
--   2. Aguardando você     — Financeiro / Boleto (ação pendente do estudante)
--   3. Resolvido           — Documentos / Declaração de matrícula (pode avaliar ou reabrir)
--   4. Encerrado e avaliado — Acesso aos sistemas / Wi-Fi
--
-- Idempotente: estudantes que já têm chamados do seed (client_request_id
-- seed-*) são ignorados. TODOS os dados são fictícios.
-- =========================================================================

do $$
declare
  s record;
  t text;
  base timestamptz := date_trunc('minute', now());
  created timestamptz;
begin
  for s in
    select st.id, st.user_id, u.full_name
      from students st
      join users u on u.id = st.user_id
     where not exists (
       select 1 from support_tickets tk where tk.student_id = st.id and tk.client_request_id like 'seed-%'
     )
  loop
    -- ---------------------------------------------------------------
    -- 1. Em análise — Coordenação de Curso
    -- ---------------------------------------------------------------
    t := 'ticket-seed-' || s.id || '-1';
    created := base - interval '3 days';
    insert into support_tickets (id, protocol, student_id, client_request_id, category_id, subcategory_id, subject, description,
        search_text, status, priority, assigned_team, sla_target_business_days, sla_started_at, sla_due_at, created_at, updated_at)
    values (t, 'ASA-' || to_char(created at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('support_ticket_protocol_seq')::text, 5, '0'),
        s.id, 'seed-1', 'academic', 'exam_review', 'Revisão da Prova 1 de Estruturas de Dados',
        'Gostaria de pedir a revisão da questão 4 da Prova 1. Acredito que a complexidade da minha solução foi considerada errada, mas ela segue o que foi visto em aula.',
        'revisao da prova 1 de estruturas de dados academico revisao de prova', 'in_analysis', 'normal', 'Coordenação de Curso',
        3, created, created + interval '5 days', created, base - interval '20 hours');

    insert into support_ticket_events (ticket_id, type, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at) values
      (t, 'ticket_created', 'Chamado aberto', null, 'student', s.user_id, s.full_name, null, 'submitted',
          '[{"label":"Categoria","value":"Acadêmico"},{"label":"Tipo","value":"Revisão de prova"}]', created),
      (t, 'ticket_received', 'Solicitação recebida pelo ASA', 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.', 'system', null, 'Atendimento ASA', 'submitted', 'received',
          '[{"label":"Equipe responsável","value":"Atendimento ASA"},{"label":"Prazo de resposta","value":"até 3 dias úteis"}]', created),
      (t, 'ticket_triaged', 'Triagem concluída', 'Sua solicitação já está com a equipe que vai cuidar dela.', 'agent', null, 'Atendimento ASA', 'received', 'assigned',
          '[{"label":"Equipe responsável","value":"Coordenação de Curso"}]', created + interval '4 hours'),
      (t, 'status_changed', 'Chamado em análise', 'A equipe responsável está verificando sua solicitação.', 'department', null, 'Coordenação de Curso', 'assigned', 'in_analysis',
          '[]', base - interval '1 day'),
      (t, 'message_received', 'Nova mensagem de Coordenação de Curso', null, 'agent', null, 'Coordenação de Curso', null, null,
          '[]', base - interval '20 hours');

    insert into support_ticket_messages (id, ticket_id, sender_type, sender_name, content, read_at, created_at) values
      (gen_random_uuid(), t, 'agent', 'Coordenação de Curso',
          'Olá! Recebemos seu pedido e encaminhamos a questão 4 para o professor da disciplina. O retorno sai em até 3 dias úteis.',
          null, base - interval '20 hours');

    insert into support_notifications (student_id, ticket_id, kind, title, body, created_at, read_at) values
      (s.id, t, 'ticket_received', 'Chamado recebido', '"Revisão da Prova 1 de Estruturas de Dados" entrou na fila do ASA. Avisaremos a cada atualização.', created, created + interval '1 hour'),
      (s.id, t, 'new_message', 'Nova mensagem de Coordenação de Curso', 'Olá! Recebemos seu pedido e encaminhamos a questão 4 para o professor da disciplina. O retorno sai em até 3 dias úteis.', base - interval '20 hours', null);

    -- ---------------------------------------------------------------
    -- 2. Aguardando você — Financeiro (prazo pausado)
    -- ---------------------------------------------------------------
    t := 'ticket-seed-' || s.id || '-2';
    created := base - interval '2 days';
    insert into support_tickets (id, protocol, student_id, client_request_id, category_id, subcategory_id, subject, description,
        search_text, status, priority, assigned_team, pending_action_title, pending_action_description, pending_action_requested_at,
        pending_action_expects_attachment, sla_target_business_days, sla_started_at, sla_due_at, sla_paused_at, created_at, updated_at)
    values (t, 'ASA-' || to_char(created at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('support_ticket_protocol_seq')::text, 5, '0'),
        s.id, 'seed-2', 'financial', 'bill', 'Segunda via do boleto de outubro',
        'O boleto da mensalidade de outubro não chegou no meu e-mail e não aparece no portal. Preciso da segunda via para pagar até o vencimento.',
        'segunda via do boleto de outubro financeiro boleto', 'waiting_student', 'normal', 'Financeiro',
        'Envie o comprovante do último pagamento',
        'Para liberar a segunda via, precisamos confirmar o pagamento de setembro. Anexe o comprovante ou responda com a data do pagamento.',
        base - interval '6 hours', true,
        2, created, created + interval '2 days', base - interval '6 hours', created, base - interval '6 hours');

    insert into support_ticket_events (ticket_id, type, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at) values
      (t, 'ticket_created', 'Chamado aberto', null, 'student', s.user_id, s.full_name, null, 'submitted',
          '[{"label":"Categoria","value":"Financeiro"},{"label":"Tipo","value":"Boleto"}]', created),
      (t, 'ticket_received', 'Solicitação recebida pelo ASA', 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.', 'system', null, 'Atendimento ASA', 'submitted', 'received',
          '[{"label":"Equipe responsável","value":"Atendimento ASA"},{"label":"Prazo de resposta","value":"até 2 dias úteis"}]', created),
      (t, 'ticket_assigned', 'Encaminhado para a equipe responsável', 'Sua solicitação já está com a equipe que vai cuidar dela.', 'agent', null, 'Atendimento ASA', 'received', 'assigned',
          '[{"label":"Equipe responsável","value":"Financeiro"}]', created + interval '3 hours'),
      (t, 'message_received', 'Nova mensagem de Financeiro', null, 'agent', null, 'Financeiro', null, null,
          '[]', base - interval '6 hours'),
      (t, 'student_action_required', 'Precisamos de uma informação sua', 'Envie o comprovante do último pagamento', 'agent', null, 'Financeiro', 'assigned', 'waiting_student',
          '[]', base - interval '6 hours');

    insert into support_ticket_messages (id, ticket_id, sender_type, sender_name, content, read_at, created_at) values
      (gen_random_uuid(), t, 'agent', 'Financeiro',
          'Oi! Encontramos uma divergência no pagamento de setembro. Pode nos enviar o comprovante? Assim que confirmarmos, a segunda via é liberada no portal.',
          null, base - interval '6 hours');

    insert into support_notifications (student_id, ticket_id, kind, title, body, created_at, read_at) values
      (s.id, t, 'ticket_received', 'Chamado recebido', '"Segunda via do boleto de outubro" entrou na fila do ASA. Avisaremos a cada atualização.', created, created + interval '2 hours'),
      (s.id, t, 'action_required', 'O ASA precisa de você', 'Envie o comprovante do último pagamento', base - interval '6 hours', null);

    -- ---------------------------------------------------------------
    -- 3. Resolvido — Secretaria Acadêmica (ainda pode avaliar ou reabrir)
    -- ---------------------------------------------------------------
    t := 'ticket-seed-' || s.id || '-3';
    created := base - interval '8 days';
    insert into support_tickets (id, protocol, student_id, client_request_id, category_id, subcategory_id, subject, description,
        search_text, status, priority, assigned_team, resolution, resolved_at, sla_target_business_days, sla_started_at, sla_due_at,
        sla_completed_at, created_at, updated_at)
    values (t, 'ASA-' || to_char(created at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('support_ticket_protocol_seq')::text, 5, '0'),
        s.id, 'seed-3', 'documents', 'enrollment_certificate', 'Declaração de matrícula para o estágio',
        'A empresa do estágio pediu uma declaração de matrícula com o semestre atual e o horário das aulas.',
        'declaracao de matricula para o estagio documentos declaracao de matricula', 'resolved', 'normal', 'Secretaria Acadêmica',
        'A declaração foi emitida e está no Portal do Aluno, em Documentos > Declarações. Ela vale por 30 dias e já inclui o horário das aulas.',
        base - interval '2 days', 3, created, created + interval '5 days', base - interval '2 days', created, base - interval '2 days');

    insert into support_ticket_events (ticket_id, type, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at) values
      (t, 'ticket_created', 'Chamado aberto', null, 'student', s.user_id, s.full_name, null, 'submitted',
          '[{"label":"Categoria","value":"Documentos"},{"label":"Tipo","value":"Declaração de matrícula"}]', created),
      (t, 'ticket_received', 'Solicitação recebida pelo ASA', 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.', 'system', null, 'Atendimento ASA', 'submitted', 'received',
          '[{"label":"Equipe responsável","value":"Atendimento ASA"},{"label":"Prazo de resposta","value":"até 3 dias úteis"}]', created),
      (t, 'ticket_assigned', 'Encaminhado para a equipe responsável', 'Sua solicitação já está com a equipe que vai cuidar dela.', 'agent', null, 'Atendimento ASA', 'received', 'assigned',
          '[{"label":"Equipe responsável","value":"Secretaria Acadêmica"}]', created + interval '2 hours'),
      (t, 'message_received', 'Nova mensagem de Secretaria Acadêmica', null, 'agent', null, 'Secretaria Acadêmica', null, null,
          '[]', base - interval '5 days'),
      (t, 'message_sent', 'Mensagem enviada', null, 'student', s.user_id, s.full_name, null, null,
          '[]', base - interval '4 days 20 hours'),
      (t, 'ticket_resolved', 'Solicitação resolvida', 'A declaração foi emitida e está no Portal do Aluno, em Documentos > Declarações. Ela vale por 30 dias e já inclui o horário das aulas.', 'department', null, 'Secretaria Acadêmica', 'assigned', 'resolved',
          '[]', base - interval '2 days');

    insert into support_ticket_messages (id, ticket_id, sender_type, sender_user_id, sender_name, content, client_message_id, read_at, created_at) values
      (gen_random_uuid(), t, 'agent', null, 'Secretaria Acadêmica',
          'Olá! A declaração precisa sair em português ou também em inglês?', null, base - interval '5 days 2 hours', base - interval '5 days'),
      (gen_random_uuid(), t, 'student', s.user_id, s.full_name,
          'Só em português, obrigado!', 'seed-msg-3', null, base - interval '4 days 20 hours');

    insert into support_notifications (student_id, ticket_id, kind, title, body, created_at, read_at) values
      (s.id, t, 'ticket_received', 'Chamado recebido', '"Declaração de matrícula para o estágio" entrou na fila do ASA. Avisaremos a cada atualização.', created, created + interval '1 hour'),
      (s.id, t, 'ticket_resolved', 'Seu chamado foi resolvido', 'Veja a solução e conte como foi o atendimento.', base - interval '2 days', null);

    -- ---------------------------------------------------------------
    -- 4. Encerrado e avaliado — Tecnologia da Informação
    -- ---------------------------------------------------------------
    t := 'ticket-seed-' || s.id || '-4';
    created := base - interval '20 days';
    insert into support_tickets (id, protocol, student_id, client_request_id, category_id, subcategory_id, subject, description,
        search_text, status, priority, assigned_team, resolution, resolved_at, closed_at, sla_target_business_days, sla_started_at,
        sla_due_at, sla_completed_at, created_at, updated_at)
    values (t, 'ASA-' || to_char(created at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('support_ticket_protocol_seq')::text, 5, '0'),
        s.id, 'seed-4', 'systems_access', 'wifi', 'Não consigo conectar no Wi-Fi do prédio 2',
        'Desde segunda o notebook não conecta na rede da faculdade no prédio 2. Nos outros prédios funciona normalmente.',
        'nao consigo conectar no wi-fi do predio 2 acesso aos sistemas wi-fi', 'closed', 'normal', 'Tecnologia da Informação',
        'O certificado da rede no prédio 2 foi atualizado. Esqueça a rede no notebook e conecte de novo com o seu login institucional.',
        created + interval '1 day', base - interval '12 days', 1, created, created + interval '1 day', created + interval '1 day',
        created, base - interval '12 days');

    insert into support_ticket_events (ticket_id, type, title, description, actor_type, actor_user_id, actor_name, from_status, to_status, details, created_at) values
      (t, 'ticket_created', 'Chamado aberto', null, 'student', s.user_id, s.full_name, null, 'submitted',
          '[{"label":"Categoria","value":"Acesso aos sistemas"},{"label":"Tipo","value":"Wi-Fi"}]', created),
      (t, 'ticket_received', 'Solicitação recebida pelo ASA', 'Sua solicitação entrou na fila do ASA e será analisada pela equipe.', 'system', null, 'Atendimento ASA', 'submitted', 'received',
          '[{"label":"Equipe responsável","value":"Atendimento ASA"},{"label":"Prazo de resposta","value":"até 1 dia útil"}]', created),
      (t, 'ticket_assigned', 'Encaminhado para a equipe responsável', 'Sua solicitação já está com a equipe que vai cuidar dela.', 'agent', null, 'Atendimento ASA', 'received', 'assigned',
          '[{"label":"Equipe responsável","value":"Tecnologia da Informação"}]', created + interval '1 hour'),
      (t, 'ticket_resolved', 'Solicitação resolvida', 'O certificado da rede no prédio 2 foi atualizado. Esqueça a rede no notebook e conecte de novo com o seu login institucional.', 'department', null, 'Tecnologia da Informação', 'assigned', 'resolved',
          '[]', created + interval '1 day'),
      (t, 'rating_submitted', 'Atendimento avaliado', null, 'student', s.user_id, s.full_name, null, null,
          '[{"label":"Nota","value":"5 de 5"}]', created + interval '2 days'),
      (t, 'ticket_closed', 'Chamado encerrado', 'O atendimento foi finalizado.', 'system', null, 'Atendimento ASA', 'resolved', 'closed',
          '[]', base - interval '12 days');

    insert into support_ticket_ratings (ticket_id, rating, comment, created_at) values
      (t, 5, 'Resolveram no dia seguinte, obrigado!', created + interval '2 days');

    insert into support_notifications (student_id, ticket_id, kind, title, body, created_at, read_at) values
      (s.id, t, 'ticket_resolved', 'Seu chamado foi resolvido', 'Veja a solução e conte como foi o atendimento.', created + interval '1 day', created + interval '2 days'),
      (s.id, t, 'ticket_closed', 'Chamado encerrado', 'O atendimento foi finalizado. O histórico continua disponível.', base - interval '12 days', base - interval '11 days');
  end loop;
end
$$;
