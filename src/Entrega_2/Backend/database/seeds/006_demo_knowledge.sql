-- =========================================================================
-- ASA Conecta — Seed 006 — Base de conhecimento (conteúdo de DEMONSTRAÇÃO)
--
-- Artigos de orientação gerados a partir do catálogo do Atendimento
-- (api/src/support/catalog.ts) e dois artigos sobre a própria plataforma.
-- São conteúdo de demonstração (is_demo = true): a equipe do ASA precisa
-- revisar e publicar a versão oficial antes de qualquer uso real.
-- Idempotente: ids fixos e "on conflict do nothing".
-- =========================================================================

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-financial-bill-copy', 'financial-bill-copy', 'financial', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-financial-bill-copy', 1, 'Como emitir a segunda via do boleto?', 'A segunda via fica disponível na área financeira do portal do aluno.', 'A segunda via fica disponível na área financeira do portal do aluno.

## Passo a passo

1. Entre no portal do aluno.
2. Abra a área Financeiro.
3. Escolha a parcela e toque em "Segunda via".', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como emitir a segunda via do boleto? a segunda via fica disponivel na area financeira do portal do aluno. a segunda via fica disponivel na area financeira do portal do aluno. ## passo a passo 1. entre no portal do aluno. 2. abra a area financeiro. 3. escolha a parcela e toque em "segunda via".')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-financial-payment-time', 'financial-payment-time', 'financial', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-financial-payment-time', 1, 'Quanto tempo leva para um pagamento aparecer?', 'Pagamentos por boleto podem levar até 3 dias úteis para serem compensados.', 'Pagamentos por boleto podem levar até 3 dias úteis para serem compensados.

## Passo a passo

1. Aguarde a compensação bancária.
2. Se o prazo passou, abra um chamado e anexe o comprovante.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'quanto tempo leva para um pagamento aparecer? pagamentos por boleto podem levar ate 3 dias uteis para serem compensados. pagamentos por boleto podem levar ate 3 dias uteis para serem compensados. ## passo a passo 1. aguarde a compensacao bancaria. 2. se o prazo passou, abra um chamado e anexe o comprovante.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-financial-negotiation', 'financial-negotiation', 'financial', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-financial-negotiation', 1, 'Como negociar mensalidades em aberto?', 'O Financeiro analisa propostas de negociação caso a caso.', 'O Financeiro analisa propostas de negociação caso a caso.

## Passo a passo

1. Separe as parcelas em aberto.
2. Abra um chamado em Financeiro → Negociação descrevendo sua proposta.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como negociar mensalidades em aberto? o financeiro analisa propostas de negociacao caso a caso. o financeiro analisa propostas de negociacao caso a caso. ## passo a passo 1. separe as parcelas em aberto. 2. abra um chamado em financeiro → negociacao descrevendo sua proposta.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-documents-enrollment-certificate', 'documents-enrollment-certificate', 'documents', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-documents-enrollment-certificate', 1, 'Como solicitar uma declaração de matrícula?', 'A declaração simples pode ser emitida no portal; versões específicas são feitas pela Secretaria.', 'A declaração simples pode ser emitida no portal; versões específicas são feitas pela Secretaria.

## Passo a passo

1. Entre no portal do aluno.
2. Abra Documentos → Declarações.
3. Para um modelo específico, abra um chamado informando a finalidade.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como solicitar uma declaracao de matricula? a declaracao simples pode ser emitida no portal; versoes especificas sao feitas pela secretaria. a declaracao simples pode ser emitida no portal; versoes especificas sao feitas pela secretaria. ## passo a passo 1. entre no portal do aluno. 2. abra documentos → declaracoes. 3. para um modelo especifico, abra um chamado informando a finalidade.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-documents-transcript', 'documents-transcript', 'documents', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-documents-transcript', 1, 'Como obter o histórico escolar?', 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.', 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.

## Passo a passo

1. Abra um chamado em Documentos → Histórico escolar.
2. Informe se precisa de versão assinada.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como obter o historico escolar? o historico parcial e emitido pela secretaria academica em ate 3 dias uteis. o historico parcial e emitido pela secretaria academica em ate 3 dias uteis. ## passo a passo 1. abra um chamado em documentos → historico escolar. 2. informe se precisa de versao assinada.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-academic-grade-review', 'academic-grade-review', 'academic', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-academic-grade-review', 1, 'Como pedir revisão de prova?', 'A revisão deve ser solicitada após a divulgação da nota, dentro do prazo do calendário acadêmico.', 'A revisão deve ser solicitada após a divulgação da nota, dentro do prazo do calendário acadêmico.

## Passo a passo

1. Confira o prazo no calendário acadêmico.
2. Abra um chamado em Acadêmico → Revisão de prova com a disciplina e a avaliação.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como pedir revisao de prova? a revisao deve ser solicitada apos a divulgacao da nota, dentro do prazo do calendario academico. a revisao deve ser solicitada apos a divulgacao da nota, dentro do prazo do calendario academico. ## passo a passo 1. confira o prazo no calendario academico. 2. abra um chamado em academico → revisao de prova com a disciplina e a avaliacao.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-academic-attendance', 'academic-attendance', 'academic', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-academic-attendance', 1, 'Faltei por motivo de saúde. O que fazer?', 'Faltas justificadas exigem atestado entregue dentro do prazo.', 'Faltas justificadas exigem atestado entregue dentro do prazo.

## Passo a passo

1. Digitalize o atestado.
2. Abra um chamado em Acadêmico → Frequência e anexe o documento.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'faltei por motivo de saude. o que fazer? faltas justificadas exigem atestado entregue dentro do prazo. faltas justificadas exigem atestado entregue dentro do prazo. ## passo a passo 1. digitalize o atestado. 2. abra um chamado em academico → frequencia e anexe o documento.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-enrollment-add-drop', 'enrollment-add-drop', 'enrollment', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-enrollment-add-drop', 1, 'Posso incluir ou excluir uma disciplina?', 'Alterações são aceitas no período de ajuste de matrícula.', 'Alterações são aceitas no período de ajuste de matrícula.

## Passo a passo

1. Confira o período de ajuste no calendário.
2. Abra um chamado informando a disciplina e a turma.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'posso incluir ou excluir uma disciplina? alteracoes sao aceitas no periodo de ajuste de matricula. alteracoes sao aceitas no periodo de ajuste de matricula. ## passo a passo 1. confira o periodo de ajuste no calendario. 2. abra um chamado informando a disciplina e a turma.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-systems-password', 'systems-password', 'systems_access', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-systems-password', 1, 'Esqueci a senha do portal do aluno', 'A redefinição pode ser feita pelo link "Esqueci minha senha" na tela de acesso do portal.', 'A redefinição pode ser feita pelo link "Esqueci minha senha" na tela de acesso do portal.

## Passo a passo

1. Abra a tela de acesso do portal.
2. Toque em "Esqueci minha senha" e siga as instruções enviadas ao e-mail.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'esqueci a senha do portal do aluno a redefinicao pode ser feita pelo link "esqueci minha senha" na tela de acesso do portal. a redefinicao pode ser feita pelo link "esqueci minha senha" na tela de acesso do portal. ## passo a passo 1. abra a tela de acesso do portal. 2. toque em "esqueci minha senha" e siga as instrucoes enviadas ao e-mail.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-systems-wifi', 'systems-wifi', 'systems_access', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-systems-wifi', 1, 'Como conectar ao Wi-Fi do campus?', 'Use o usuário e a senha do portal do aluno na rede institucional.', 'Use o usuário e a senha do portal do aluno na rede institucional.

## Passo a passo

1. Escolha a rede institucional.
2. Entre com o usuário e a senha do portal.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como conectar ao wi-fi do campus? use o usuario e a senha do portal do aluno na rede institucional. use o usuario e a senha do portal do aluno na rede institucional. ## passo a passo 1. escolha a rede institucional. 2. entre com o usuario e a senha do portal.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-internship-agreement', 'internship-agreement', 'internship', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-internship-agreement', 1, 'Como formalizar o termo de compromisso?', 'O termo precisa das assinaturas da empresa, do estudante e da instituição.', 'O termo precisa das assinaturas da empresa, do estudante e da instituição.

## Passo a passo

1. Preencha o termo com a empresa.
2. Abra um chamado em Estágio → Termo de compromisso e anexe o documento.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como formalizar o termo de compromisso? o termo precisa das assinaturas da empresa, do estudante e da instituicao. o termo precisa das assinaturas da empresa, do estudante e da instituicao. ## passo a passo 1. preencha o termo com a empresa. 2. abra um chamado em estagio → termo de compromisso e anexe o documento.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-scholarships-documents', 'scholarships-documents', 'scholarships', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-scholarships-documents', 1, 'Quais documentos preciso para uma bolsa?', 'Cada programa tem sua lista; em geral, comprovantes de renda e de residência.', 'Cada programa tem sua lista; em geral, comprovantes de renda e de residência.

## Passo a passo

1. Confira o edital do programa.
2. Abra um chamado em Bolsas e benefícios para tirar dúvidas específicas.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'quais documentos preciso para uma bolsa? cada programa tem sua lista; em geral, comprovantes de renda e de residencia. cada programa tem sua lista; em geral, comprovantes de renda e de residencia. ## passo a passo 1. confira o edital do programa. 2. abra um chamado em bolsas e beneficios para tirar duvidas especificas.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-asa-appointment', 'asa-appointment', 'asa_service', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-asa-appointment', 1, 'Como agendar um atendimento com o ASA?', 'Escolha um horário livre em "Agendamentos", no portal ou no app.', 'Escolha um horário livre em "Agendamentos", no portal ou no app.

## Passo a passo

1. Abra "Agendamentos" e toque em "Agendar atendimento".
2. Escolha o assunto, a modalidade (presencial ou online), o dia e o horário.
3. Confirme. Você recebe o protocolo e pode cancelar ou remarcar até o prazo informado.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como agendar um atendimento com o asa? escolha um horario livre em "agendamentos", no portal ou no app. escolha um horario livre em "agendamentos", no portal ou no app. ## passo a passo 1. abra "agendamentos" e toque em "agendar atendimento". 2. escolha o assunto, a modalidade (presencial ou online), o dia e o horario. 3. confirme. voce recebe o protocolo e pode cancelar ou remarcar ate o prazo informado.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-infrastructure-accessibility', 'infrastructure-accessibility', 'infrastructure', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-infrastructure-accessibility', 1, 'Preciso de um recurso de acessibilidade', 'O ASA articula adaptações de sala, material e avaliação com as equipes responsáveis.', 'O ASA articula adaptações de sala, material e avaliação com as equipes responsáveis.

## Passo a passo

1. Abra um chamado em Infraestrutura → Acessibilidade.
2. Descreva o recurso de que você precisa.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'preciso de um recurso de acessibilidade o asa articula adaptacoes de sala, material e avaliacao com as equipes responsaveis. o asa articula adaptacoes de sala, material e avaliacao com as equipes responsaveis. ## passo a passo 1. abra um chamado em infraestrutura → acessibilidade. 2. descreva o recurso de que voce precisa.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-asa-conecta-como-usar', 'asa-conecta-como-usar', 'asa_service', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-asa-conecta-como-usar', 1, 'Como usar o ASA Conecta no portal e no app', 'O mesmo login vale no portal web e no aplicativo; chamados, agendamentos e avisos aparecem nos dois.', 'O mesmo login vale no portal web e no aplicativo; chamados, agendamentos e avisos aparecem nos dois.

## Passo a passo

1. Entre com seu e-mail institucional no portal ou no app.
2. Abra um chamado em "Meus chamados" ou agende um horário em "Agendamentos".
3. Acompanhe respostas e avisos na central de notificações; o que você lê em um canal aparece como lido no outro.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'como usar o asa conecta no portal e no app o mesmo login vale no portal web e no aplicativo; chamados, agendamentos e avisos aparecem nos dois. o mesmo login vale no portal web e no aplicativo; chamados, agendamentos e avisos aparecem nos dois. ## passo a passo 1. entre com seu e-mail institucional no portal ou no app. 2. abra um chamado em "meus chamados" ou agende um horario em "agendamentos". 3. acompanhe respostas e avisos na central de notificacoes; o que voce le em um canal aparece como lido no outro.')
on conflict (article_id, version) do nothing;

insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at)
values ('kb-agente-para-o-estudante', 'agente-para-o-estudante', 'academic', 'student', 'published', 1, 1, true, now())
on conflict (id) do nothing;
insert into kb_article_versions (article_id, version, title, summary, body, source_label, change_note, search_document)
values ('kb-agente-para-o-estudante', 1, 'O que o Agente para o Estudante faz (e o que não faz)', 'O agente analisa disciplinas, notas, frequência e pendências e recomenda próximos passos com evidências. Ele não altera notas, matrícula ou frequência.', 'O agente analisa disciplinas, notas, frequência e pendências e recomenda próximos passos com evidências. Ele não altera notas, matrícula ou frequência.

## Passo a passo

1. Abra "Vida acadêmica" e peça uma análise.
2. Leia cada recomendação junto com as evidências e o nível de confiança.
3. Quando a recomendação pedir validação humana, procure o ASA ou a coordenação — a decisão final é sempre de uma pessoa.', 'Orientação de demonstração do ASA Conecta (validar com o ASA)', 'Versão inicial (demonstração)', 'o que o agente para o estudante faz (e o que nao faz) o agente analisa disciplinas, notas, frequencia e pendencias e recomenda proximos passos com evidencias. ele nao altera notas, matricula ou frequencia. o agente analisa disciplinas, notas, frequencia e pendencias e recomenda proximos passos com evidencias. ele nao altera notas, matricula ou frequencia. ## passo a passo 1. abra "vida academica" e peca uma analise. 2. leia cada recomendacao junto com as evidencias e o nivel de confianca. 3. quando a recomendacao pedir validacao humana, procure o asa ou a coordenacao — a decisao final e sempre de uma pessoa.')
on conflict (article_id, version) do nothing;

