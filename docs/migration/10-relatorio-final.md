# 10 — Relatório final da migração

**Estado em 27/10/2026: em produção e validado.**

- Portal: **https://asa-conecta.vercel.app** (smoke 22/22).
- Backend: **https://asa-conecta-api.vercel.app** (smoke 19/19, análise da IA 201).
- Banco: Supabase "ASA Conecta", schema `asa`.
- Código: 10 commits no branch `feat/migracao-vercel` (envio ao GitHub pendente, §5).

## 1. Resumo

O backend não depende mais de Docker. A API (TypeScript/Express) e o Agent Service (Python/FastAPI) foram mantidos:
nenhum endpoint mudou e nada foi reescrito por preferência de linguagem. Em vez disso, foram adaptados os pontos
que só funcionavam com um processo sempre vivo:

- monitor da fila;
- timers;
- conexões SSE;
- push em segundo plano.

Também foram corrigidos os limites e padrões que quebrariam na Vercel: anexos, IP real, origens, pool de conexões,
detecção e empacotamento da entrada, dependências Python e versão do Node.

A implantação usa **dois projetos Vercel**:

- **backend** `asa-conecta-api`: API + agente privado, região `gru1`;
- **frontend** `asa-conecta`: o portal, que encaminha `/api` ao backend na mesma origem.

O banco é o PostgreSQL do Supabase "ASA Conecta", num schema próprio (`asa`), com papéis de menor privilégio.

## 2. Antes e depois

| | Antes | Depois |
|---|---|---|
| Execução | `docker compose up` (5 containers) | 2 projetos Vercel; local sem Docker (`npm run dev`, `vercel dev`); Docker opcional |
| Banco | container `postgres:16` com volume | Supabase `sa-east-1`, schema `asa`; a API conecta como `asa_api` (só DML) |
| Migrations | na subida do container | passo explícito com o papel `asa_migrator`, fora das requisições |
| Agente | container na rede interna | serviço privado no projeto backend (binding + segredo) |
| Portal | nginx com proxy `/api` | CDN da Vercel com rewrite de `/api` para o backend (mesma origem, mesma CSP) |
| Fila / timers | laço e `setInterval` no processo | sob demanda + concessão no banco + Cron; worker residente opcional |
| E-mail | Mailpit | desativado (com aviso) até haver SMTP |
| App | `localhost`/IP do Metro | `EXPO_PUBLIC_API_URL` = backend, obrigatória em release |

## 3. APIs

| Indicador | Quantidade |
|---|---:|
| Endpoints encontrados | 134 |
| Preservados (mesmo caminho e contrato) | 134 |
| Com comportamento interno ajustado (mesmo contrato) | 11 (ver [03](03-matriz-integracoes.md)) |
| Criados | 2 (`GET`/`POST /api/internal/jobs/:job`) |
| Validados por testes automatizados | 130 de 136 |
| Validados também pelo smoke test (inclusive no pacote de produção) | 18 |
| Sem teste dedicado (anterior à migração) | 6 |
| Com falha | 0 |
| Exercitados em produção (smoke, análise da IA, login por cookie) | 19 |

## 4. Checklist de aceitação

Legenda: ✅ comprovado · ⏳ pronto, aguardando liberação ou acesso · ⚠️ limitação registrada.

**Backend**
- ✅ Inicia sem Docker; dependências travadas (`package-lock.json`, `uv.lock`); sem imports quebrados
- ✅ Configuração validada na subida, com padrões seguros na Vercel
- ✅ APIs preservadas; validação, erros, autenticação e autorização testados
- ✅ Persistência em PostgreSQL real; migrations 001–012 aplicadas no banco de produção (schema `asa`)

**Frontend**
- ✅ Portal e app compilam (o typecheck do app voltou a passar); URLs configuráveis; sem localhost oculto em release
- ✅ Login, sessão e requisições autenticadas (smoke e E2E Playwright locais); contratos sincronizados

**Inteligência artificial**
- ✅ Agent Service preservado (51 testes); análise real executada no pacote de produção (201, com evidências)
- ✅ Agente sem rota pública e com segredo compartilhado; assistente só com dados autorizados; voz no aparelho
- ⚠️ RAG/LLM não existem no projeto; nada foi inventado

**Vercel**
- ✅ Configuração dos 2 projetos válida; build reproduzível a partir de checkout limpo (também no CI)
- ✅ Runtimes Node 24 e Python 3.12; região `gru1`; variáveis do backend cadastradas
- ✅ Pacote da API executado localmente com configuração de produção (19/19)
- ✅ Deploy em produção dos dois projetos; smoke 19/19 (backend) e 22/22 (portal)
- ✅ `WEB_ORIGINS`/`CORS_ORIGIN` com o domínio do portal; login por cookie e CSRF validados pelo proxy
- ✅ IP real do visitante chega ao backend pelo proxy do portal (limite de login por pessoa)
- ✅ Cron diário registrado; agente sem rota pública; senha pública recusada nas contas de equipe e admin

**Qualidade**
- ✅ Testes automatizados: API 333 + 53 + 16, agente 51, portal 262, app 567
- ✅ Sem segredos versionados; credenciais fora do repositório (`~/.config/asa-conecta`, `chmod 600`)
- ✅ Banco: só operações aditivas, com backup antes; a Entrega 1 intacta
- ⚠️ Ocorrência: três senhas de contas de admin/equipe apareceram na saída do terminal durante a configuração; foram
  trocadas de novo em seguida ([07 §2](07-migracao-banco.md#2-o-que-foi-feito))

## 5. Pendências

| # | Descrição | Causa | Impacto | Requisito | Prioridade |
|---|---|---|---|---|---|
| 1 | Enviar os 10 commits ao GitHub (`git push -u origin feat/migracao-vercel`) e abrir o PR | a credencial do Git nesta máquina é da conta UX-Brasil, sem permissão no repositório | código em produção ainda não está no GitHub | push com uma conta do grupo | P0 |
| 2 | SMTP de produção | nenhum provedor configurado | recuperação de senha e convites indisponíveis (com aviso) | credenciais do provedor | P1 |
| 3 | Push da fila com o app fechado | sem processo residente | sem alertas em segundo plano (só com a fila ativa) | Daemon (04 §7) ou Pro; fila depende de autorização da FECAP | P1 |
| 4 | `EXPO_PUBLIC_API_URL=https://asa-conecta-api.vercel.app` no EAS | build de loja ainda não gerado | app de loja sem servidor | cadastrar no projeto Expo | P1 |
| 5 | Cron de SLA diário no Hobby | limite do plano | automações com atraso de até 1 dia | Pro ou agendador externo | P2 |
| 6 | Pooler em modo transação (6543) | só verificável no Supabase | opcional (escala) | smoke com a URL 6543 | P2 |
| 7 | Limitadores de taxa compartilhados | contadores em memória por instância | proteção mais fraca com muitas instâncias | tabela de contadores ou Redis | P2 |
| 8 | Verificação da cadeia TLS do banco | CA do Supabase fora do pacote | TLS cifrado sem verificar o certificado | incluir o PEM | P2 |
| 9 | Backend de preview para o portal | o rewrite do portal aponta para produção | previews do portal não fazem escrita | backend de preview + `WEB_ORIGINS` próprio | P3 |
| 10 | 6 endpoints sem teste dedicado | anterior à migração | menor cobertura | testes de integração | P3 |

## 6. Comandos

```bash
# instalar
( cd src/Entrega_2/Backend/api && npm ci )
( cd src/Entrega_2/Backend/agent-service && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt )
( cd src/Entrega_2/Web && npm ci )
( cd src/Entrega_2/Frontend && npm ci )

# banco local (qualquer PostgreSQL 16+, sem Docker: 04 §10)
( cd src/Entrega_2/Backend/api && npm run db:migrate && npm run db:seed )

# backend local
( cd src/Entrega_2/Backend/agent-service && .venv/bin/uvicorn app.main:app --port 8000 )
( cd src/Entrega_2/Backend/api && npm run dev )                 # tradicional
( cd src/Entrega_2/Backend/api && npm run start:vercel-entry )  # igual à Vercel
( cd src/Entrega_2/Backend && npx vercel@65.4.0 dev --local )   # api + agent como no projeto backend

# frontend local
( cd src/Entrega_2/Web && npm run dev )
( cd src/Entrega_2/Frontend && npx expo start )

# testes
( cd src/Entrega_2/Backend/api && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run test:e2e )
( cd src/Entrega_2/Backend/agent-service && .venv/bin/pytest && .venv/bin/ruff check . )
( cd src/Entrega_2/Web && npm run typecheck && npm run lint && npm test )
( cd src/Entrega_2/Frontend && npm run typecheck && npm run lint && npm test )

# migrations em produção (papel dono do schema asa)
( cd src/Entrega_2/Backend/api && DATABASE_URL="$(grep '^ASA_MIGRATOR_DATABASE_URL=' ~/.config/asa-conecta/production.env | cut -d= -f2-)" npm run db:migrate )

# deploy
( cd src/Entrega_2/Backend && vercel deploy --prod )
( cd src/Entrega_2/Web && vercel deploy --prod )

# validação de uma implantação
node src/Entrega_2/Backend/scripts/smoke.mjs https://asa-conecta-api.vercel.app
SMOKE_WEB=1 node src/Entrega_2/Backend/scripts/smoke.mjs https://asa-conecta.vercel.app
```

## 7. Arquivos

**Novos:**

- `src/Entrega_2/Backend/{vercel.json,.vercelignore}`, `src/Entrega_2/Web/{vercel.json,.vercelignore}`
- `docs/migration/01…10`
- `Backend/api/src/{index,runtime,worker}.ts`, `routes/jobs.ts`, `db/migrationManifest.ts`
- `Backend/api/scripts/serve-vercel-entry.ts`
- `Backend/api/test/unit/serverless.test.ts`
- `Backend/database/migrations/012_job_leases.sql`
- `Backend/scripts/smoke.mjs`
- `Backend/agent-service/{.python-version,uv.lock,tests/test_packaging.py}`

**Renomeado:** `Backend/api/src/app.ts` → `createApp.ts`.

**Alterados:** API (`config/env.ts`, `db/pool.ts`, `server.ts`, `queue/*`, `support/*`, `clients/agentClient.ts`,
`admin/adminService.ts`, `assistant/queueResponders.ts`, `package.json`, `Dockerfile`, `.env.example` e testes),
agente (`app/main.py`, `pyproject.toml`, `.env.example`, testes), app (`config/env.ts`, `services/apiClient.ts`,
`features/support/attachments.ts`, `App.tsx` e testes), `docker-compose.yml`, `Backend/.env.example`,
`.github/workflows/ci.yml`, `.gitignore` e READMEs.

**Removido:** `PgAdvisoryLeaderLock`, substituído por `PgLeaseLeaderLock`.

**Fora do repositório:**

- `~/asa-conecta-backups/20261027-100231/` — backup do banco antes das alterações;
- `~/.config/asa-conecta/production.env` — URLs dos papéis do banco;
- `~/.config/asa-conecta/contas-equipe-admin.txt` — senhas de equipe e admin.
