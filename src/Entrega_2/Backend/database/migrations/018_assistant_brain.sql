-- =========================================================================
-- ASA Conecta — Migration 018 — Cérebro do assistente: perguntas sem resposta
--
-- O assistente responde só com base oficial (artigos do ASA + cérebro da FECAP, um vault do Obsidian
-- em Backend/cerebro). Quando não encontra base, a pergunta vira uma LACUNA aqui. A equipe do ASA vê as
-- lacunas no painel, escreve a resposta (artigo da base ou nota do cérebro) e marca como resolvida: é
-- assim que o assistente "aprende", sempre com revisão humana — nada do que o aluno diz vira fato sozinho.
--
-- PRIVACIDADE
-- - Sem vínculo com o usuário (nem id, nem RA): só a pergunta com números/e-mails mascarados.
-- - Perguntas iguais (mesmos termos) somam em times_asked em vez de duplicar.
--
-- Também guarda as páginas do site público da FECAP lidas pelo job diário (assistant_site_pages).
--
-- Reversão: database/rollback/018_assistant_brain.down.sql
-- =========================================================================

create table assistant_knowledge_gaps (
  id               uuid primary key default gen_random_uuid(),
  -- termos normalizados e ordenados da pergunta (agrupa variações da mesma dúvida)
  question_key     text not null unique check (char_length(question_key) between 1 and 300),
  -- exemplo mais recente, já mascarado (sem números longos nem e-mails)
  sample_question  text not null check (char_length(sample_question) between 1 and 400),
  times_asked      integer not null default 1 check (times_asked > 0),
  last_channel     text not null default 'text' check (last_channel in ('text', 'voice')),
  status           text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolution_note  text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_by      uuid references users(id) on delete set null,
  resolved_at      timestamptz,
  first_asked_at   timestamptz not null default now(),
  last_asked_at    timestamptz not null default now()
);

create index assistant_knowledge_gaps_status_idx on assistant_knowledge_gaps (status, times_asked desc, last_asked_at desc);

-- -------------------------------------------------------------------------
-- Páginas do site PÚBLICO da FECAP lidas pelo job diário `fecap-site-sync`
-- (só www.fecap.br; o cérebro usa estas páginas sem precisar de novo deploy)
-- -------------------------------------------------------------------------
create table assistant_site_pages (
  url         text primary key check (url like 'https://www.fecap.br/%' and char_length(url) <= 600),
  folder      text not null check (char_length(folder) <= 60),
  title       text not null check (char_length(title) <= 300),
  -- blocos de texto da página: [{ "tag": "p", "text": "..." }]
  blocks      jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  lastmod     date,
  -- active: no cérebro · gone: saiu do site (ou notícia antiga) · failed: leitura falhou
  status      text not null default 'active' check (status in ('active', 'gone', 'failed')),
  fail_count  integer not null default 0 check (fail_count >= 0),
  fetched_at  timestamptz not null default now()
);

create index assistant_site_pages_status_idx on assistant_site_pages (status);
