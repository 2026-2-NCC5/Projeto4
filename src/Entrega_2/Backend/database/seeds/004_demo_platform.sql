-- =========================================================================
-- ASA Conecta — Seed 004 — Contas fictícias da equipe ASA e da administração
--
-- Complementa o seed 001 (estudantes e "Responsável Exemplo") com as contas
-- usadas no portal web. TODAS são fictícias, do domínio reservado demo.asa,
-- e só existem em bancos de demonstração: seeds não rodam em produção nem em
-- banco remoto sem DEMO_SEED_ALLOW_REMOTE=true (ver DEMO_DATA_POLICY.md).
--
-- Senha de demonstração: a mesma do seed 001 (hash bcrypt). Com
-- DEMO_DATA_ENABLED=false nenhuma conta deste domínio consegue entrar.
-- =========================================================================

insert into users (id, email, password_hash, full_name, role, is_demo) values
  ('00000000-0000-4000-8000-000000000098', 'atendente.asa@demo.asa',   '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Atendente ASA (demonstração)', 'institutional_staff', true),
  ('00000000-0000-4000-8000-000000000097', 'admin.plataforma@demo.asa', '$2b$10$4ZFgJoaZ5Oy/tQkCi4cacuy76vmhKLCZHuXBbD/1XPBurEa9oRTWe', 'Administração (demonstração)', 'technical_admin', true)
on conflict (id) do nothing;

-- Contas dos seeds anteriores (e cadastros de teste no domínio reservado) ficam marcadas como demonstração.
-- Necessário porque, em banco novo, a migration 006 roda antes dos seeds.
update users set is_demo = true where lower(email) like '%@demo.asa' and not is_demo;
