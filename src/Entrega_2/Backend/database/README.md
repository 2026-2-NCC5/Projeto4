# Banco de dados — ASA Conecta

PostgreSQL é a persistência principal (TASK-001 §13). O schema é construído
exclusivamente por migrations; nada é criado manualmente.

```text
database/
├── migrations/   # SQL aplicado em ordem lexicográfica, uma vez cada (tabela schema_migrations)
├── seeds/        # SQL idempotente com dados 100% fictícios (on conflict do nothing)
└── content/      # conteúdo OFICIAL da base de conhecimento (Cesta de Serviços pública do ASA)
```

## Comandos (executados a partir de `src/Entrega_2/Backend/api`)

```bash
npm run db:migrate   # aplica migrations pendentes
npm run db:seed      # aplica seeds (idempotente)
npm run db:reset     # DROP SCHEMA public + migrate + seed (bloqueado em NODE_ENV=production)
```

`DATABASE_URL` vem do `.env` de `src/Entrega_2/Backend/api` (veja `src/Entrega_2/Backend/api/.env.example`).

## Conteúdo oficial da base de conhecimento (`content/`)

O assistente (Hermes) responde dúvidas com artigos publicados. Fora do modo demonstração, os artigos fictícios
dos seeds não aparecem; por isso existe o conteúdo oficial, que **pode** ser aplicado em produção:

- `content/asa_cesta_de_servicos.json`: retrato da [Cesta de Serviços](https://www.fecap.br/asa/cesta-de-servicos/)
  pública do ASA (aba Graduação de cada serviço, com condições, setor, local, horário e canais) e da página Quem Somos.
  Gerado por `python3 -I scripts/fetch_asa_cesta_servicos.py` (a partir de `src/Entrega_2/Backend`; só páginas
  públicas do sitemap oficial, com intervalo entre requisições). Revise o diff antes de versionar.
- `npm run db:content` (em `api/`) transforma o retrato em artigos publicados (`is_demo = false`, fonte = página
  original, revisão sugerida em 180 dias) e grava no banco do `DATABASE_URL`. `npm run db:content -- --dry-run` só conta.
- Idempotente e conservador: artigo que já existe (mesmo id ou slug) **não é alterado**, então edições feitas pela
  equipe do ASA no painel nunca são sobrescritas. Novas versões de um artigo existente são feitas pelo painel.

## Banco online (Supabase)

O projeto **ASA Conecta** no Supabase (ref `lxfssnqxsxiywfndsfdn`, região `sa-east-1`) é o banco
online da equipe; o PostgreSQL do `docker compose` continua disponível para desenvolvimento offline.
O schema é o mesmo: as migrations acima são aplicadas pelo runner da API, não pelo CLI do Supabase.

1. **Reative o projeto** se ele estiver pausado (projetos gratuitos pausam após uma semana sem uso):
   Dashboard → projeto ASA Conecta → *Restore project*. O status muda para `ACTIVE_HEALTHY` em
   poucos minutos (`supabase projects list` mostra o status).
2. **Senha do banco**: Dashboard → *Project Settings* → *Database* (é possível redefinir ali).
3. **URL de conexão** (pooler em modo sessão, porta 5432 — a conexão direta `db.<ref>.supabase.co`
   é só IPv6 e não funciona na maioria das redes domésticas):

   ```bash
   # src/Entrega_2/Backend/api/.env
   DATABASE_URL=postgresql://postgres.lxfssnqxsxiywfndsfdn:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL=auto        # remoto → TLS (rejectUnauthorized=false); informe DATABASE_SSL_CA_FILE para verificar a cadeia
   ```

4. **Schema e dados fictícios** (idempotente; roda de `src/Entrega_2/Backend/api`):

   ```bash
   npm run db:migrate && npm run db:seed
   ```

5. Com o Compose, a mesma `DATABASE_URL` no `.env` de `src/Entrega_2/Backend` (ao lado do `docker-compose.yml`) faz a API ignorar o serviço `db` local:
   `docker compose up -d --build api agent-service mailpit`.

Regras para o banco online:

- `npm run db:reset` é **bloqueado** para hosts remotos; só roda com `ALLOW_REMOTE_DB_RESET=true`.
- Nunca aponte `TEST_DATABASE_URL` para o Supabase: os testes recriam o schema a cada execução.
- Migrations, seeds e `pg_dump` usam o pooler em **modo sessão** (porta 5432).
- A API não depende mais de sessão dedicada: o advisory lock de sessão da fila virou concessão em tabela
  (`012_job_leases.sql`), e não há `SET` nem prepared statement nomeado. Isso torna viável o modo
  **transação** (porta 6543) para a API na Vercel, desde que validado num preview com o smoke test antes de
  produção. Até lá, use o modo sessão com `DATABASE_POOL_MAX=3`. Procedimento, backup e reversão:
  [`docs/migration/07-migracao-banco.md`](../../../../docs/migration/07-migracao-banco.md).
- A senha do banco fica apenas no `.env` (ignorado pelo git). Chaves `anon`/`service_role` não são
  usadas: o app fala só com a API Node.js, que é quem acessa o Postgres.

## Regras

- Nunca edite uma migration já aplicada em outro ambiente: crie `NNN_descricao.sql` nova.
- Seeds contêm apenas pessoas e dados acadêmicos fictícios. A senha das contas de
  demonstração (`Demo@2026`) é armazenada somente como hash bcrypt.
- `012_job_leases.sql` (concessões de tarefas compartilhadas, como a leitura da fila) é aditiva.
- Entidades: `users`, `refresh_sessions` (com `remember_me`), `students`, `subjects`,
  `enrollments`, `assessments`, `attendance`, `pending_items`, `agent_runs`,
  `agent_recommendations`, `agent_evidence`, `agent_feedback`, `assistant_interactions`
  (migration 002), `programs`, `password_resets` e `device_credentials` (migration 003).
- Códigos de recuperação, tokens de redefinição e credenciais biométricas são guardados apenas como hash.

## Banco de teste

Testes de integração e E2E recriam o schema a cada execução e por isso usam `TEST_DATABASE_URL`
(padrão `asa_conecta_test`). O helper recusa bancos cujo nome não contenha `test` ou `ci`.
O Compose cria `asa_conecta_test` em volumes novos (`database/docker/01-create-test-database.sql`);
em um volume existente:

```bash
docker compose exec db createdb -U asa asa_conecta_test
```

## Estudantes sintéticos (seed 001)

| Estudante | E-mail | Cenário |
| --- | --- | --- |
| student-demo-001 | estudante.exemplo@demo.asa | SCENARIO-002 atividade pendente |
| student-demo-002 | estudante.regular@demo.asa | SCENARIO-001 sem alertas |
| student-demo-003 | estudante.frequencia@demo.asa | SCENARIO-003 frequência em atenção |
| student-demo-004 | estudante.desempenho@demo.asa | SCENARIO-004 desempenho em atenção |
| student-demo-005 | estudante.multiplo@demo.asa | SCENARIO-005 múltiplos fatores |
| student-demo-006 | estudante.semdados@demo.asa | SCENARIO-006 dados insuficientes |
| student-demo-007 | estudante.inconsistente@demo.asa | SCENARIO-007 dados inconsistentes |
| student-demo-008 | estudante.validacao@demo.asa | SCENARIO-008 validação humana |

O legado Supabase (`src/Entrega_1/Backend/*.sql`, com `auth.users` e RLS) foi mantido apenas
como registro da primeira entrega e não é usado por esta stack — mesmo no Supabase, o schema
atual é o das migrations acima, sem dependência do Supabase Auth.
