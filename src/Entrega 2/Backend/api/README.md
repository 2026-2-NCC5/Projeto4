# API principal — ASA Conecta (Node.js + TypeScript)

Responsável por autenticação, autorização, sessão, acesso ao PostgreSQL, integração com o
Agent Service e composição das respostas para o mobile. Referência de rotas em
[`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/api/README.md`](<../../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/api/README.md>).

## Pré-requisitos

- Node.js 20+ e npm
- PostgreSQL 16 (`docker compose up -d db` em `src/Entrega 2/Backend`) **ou** o banco online no Supabase
  (`DATABASE_URL` do pooler; ver [`database/README.md`](../database/README.md#banco-online-supabase))
- Agent Service rodando (ver `src/Entrega 2/Backend/agent-service/README.md`) — sem ele a análise responde `503`

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

`E2E_WRITE_EVIDENCE=1 npm run test:e2e` grava `documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/last-run.{md,json}` e
`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/voice-last-run.{md,json}`.

## Autenticação

Cadastro, login com "Manter conectado", recuperação de senha por código enviado por e-mail, refresh
rotativo e login biométrico por credencial de dispositivo. Para receber os códigos localmente:
`docker compose up -d mailpit` e abra <http://localhost:8025>. Detalhes e controles de segurança:
[`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/authentication.md`](<../../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/authentication.md>).

## Assistente conversacional

`POST /api/assistant/message` interpreta a pergunta (voz transcrita ou texto) com regras
determinísticas, valida a interpretação (allow-list, disciplina do estudante, confiança mínima) e
responde com dados reais ou com o Agente para o Estudante. Para trocar o interpretador (ex.: LLM),
injete um `IntentInterpreter` em `createApp({ intentInterpreter })`; a validação continua obrigatória.
Referência: [`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/voice-assistant.md`](<../../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/voice-assistant.md>).

## Estrutura

```text
src/
├── app.ts, server.ts          fábrica Express (injeção de dependências) e bootstrap
├── config/                    env (zod) e logger (pino com redact)
├── contracts/                 agentContract.ts (zod, v1) · mobileApi.v1.ts (cópia do contrato canônico)
├── controllers/, routes/      handlers finos e rotas
├── auth/                      passwordPolicy, rateLimiter (em memória), secrets (tokens, HMAC, códigos)
├── mail/                      mailer (SMTP/nodemailer ou desabilitado) e templates
├── services/                  authService, passwordResetService, biometricService, studentService, agentService, assistantService
├── assistant/                 intents (allow-list), text, subjects, interpretation (validação),
│                              ruleBasedInterpreter (pt-BR), phrasing, responders
├── clients/agentClient.ts     HTTP → Agent Service com timeout e classificação de erros
├── repositories/              interfaces + implementação PostgreSQL
├── middlewares/               requestContext, auth, validate, errorHandler
├── db/                        pool, migrate, seed, reset
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
