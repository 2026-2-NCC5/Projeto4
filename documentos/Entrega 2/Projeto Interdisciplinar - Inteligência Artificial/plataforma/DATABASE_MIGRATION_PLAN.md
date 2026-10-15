# Plano de migração do banco

## Princípios

1. **Somente adições.** As migrations 006–011 criam tabelas, colunas, índices e restrições novos.
   - Não removem nem renomeiam nada existente.
   - O app publicado continua funcionando antes e depois da aplicação.
   - Colunas novas têm valor padrão e não quebram inserções antigas.
2. **Uma transação por arquivo.** `npm run db:migrate` (`api/src/db/migrate.ts`):
   - aplica os arquivos de `database/migrations` em ordem lexicográfica;
   - aplica cada arquivo uma única vez, registrando-o em `schema_migrations`;
   - roda cada arquivo dentro da própria transação: se falhar, nada daquele arquivo fica aplicado.
3. **Garantias no banco, não só na aplicação**:
   - restrições de exclusão (agendamentos sem sobreposição);
   - unicidade de idempotência (`client_request_id`, execução de automação);
   - `check` de domínios;
   - gatilhos que tornam a auditoria e o histórico de agendamentos **somente inserção**.
4. **Seeds separados das migrations.** Dados fictícios ficam em `database/seeds` e seguem a
   [política de demonstração](DEMO_DATA_POLICY.md). As migrations não inserem dado fictício.
   - Única exceção: a 006 marca `is_demo` nas contas `@demo.asa` já existentes. É uma atualização idempotente.
5. **Nada destrutivo em ambiente compartilhado.** `npm run db:reset` recria o schema do zero. Ele é bloqueado:
   - em produção (`NODE_ENV=production`);
   - em bancos remotos, a menos que `ALLOW_REMOTE_DB_RESET=true`, que nunca deve ser usado num banco
     compartilhado.

   Os testes de integração só aceitam bancos com `test` ou `ci` no nome e recusam URLs com `prod`.

## Migrations

| Arquivo | O que faz | Dependências |
|---|---|---|
| `001_init_schema.sql` | Esquema inicial (usuários, estudantes, acadêmico, agente) | `pgcrypto` |
| `002_assistant_interactions.sql` | Interações do assistente | 001 |
| `003_auth_recovery_biometrics.sql` | Recuperação de senha, sessões de refresh, biometria | 001 |
| `004_support_tickets.sql` | Atendimento ASA (chamados, eventos, mensagens, anexos, avisos) | 001 |
| `005_queue_tracking.sql` | Fila presencial (estado do monitor, inscrições) | 001 |
| `006_platform_identity_audit.sql` | `users.is_demo`, `last_login_at`, `invited_by`, `invited_at`; sessões com `channel`, `family_id`, `device_label`, `last_used_at`; canal `web` nos chamados; `audit_events` (só inserção); `platform_settings`; `user_notifications` (única por usuário + `dedupe_key`); `notification_preferences` | 003, 004 |
| `007_appointments.sql` | `btree_gist`; `appointment_availability`; `appointments` com `appointments_no_attendant_overlap`, `appointments_no_student_overlap`, `unique (student_id, client_request_id)` e coerência cancelamento × `cancelled_by`; sequência de protocolo `AGD-AAAA-NNNNN`; `appointment_events` (só inserção) | 001, 006 |
| `008_knowledge_base.sql` | `kb_articles` (slug único, situação, versão vigente/publicada, `is_demo`) e `kb_article_versions` (`search_vector` gerado com `to_tsvector('portuguese', …)` e índice GIN; só inserção) | 001 |
| `009_sla_automations.sql` | `sla_policies` (meta por categoria); `automation_rules` (gatilhos e ações em lista fechada, nascem desligadas); `automation_runs` (`unique (rule_id, ticket_id, trigger)`) | 004 |
| `010_appointment_reschedule_link.sql` | Índice parcial em `appointments (rescheduled_from)` para o vínculo "remarcado para" | 007 |
| `011_first_response_target.sql` | `support_tickets.first_response_due_at` (prazo da primeira resposta da equipe, gravado na abertura; chamados anteriores ficam sem meta) | 004, 009 |

## Como aplicar

### Local (Docker Compose)

```bash
cd "src/Entrega 2/Backend"
docker compose up -d db
cd api && npm run db:migrate && npm run db:seed   # o seed respeita DEMO_SEED_ENABLED / DEMO_DATA_ENABLED
```

O container `api` do Compose já roda `migrate` e `seed` antes de subir. O seed é ignorado (com o motivo no log)
quando as condições da política não valem.

### Banco gerenciado (Supabase ou outro PostgreSQL 14+)

1. **Backup antes** (dump lógico ou ponto de restauração do provedor).
2. Confira se a extensão `btree_gist` está disponível. No Supabase ela está, e `create extension if not exists`
   roda com o papel `postgres`. Sem permissão de extensão, a 007 falha **inteira** e nada é aplicado.
3. Rode `DATABASE_URL=… npm run db:migrate` a partir de `api/`. O SSL segue `DATABASE_SSL`.
4. **Não rode seeds** num banco com dados reais. Para um banco **só de demonstração**, defina
   `DEMO_SEED_ALLOW_REMOTE=true` de forma explícita.
5. Verifique:
   ```sql
   select name, applied_at from schema_migrations order by name;
   select count(*) from audit_events;                        -- tabela existe
   select conname from pg_constraint where conname like 'appointments_no_%';
   ```
   A tela **Administração → Saúde** mostra as migrations aplicadas e as **pendentes**, comparando o banco com os
   arquivos da versão implantada.

## Reversão

As migrations não têm arquivo `down` automático. A estratégia é **corrigir para frente**. Se for preciso
desfazer uma migration recente num ambiente de teste, os comandos manuais são, na ordem inversa:

```sql
-- 011
alter table support_tickets drop column if exists first_response_due_at;
-- 010
drop index if exists idx_appointments_rescheduled_from;
-- 009
drop table if exists automation_runs, automation_rules, sla_policies;
-- 008
drop table if exists kb_article_versions, kb_articles;
-- 007
drop table if exists appointment_events, appointments, appointment_availability;
drop sequence if exists appointment_protocol_seq;
-- 006 (atenção: remove a trilha de auditoria e os avisos)
drop table if exists notification_preferences, user_notifications, platform_settings, audit_events;
-- colunas adicionadas em users/refresh_sessions/support_tickets podem ficar (são inofensivas para versões antigas)
```

Depois, apague a linha correspondente em `schema_migrations`. **Nunca** faça isso em produção sem backup e sem
janela combinada. Para corrigir um erro em produção, escreva uma migration nova (011+).

## Testes que cobrem as migrations

- `api/test/integration/database.integration.test.ts`: aplica tudo do zero e compara com os arquivos em disco.
- Integrações por área, todas contra PostgreSQL real:
  - `appointments.integration.test.ts`: exclusão, concorrência, local escolhido;
  - `knowledge.integration.test.ts`: busca em português, versões;
  - `admin.integration.test.ts`: SLA, automações idempotentes entre instâncias, corrida entre administrações;
  - `platform.integration.test.ts`: auditoria só de inserção, sessões.
