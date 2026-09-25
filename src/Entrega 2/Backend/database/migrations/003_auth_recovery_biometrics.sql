-- =========================================================================
-- ASA Conecta — Migration 003 — Autenticação: cadastro, recuperação de senha,
-- "manter conectado" e credenciais biométricas de dispositivo.
--
-- SEGURANÇA
-- - Senhas continuam somente como hash bcrypt (users.password_hash).
-- - Códigos de verificação e tokens de redefinição são armazenados apenas como
--   HMAC/SHA-256; o valor em claro existe só no e-mail enviado ao estudante.
-- - Credenciais biométricas são tokens aleatórios de dispositivo (hash SHA-256),
--   revogáveis e com validade; a biometria nunca envolve a senha.
-- =========================================================================

-- "Manter conectado": define a validade do refresh token e se o app pode persisti-lo.
alter table refresh_sessions add column remember_me boolean not null default false;
create index idx_refresh_sessions_user_active on refresh_sessions (user_id) where revoked_at is null;

-- -------------------------------------------------------------------------
-- Catálogo público de cursos (usado no cadastro; students.program guarda o nome)
-- Fonte: catálogo da primeira entrega (src/Entrega 1/Frontend/database/006_create_courses.sql).
-- -------------------------------------------------------------------------
create table programs (
  code        text primary key,
  name        text not null unique,
  created_at  timestamptz not null default now()
);

insert into programs (code, name) values
  ('ADM', 'Administração'),
  ('ADS', 'Análise e Desenvolvimento de Sistemas'),
  ('CCOMP', 'Ciências da Computação'),
  ('CONT', 'Ciências Contábeis'),
  ('ECON', 'Ciências Econômicas'),
  ('PP', 'Publicidade e Propaganda'),
  ('RI', 'Relações Internacionais'),
  ('RP', 'Relações Públicas'),
  ('SAE', 'Secretariado e Assessoria Executiva')
on conflict (code) do nothing;

-- -------------------------------------------------------------------------
-- Recuperação de senha: código por e-mail → token de redefinição de uso único
-- -------------------------------------------------------------------------
create table password_resets (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users (id) on delete cascade,
  code_hash               text not null,
  code_expires_at         timestamptz not null,
  attempts                integer not null default 0 check (attempts >= 0),
  send_count              integer not null default 1 check (send_count >= 1),
  last_sent_at            timestamptz not null default now(),
  verified_at             timestamptz,
  reset_token_hash        text unique,
  reset_token_expires_at  timestamptz,
  used_at                 timestamptz,
  invalidated_at          timestamptz,
  created_at              timestamptz not null default now(),
  check ((reset_token_hash is null) = (reset_token_expires_at is null))
);

-- no máximo uma solicitação ativa por usuário
create unique index uq_password_resets_active on password_resets (user_id) where used_at is null and invalidated_at is null;
create index idx_password_resets_user_created on password_resets (user_id, created_at desc);

comment on table password_resets is
  'Solicitações de redefinição de senha. Código e token apenas como hash; expiram, têm limite de tentativas e são de uso único.';

-- -------------------------------------------------------------------------
-- Credenciais de dispositivo liberadas por biometria
-- -------------------------------------------------------------------------
create table device_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  token_hash    text not null unique,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);

create index idx_device_credentials_user_active on device_credentials (user_id) where revoked_at is null;

comment on table device_credentials is
  'Credenciais de dispositivo para login biométrico. O token fica no armazenamento seguro do aparelho, protegido pela biometria do sistema operacional.';
