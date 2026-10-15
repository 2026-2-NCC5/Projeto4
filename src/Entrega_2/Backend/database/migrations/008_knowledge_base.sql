-- =========================================================================
-- ASA Conecta — Migration 008 — Base de conhecimento (artigos versionados)
--
-- Artigos de orientação do ASA com versões, revisão e publicação. O aluno só
-- lê a versão PUBLICADA; a equipe edita rascunhos sem tirar o artigo do ar.
-- A busca é lexical (full-text search do PostgreSQL, dicionário português)
-- sobre texto normalizado (minúsculo, sem acentos) — NÃO há embeddings nem
-- índice vetorial. O assistente cita artigo, versão e data.
--
-- REGRAS
-- - kb_article_versions é somente-inserção: cada salvamento é uma versão nova.
-- - is_demo marca conteúdo de demonstração (precisa ser validado pelo ASA).
-- =========================================================================

create table kb_articles (
  id                 text primary key,
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  -- categoria do catálogo de atendimento (validada na API); null = geral
  category_id        text,
  audience           text not null default 'student' check (audience in ('student', 'staff')),
  status             text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'archived')),
  current_version    integer not null default 1 check (current_version >= 1),
  -- versão vista pelos alunos (pode haver rascunho mais novo)
  published_version  integer check (published_version is null or published_version >= 1),
  is_demo            boolean not null default false,
  owner_user_id      uuid references users (id) on delete set null,
  last_editor_id     uuid references users (id) on delete set null,
  reviewed_by        uuid references users (id) on delete set null,
  published_at       timestamptz,
  review_due_at      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (published_version is null or published_version <= current_version)
);

create trigger trg_kb_articles_updated_at before update on kb_articles
  for each row execute function set_updated_at();

create index idx_kb_articles_status on kb_articles (status, audience);

create table kb_article_versions (
  article_id       text not null references kb_articles (id) on delete cascade,
  version          integer not null check (version >= 1),
  title            text not null check (char_length(title) between 3 and 160),
  summary          text not null check (char_length(summary) between 1 and 400),
  -- markdown restrito (títulos ##/###, listas, ênfase, links https) renderizado com segurança nos clientes
  body             text not null check (char_length(body) between 1 and 20000),
  source_label     text check (source_label is null or char_length(source_label) <= 200),
  source_url       text check (source_url is null or source_url ~ '^https://[^\s]+$'),
  change_note      text check (change_note is null or char_length(change_note) <= 300),
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- título + resumo + corpo normalizados pela API (minúsculo, sem acentos)
  search_document  text not null default '',
  search_vector    tsvector generated always as (to_tsvector('portuguese', search_document)) stored,
  primary key (article_id, version)
);

create index idx_kb_versions_search on kb_article_versions using gin (search_vector);

create or replace function kb_versions_append_only()
returns trigger language plpgsql as $$
begin
  if old.created_by is not null and new.created_by is null
     and (new.article_id, new.version, new.title, new.summary, new.body, new.source_label, new.source_url, new.change_note, new.created_at, new.search_document)
         is not distinct from
         (old.article_id, old.version, old.title, old.summary, old.body, old.source_label, old.source_url, old.change_note, old.created_at, old.search_document) then
    return new;
  end if;
  raise exception 'kb_article_versions é somente-inserção: salve uma nova versão';
end;
$$;

create trigger trg_kb_versions_append_only before update on kb_article_versions
  for each row execute function kb_versions_append_only();

comment on table kb_articles is 'Artigos da base de conhecimento do ASA (metadados, situação e versão publicada).';
comment on table kb_article_versions is 'Versões imutáveis de cada artigo; a busca lexical usa search_vector (dicionário português).';
