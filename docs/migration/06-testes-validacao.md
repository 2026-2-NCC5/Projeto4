# 06 — Testes e validação

Executados em 27/10/2026, numa máquina Linux **sem Docker**: PostgreSQL 17 dos binários do sistema (cluster
temporário em `127.0.0.1:55432`), Node 26, Python 3.14 local (3.12 no `uv`) e Vercel CLI 65.4.0.

Cada tipo de teste diz o que tem de real:

- **Unitário:** dependências em memória ou dublês. Não prova integração.
- **Integração:** PostgreSQL real.
- **E2E:** PostgreSQL real + Agent Service Python real (processo `uvicorn`).
- **Smoke / `vercel dev`:** API, banco e agente reais, roteados como na Vercel.
- **Preview / produção na nuvem:** **não executado** (ver §4).

## 1. Resultados

| Teste | Ambiente | Resultado | Evidência |
|---|---|---|---|
| API — lint (ESLint) e typecheck (`tsc`) | local | ok, 0 erros | `npm run lint`, `npm run typecheck` |
| API — unitários | local, dublês | **333 passaram** (317 antes + 16 novos) | `npm run test:unit` |
| API — integração | PostgreSQL 17 real | **53 passaram** | `npm run test:integration` (inclui concessão `job_leases` e duas instâncias sob demanda) |
| API — E2E | PostgreSQL + Agent Service reais | **16 passaram**, 3 pulados | `npm run test:e2e`; os 3 pulados exigem SMTP (Mailpit), ausente sem Docker |
| API — build | local | ok | `npm run build` (gera `dist/index.js`, `dist/server.js`, `dist/worker.js`) |
| Agent Service — pytest | local | **51 passaram** (47 + 4 novos) | `pytest` (segredo compartilhado, empacotamento) |
| Agent Service — ruff check/format | local | ok | `ruff check .`, `ruff format --check .` |
| Agent Service — `uv.lock` | local | em dia | `uv lock --check` |
| Contratos (3 cópias) | local | sincronizados | `scripts/check-contracts-sync.sh` |
| Portal — typecheck, lint, testes, build | local | **262 passaram**, build ok | `npm run typecheck && npm run lint && npm test && npm run build` |
| App — typecheck | local | **ok** (antes falhava em `App.tsx:217`) | `npm run typecheck` |
| App — lint e testes | local | 0 erros (6 avisos já existentes), **567 passaram** (565 + 2) | `npm run lint`, `npm test -- --ci` |
| Build da Vercel — 1ª versão (projeto único, três Services) | local, sem conta | ok, **mas inválido como prova**: passou porque o `dist/` local existia | em cópia limpa, o mesmo `vercel.json` falha (`ENTRYPOINT_NOT_FOUND`); corrigido, ver abaixo e [08](08-problemas-corrigidos.md) #21–#22 |
| **Build do projeto backend** (`src/Entrega_2/Backend`, cópia limpa) | local, sem conta | **ok** | `api` → `nodejs24.x`, 300 s, handler `api/src/index.mjs` empacotado pela Vercel, dependências em `api/node_modules` (705 arquivos); `agent` → Python 3.12, 30 s, `uv.lock`, YAML no pacote, sem `tests/` |
| **Build do projeto frontend** (`src/Entrega_2/Web`, cópia limpa) | local, sem conta | **ok** | estático + cabeçalhos → filesystem → rewrites de `/api` e `/health*` para o backend → SPA |
| **Pacote da API executado** (função reconstruída a partir da saída do build) | local, PostgreSQL + agente reais, `NODE_ENV=production` | **19/19** | smoke autenticado; `POST /api/agent/analyze` → 201; `sla-scan` com segredo → 200 |
| `vercel dev --local`, 1ª versão (projeto único: roteamento + binding + segredo) | local | **22/22** | `SMOKE_WEB=1 SMOKE_EMAIL=… node scripts/smoke.mjs http://localhost:3417` |
| E2E do portal (Playwright, Chromium) pela origem do `vercel dev`, 1ª versão | local, navegador real | **10/10** | `E2E_BASE_URL=http://localhost:3417 npx playwright test --project=setup --project=portal` (login de aluno, equipe e admin por cookie na mesma origem, CSP de produção, rotas do SPA) |
| Entrada serverless (`npm run start:vercel-entry`) + agente com segredo | local | **19/19** | mesmo passo que entrou no CI |
| Análise completa da IA pela entrada serverless | local, real | ok | `POST /api/agent/analyze` → 201: 1 recomendação, confiança 0,9, 2 evidências; gravado em `agent_runs` |
| Agente sem segredo | local | 401 | `POST /internal/v1/student-agent/evaluate` sem `Authorization` |
| Tarefas agendadas | local | ok | `/api/internal/jobs/sla-scan` e `queue-refresh` com o segredo → 200; sem → 401; sem `CRON_SECRET` → 404 |
| Fila sob demanda | local | ok | `GET /api/queue/status` → `sync: live`; concessão gravada em `job_leases` |
| `docker compose config` | local | válido | Docker não foi executado (opcional) |
| Smoke na URL de preview / produção | Vercel | **não executado** | bloqueado: ver §4 |

## 2. Testes novos

| Arquivo | O que prova |
|---|---|
| `api/test/unit/serverless.test.ts` | leitura sob demanda (consulta só quando vence o intervalo; chamadas simultâneas compartilham a consulta); backoff de falhas respeitado; `refresh()` espera os ouvintes (inclusive os encadeados); instância sem concessão segue o banco; snapshot de outro dia ignorado; SSE com um único temporizador por instância, que para sem conexões; conexão encerrada antes do limite; rotas de tarefas (404 sem segredo configurado, 401 com segredo errado, 404 para tarefa desconhecida e para `constructor`); limite de anexo por configuração; catálogo informando o limite; token do agente no cliente HTTP; lista de migrations do código igual à pasta |
| `api/test/unit/platform.test.ts` (+3) | produção exige `AGENT_SERVICE_URL`; padrões da Vercel (proxy, SSE 240 s, anexo de 3 MiB cabendo em 4,5 MB); valores explícitos vencem; origens do próprio deploy aceitas só na Vercel, com valores estranhos recusados |
| `api/test/integration/queue.integration.test.ts` | concessão no PostgreSQL (exclusão, renovação, expiração, liberação); duas instâncias sob demanda no mesmo banco fazem **uma** consulta por intervalo |
| `agent-service/tests/test_api.py` (+2) | segredo exigido quando configurado (`/health` aberto, docs protegidas); sem segredo, comportamento anterior |
| `agent-service/tests/test_packaging.py` | `pyproject.toml` e `requirements.txt` com as mesmas dependências; entrada da Vercel aponta para o `app` FastAPI |
| `Frontend/__tests__/env.test.ts`, `apiClient.test.ts` | release sem `EXPO_PUBLIC_API_URL` não cai no localhost e falha com erro explícito |
| `Frontend/__tests__/supportTicketsLogic.test.ts` | mensagem de tamanho usa o limite vindo da API |

## 3. CI (`.github/workflows/ci.yml`)

Acrescentado ao pipeline existente, sem duplicar jobs:

- **api:** Node 24. Ao final, sobe a entrada serverless e o Agent Service com segredo e roda o smoke test
  autenticado e a tarefa `sla-scan`.
- **agent-service:** `uv lock --check`.
- **vercel-build (novo):** `vercel build` dos dois projetos (backend e frontend) a partir do checkout limpo, com
  vínculo fictício (não usa a conta). Confere a saída: rota para a `api`, cron, `maxDuration`, handler na mesma
  árvore do `node_modules` (o defeito #22 não passa), YAML no pacote do agente, testes fora dele e rewrite de `/api`
  no portal.
- **docker:** mantido e marcado como opcional.

## 4. O que não foi validado, e por quê

| Item | Motivo | Como validar |
|---|---|---|
| Pooler em modo transação (6543) | só existe no Supabase | smoke no preview com a URL 6543 |
| Daemon (worker residente na Vercel) | beta, só produção, exige deploy | ativar o bloco `daemons` (04 §8) e ver o log `worker started` |
| E-mail real | sem SMTP configurado | cadastrar SMTP e testar "Esqueci a senha" |
| App em aparelho físico contra a Vercel | depende da URL publicada | `EXPO_PUBLIC_API_URL=<url>` + Expo Go/development build |

## 5. Produção (27/10/2026)

Executado contra as URLs públicas, depois do deploy dos dois projetos.

| Teste | URL | Resultado |
|---|---|---|
| Smoke público + autenticado (aluno fictício) | `https://asa-conecta-api.vercel.app` | **19/19**: banco (Supabase, papel `asa_api`) e agente "up"; 401, 400 e 404 em JSON; tarefas protegidas; dados do aluno; catálogo (anexo de 3 MiB); assistente; logout com refresh revogado |
| Smoke com portal (`SMOKE_WEB=1`) | `https://asa-conecta.vercel.app` | **22/22**: página com CSP, rota do SPA, CSRF e todas as chamadas da API pelo proxy |
| Análise do agente | backend | `POST /api/agent/analyze` → **201**, 1 recomendação com 2 evidências (API → binding → função Python com segredo) |
| Agente por rota pública | backend | `/internal/v1/student-agent/evaluate` → **404** (só a API o alcança) |
| Login por cookie pelo proxy | portal | **200**: `asa_at`/`asa_rt` `HttpOnly; Secure; SameSite=Strict` no domínio do portal; `/api/auth/me` com cookie 200; escrita com `Origin` de outro site **403**; logout 204 |
| IP do visitante pelo proxy | portal e backend | tentativas pelo portal chegaram a **429**, e a chamada direta ao backend, do mesmo IP, também deu 429: o backend enxerga o IP real pelo proxy, então o limite vale por pessoa |
| Senha pública nas contas de equipe e admin | backend | login de `admin.plataforma@demo.asa` com `Demo@2026` → **401** |
| Cron | projeto backend | `vercel crons ls` → `/api/internal/jobs/sla-scan`, `0 9 * * *` |

Endpoints exercitados em produção: 19 (saúde, plataforma, fila, autenticação do app e do portal, dados do aluno,
catálogo, assistente, agente e tarefas).

Observação de latência: as primeiras chamadas de cada instância levaram ~1 s (cold start + primeira conexão ao
banco); as seguintes ficaram em ~80–130 ms.
