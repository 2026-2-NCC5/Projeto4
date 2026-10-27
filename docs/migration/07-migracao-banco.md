# 07 — Banco de dados: migração, backup e reversão

## 1. Situação encontrada (27/10/2026)

| Banco | Onde | Conteúdo |
|---|---|---|
| Local | container `db` do Compose (`postgres:16-alpine`) | schema 001–011 + seeds fictícios; só desenvolvimento, nada a levar dele |
| Produção | Supabase "ASA Conecta", ref `lxfssnqxsxiywfndsfdn`, `sa-east-1`, PostgreSQL 17, `ACTIVE_HEALTHY` | **schema da Entrega 1** em `public`: 11 tabelas (`app_users`, `students`, `subjects`, `enrollments`, `assessments`, `attendance`, `pending_items`, `agent_*`), **todas vazias**; 1 usuário em `auth.users` (login Supabase da Entrega 1). O schema da Entrega 2 **nunca tinha sido aplicado**: não havia `schema_migrations` |

Os nomes coincidem com os da Entrega 2 (`students`, `subjects`, `agent_runs`…), então aplicar as migrations em
`public` falharia ou exigiria apagar a Entrega 1. O responsável escolheu um **schema separado**.

As bases acadêmicas citadas no escopo (Contato, Financeiro, Histórico, Matrículas, Relacionamentos) não são lidas
pelo backend. A fonte acadêmica é `demo` (seed fictício identificado), e não havia pipeline de ingestão para migrar.

Os anexos de chamados ficam no próprio PostgreSQL (`support_attachments.content bytea`), nunca no filesystem.

## 2. O que foi feito

Tudo é **aditivo**: nenhum objeto da Entrega 1 foi alterado.

| # | Passo | Como | Resultado |
|---|---|---|---|
| 1 | Backup | `npx supabase db dump --linked` (schema, dados e papéis) | `~/asa-conecta-backups/20261027-100231/{schema,data,roles}.sql`, `chmod 600`, fora do repositório |
| 2 | Extensões | `create extension if not exists btree_gist/pgcrypto with schema extensions` (como `postgres`) | as duas em `extensions` |
| 3 | Papéis dedicados | `asa_migrator` (dono do schema; migrations) e `asa_api` (usado pela API) | senhas aleatórias de 48 caracteres; o banco recebeu só o **verificador SCRAM**; `search_path = asa, extensions`; `asa_api` com `statement_timeout = 30s` e `idle_in_transaction_session_timeout = 60s`; limites de conexão 5 e 40 |
| 4 | Schema `asa` | criado pelo `asa_migrator` (`create` no banco concedido e **revogado** em seguida) | dono `asa_migrator`; privilégios padrão: `asa_api` com `select/insert/update/delete` nas tabelas, sequências e `execute` |
| 5 | Migrations 001–012 | `npm run db:migrate` como `asa_migrator`, pelo pooler em modo sessão | 42 tabelas em `asa`, 12 linhas em `asa.schema_migrations` |
| 6 | Seeds de demonstração | `npm run db:seed` com `DEMO_SEED_ALLOW_REMOTE=true` | contas e dados fictícios, identificados como demonstração |
| 7 | Senhas de equipe e admin | `atendente.asa`, `responsavel.exemplo` e `admin.plataforma` com senhas novas aleatórias (bcrypt); sessões revogadas | senhas só em `~/.config/asa-conecta/contas-equipe-admin.txt`; os alunos fictícios mantêm a senha pública `Demo@2026` |

**Ocorrência.** Na primeira geração das senhas do passo 7, um `source` do arquivo de credenciais imprimiu as três
senhas na saída do terminal da sessão de trabalho. Elas foram **trocadas de novo** em seguida e as expostas não valem
mais. Desde então o arquivo carregável (`production.env`) só tem variáveis válidas, e as contas ficam num arquivo
separado que nunca é carregado como script.

## 3. Verificações

Executadas depois dos passos acima:

| Verificação | Resultado |
|---|---|
| `anon` e `authenticated` (chaves públicas do Supabase) têm `usage` em `asa`? | **não**: a Data API do Supabase não enxerga usuários nem hashes de senha |
| `asa_api` lê e escreve em `asa.users`? | sim |
| `asa_api` cria tabela em `asa`? | **não** (`permission denied`) |
| `asa_migrator` ainda cria schemas no banco? | **não** (revogado) |
| Tabelas da Entrega 1 em `public` | 11, intactas (`app_users`: 0 linhas, como antes) |
| Pooler do Supabase com papel próprio | ok: o `search_path` do papel é aplicado na conexão |

Por que não usar o papel `postgres` para as tabelas: tabelas criadas por ele em `public` ganham, por padrão do
Supabase, acesso para `anon`/`authenticated`. Isso deixaria a tabela de usuários exposta pela chave pública.

## 4. Conexão

| Uso | Papel | URL (pooler `aws-0-sa-east-1.pooler.supabase.com`) |
|---|---|---|
| API na Vercel (`DATABASE_URL`) | `asa_api` | modo sessão, 5432, `DATABASE_POOL_MAX=3` |
| Migrations e seeds | `asa_migrator` | modo sessão, 5432 |
| Modo transação (6543) | `asa_api` | viável (nada depende de sessão), **validar no preview com o smoke test antes de usar** |

As URLs com senha ficam em `~/.config/asa-conecta/production.env`. A `DATABASE_URL` da API está na Vercel como
variável sensível.

## 5. Procedimento para mudanças futuras

1. Backup: `npx supabase db dump --linked -f ~/asa-conecta-backups/$(date +%Y%m%d-%H%M)/schema.sql` (e
   `--data-only`).
2. Ensaio numa cópia local (PostgreSQL sem Docker): restaure o backup e rode `npm run db:migrate`.
3. Compare as contagens antes e depois; as migrations não podem alterar nenhuma:

   ```sql
   select 'users' t, count(*) from asa.users union all
   select 'students', count(*) from asa.students union all
   select 'support_tickets', count(*) from asa.support_tickets union all
   select 'appointments', count(*) from asa.appointments union all
   select 'agent_runs', count(*) from asa.agent_runs union all
   select 'refresh_sessions', count(*) from asa.refresh_sessions order by 1;
   ```

4. Aplique em produção com o `asa_migrator` ([04 §5](04-deploy-vercel.md#5-banco-migrations-futuras)), antes do
   deploy que depende da migration.
5. Rode o smoke test autenticado e confira Admin → Saúde ("migrations em dia").

## 6. Reversão

| Situação | Ação |
|---|---|
| Deploy com defeito | `vercel rollback` no projeto (o schema atual é compatível com o código anterior) |
| Migration futura com defeito | restaurar o backup num banco novo; nunca editar migration aplicada (crie `NNN+1`) |
| Desfazer toda a Entrega 2 no Supabase | como `postgres`: `drop schema asa cascade; drop role asa_api; drop role asa_migrator;` (a Entrega 1 em `public` não é afetada) |

`npm run db:reset` continua bloqueado para hosts remotos (exige `ALLOW_REMOTE_DB_RESET=true`) e, de todo modo, recria
`public`, não `asa`. Nunca o rode contra produção.
