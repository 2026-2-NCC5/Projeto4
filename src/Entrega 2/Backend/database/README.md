# Banco de dados — ASA Conecta

PostgreSQL é a persistência principal (TASK-001 §13). O schema é construído
exclusivamente por migrations; nada é criado manualmente.

```text
database/
├── migrations/   # SQL aplicado em ordem lexicográfica, uma vez cada (tabela schema_migrations)
└── seeds/        # SQL idempotente com dados 100% fictícios (on conflict do nothing)
```

## Comandos (executados a partir de `src/Entrega 2/Backend/api`)

```bash
npm run db:migrate   # aplica migrations pendentes
npm run db:seed      # aplica seeds (idempotente)
npm run db:reset     # DROP SCHEMA public + migrate + seed (bloqueado em NODE_ENV=production)
```

`DATABASE_URL` vem do `.env` de `src/Entrega 2/Backend/api` (veja `src/Entrega 2/Backend/api/.env.example`).

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
   # src/Entrega 2/Backend/api/.env
   DATABASE_URL=postgresql://postgres.lxfssnqxsxiywfndsfdn:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL=auto        # remoto → TLS (rejectUnauthorized=false); informe DATABASE_SSL_CA_FILE para verificar a cadeia
   ```

4. **Schema e dados fictícios** (idempotente; roda de `src/Entrega 2/Backend/api`):

   ```bash
   npm run db:migrate && npm run db:seed
   ```

5. Com o Compose, a mesma `DATABASE_URL` no `.env` de `src/Entrega 2/Backend` (ao lado do `docker-compose.yml`) faz a API ignorar o serviço `db` local:
   `docker compose up -d --build api agent-service mailpit`.

Regras para o banco online:

- `npm run db:reset` é **bloqueado** para hosts remotos; só roda com `ALLOW_REMOTE_DB_RESET=true`.
- Nunca aponte `TEST_DATABASE_URL` para o Supabase: os testes recriam o schema a cada execução.
- Não use o modo transação do pooler (porta 6543): a API abre transações e usa `set`/prepared
  statements que exigem sessão dedicada.
- A senha do banco fica apenas no `.env` (ignorado pelo git). Chaves `anon`/`service_role` não são
  usadas: o app fala só com a API Node.js, que é quem acessa o Postgres.

## Regras

- Nunca edite uma migration já aplicada em outro ambiente: crie `NNN_descricao.sql` nova.
- Seeds contêm apenas pessoas e dados acadêmicos fictícios. A senha das contas de
  demonstração (`Demo@2026`) é armazenada somente como hash bcrypt.
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

O legado Supabase (`src/Entrega 1/Backend/*.sql`, com `auth.users` e RLS) foi mantido apenas
como registro da primeira entrega e não é usado por esta stack — mesmo no Supabase, o schema
atual é o das migrations acima, sem dependência do Supabase Auth.
