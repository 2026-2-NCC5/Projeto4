# API principal — ASA Conecta (Node.js + TypeScript)

> Portal web, sessões por cookie, agendamentos, base de conhecimento, operação do ASA e administração (contrato
> v1.5–v1.8): ver `documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/plataforma/API_CONTRACTS.md`
> e o runbook `plataforma/DEPLOYMENT_RUNBOOK.md` (variáveis novas: modo demonstração, `WEB_ORIGINS`, `AI_PROVIDER`,
> `ASA_QUEUE_SOURCE_AUTHORIZED`, `AUTOMATION_SCAN_INTERVAL_SECONDS`).

Responsável por autenticação, autorização, sessão, acesso ao PostgreSQL, integração com o
Agent Service e composição das respostas para o mobile. Referência de rotas em
[`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/api/README.md`](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/api/README.md>).

## Pré-requisitos

- Node.js 20+ e npm
- PostgreSQL 16 (`docker compose up -d db` em `src/Entrega_2/Backend`) **ou** o banco online no Supabase
  (`DATABASE_URL` do pooler; ver [`database/README.md`](../database/README.md#banco-online-supabase))
- Agent Service rodando (ver `src/Entrega_2/Backend/agent-service/README.md`) — sem ele a análise responde `503`

## Instalação e execução

```bash
cp .env.example .env          # ajuste DATABASE_URL (local ou Supabase), JWT_SECRET, AGENT_SERVICE_URL
npm install
npm run db:migrate            # constrói o schema (database/migrations)
npm run db:seed               # dados sintéticos (database/seeds)
npm run dev                   # http://localhost:3000 (tsx watch)
```

Produção/containers: `npm run build && npm start`.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint (typescript-eslint) / `tsc --noEmit` |
| `npm run test:unit` | testes sem banco (repositórios em memória + stub do agente) |
| `npm run test:integration` | exige `TEST_DATABASE_URL` (banco descartável); **recria o schema** e valida migrations, seeds e persistência |
| `npm run test:e2e` | exige `TEST_DATABASE_URL`; sobe o Agent Service Python real e executa os cenários E2E; os de autenticação também exigem o Mailpit |
| `npm run db:migrate` / `db:seed` / `db:reset` | migrations, seeds, reset (bloqueado em produção e em bancos remotos sem `ALLOW_REMOTE_DB_RESET=true`) |
| `npm run agent:stub` | stub do Agent Service (`AGENT_STUB_MODE=ok|slow|incompatible|error`) para reproduzir falhas manualmente |

`E2E_WRITE_EVIDENCE=1 npm run test:e2e` grava `documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/evidence/e2e/last-run.{md,json}` e
`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/evidence/e2e/voice-last-run.{md,json}`.

## Autenticação

Cadastro, login com "Manter conectado", recuperação de senha por código enviado por e-mail, refresh
rotativo e login biométrico por credencial de dispositivo. Para receber os códigos localmente:
`docker compose up -d mailpit` e abra <http://localhost:8025>. Detalhes e controles de segurança:
[`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/authentication.md`](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/authentication.md>).

## Assistente conversacional

`POST /api/assistant/message` interpreta a pergunta (voz transcrita ou texto) com regras
determinísticas, valida a interpretação (allow-list, disciplina do estudante, confiança mínima) e
responde com dados reais ou com o Agente para o Estudante. Para trocar o interpretador (ex.: LLM),
injete um `IntentInterpreter` em `createApp({ intentInterpreter })`; a validação continua obrigatória.
Referência: [`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/voice-assistant.md`](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/voice-assistant.md>).

## Atendimento ASA (chamados)

`/api/support/*` (estudante) e `/api/support/staff/*` (equipe): abertura com protocolo e idempotência, histórico
somente-inserção, mensagens, anexos em duas fases (envio pendente → vínculo) com download por link assinado,
prazo em dias úteis com pausa enquanto aguarda o estudante, avisos (e push quando há aparelhos registrados),
avaliação, reabertura e cancelamento. Migration `004_support_tickets.sql`. Rotas: [`api/README.md`](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/api/README.md#atendimento-asa-chamados>);
decisões: [ADR-006](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/adr/ADR-006-support-tickets.md>).

## Fila presencial do ASA

Um monitor (`src/queue/`) lê a fila pública <https://presencial.fecap.br/> pelo endpoint JSON do próprio portal
(fallback HTML), a cada `ASA_QUEUE_POLL_INTERVAL_SECONDS`, para todos os alunos de uma vez; detecta quando a senha
acompanhada se aproxima ou é chamada e envia push pelo Expo (`src/notifications/`), sem duplicar alertas.
Rotas `/api/queue/*`, `/api/notifications/push-token`, `GET /health/queue`; migration `005_queue_tracking.sql`.
Desenvolvimento sem a fonte real: `ASA_QUEUE_PROVIDER=mock PUSH_PROVIDER=log npm run dev`. Arquitetura, variáveis
e limitações: [`architecture/queue-presencial.md`](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/queue-presencial.md>);
decisões: [ADR-007](<../../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/adr/ADR-007-queue-presencial.md>).

## Estrutura

```text
src/
├── createApp.ts               fábrica Express (injeção de dependências)
├── runtime.ts                 composição única (config, pool, repositórios, fila, push, app)
├── index.ts                   entrada da Vercel (export default app; sem laços, fila sob demanda)
├── server.ts                  servidor tradicional (npm start / Docker: laço da fila e timers)
├── worker.ts                  worker residente sem HTTP (npm run worker / Vercel Daemon)
├── config/                    env (zod) e logger (pino com redact)
├── contracts/                 agentContract.ts (zod, v1) · mobileApi.v1.ts (cópia do contrato canônico)
├── controllers/, routes/      handlers finos e rotas
├── auth/                      passwordPolicy, rateLimiter (em memória), secrets (tokens, HMAC, códigos)
├── mail/                      mailer (SMTP/nodemailer ou desabilitado) e templates
├── services/                  authService, passwordResetService, biometricService, studentService, agentService, assistantService
├── support/                   Atendimento ASA: catalog, sla, statuses, attachments, mappers, supportService (estudante), supportStaffService (equipe)
├── queue/                     fila presencial: providers (portal FECAP, HTML, mock), parsers, monitor, tracker,
│                              alertas, tempo real (SSE), service, rotas e repositórios (memória/PostgreSQL)
├── notifications/             push (Expo): NotificationService, provedores, aparelhos e registro de entregas
├── assistant/                 intents (allow-list), text, subjects, interpretation (validação),
│                              ruleBasedInterpreter (pt-BR), phrasing, responders
├── clients/agentClient.ts     HTTP → Agent Service com timeout e classificação de erros
├── repositories/              interfaces + implementação PostgreSQL
├── middlewares/               requestContext, auth, validate, errorHandler
├── db/                        pool, migrate, seed, reset, migrationManifest (migrations esperadas)
└── errors/AppError.ts         códigos de erro e status
test/unit, integration, e2e, support/
```

## Reproduzindo falhas manualmente

```bash
# terminal 1: stub lento (timeout)
AGENT_STUB_MODE=slow AGENT_STUB_PORT=8001 npm run agent:stub
# terminal 2: API apontando para o stub com timeout curto
AGENT_SERVICE_URL=http://localhost:8001 AGENT_SERVICE_TIMEOUT_MS=1000 npm run dev
```

Modos: `slow` → 504 `TIMEOUT`; `incompatible` → 502 `CONTRACT_ERROR`; `error` → 503
`DEPENDENCY_ERROR`; parar o stub → 503 `DEPENDENCY_ERROR`.
