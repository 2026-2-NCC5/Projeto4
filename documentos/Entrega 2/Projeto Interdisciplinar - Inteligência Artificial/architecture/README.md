# Arquitetura do ASA Conecta (Entrega 2)

```text
┌───────────────────────────────┐
│      ASA Conecta Mobile       │  src/Entrega 2/Frontend — Expo / React Native / TypeScript
│  telas → hooks → services →   │  sessão em expo-secure-store, timeouts em config/services.ts
│  apiClient (timeout, erros)   │
└───────────────┬───────────────┘
                │ HTTPS/REST · Bearer JWT · x-correlation-id
                ▼
┌───────────────────────────────┐
│ API principal / BFF           │  src/Entrega 2/Backend/api — Node.js 20 + TypeScript + Express 5
│ routes → controllers →        │  auth (bcrypt + JWT + refresh rotativo), autorização por sessão,
│ services → repositories (pg)  │  composição do contexto acadêmico, cliente do agente com timeout,
│ clients/agentClient (zod)     │  validação do contrato 1.x, persistência de runs/recomendações/evidências
└───────────────┬───────────────┘
                │ contrato interno v1 (src/Entrega 2/Backend/contracts/agent/*.v1.json) · request_id/correlation_id
                ▼
┌───────────────────────────────┐
│ Agent Service                 │  src/Entrega 2/Backend/agent-service — Python + FastAPI + Pydantic
│ api/routes → services →       │  POST /internal/v1/student-agent/evaluate (não exposto ao mobile)
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│ Student Agent Engine          │  app/agent/{models,config,evaluator,recommendations,abstention,engine}.py
│ validação → regras →          │  sem FastAPI/HTTP; configurado por app/config/*.yaml
│ recomendações → confiança →   │
│ abstenção / validação humana  │
└───────────────────────────────┘
                │
                ▼
          PostgreSQL 16 (src/Entrega 2/Backend/database: migrations, seeds) — acessado apenas pela API Node.js
```

## Estrutura do repositório

```text
documentos/
├── Entrega 1/<matéria>/          entregas de cada disciplina (TASK-001…005 em Projeto Interdisciplinar)
└── Entrega 2/<matéria>/          esta documentação: adr, architecture, api, assistant, evidence
src/
├── Entrega 1/                    protótipo da primeira entrega (Supabase + mocks), mantido como histórico
└── Entrega 2/
    ├── Frontend/                 aplicativo Expo (ver Frontend/README.md)
    └── Backend/
        ├── api/                  API Node.js (ver api/README.md)
        ├── agent-service/        Agent Service + Agent Engine (ver agent-service/README.md)
        ├── database/             migrations e seeds (dados sintéticos)
        ├── contracts/            contratos versionados (agent v1 JSON Schema, mobile-api v1 TS)
        ├── scripts/              e2e.sh, check-contracts-sync.sh
        └── docker-compose.yml    PostgreSQL + API + Agent Service + Mailpit
imagens/                          logos e recursos visuais
.github/workflows/ci.yml          CI (contratos, Python, Node, mobile, Docker)
```

## Fluxo de sucesso (E2E-001)

1. Mobile: `POST /api/auth/login` (usuário sintético) → access token (15 min) + refresh token rotativo.
2. Mobile: `POST /api/agent/analyze` com `Authorization: Bearer` e `x-correlation-id`.
3. API: middleware gera `request_id`, preserva `correlation_id`; `authenticate` valida o JWT e a sessão; `requireStudent` deriva o estudante da sessão (nunca do corpo).
4. API: `StudentService.buildAcademicContext` monta `subjects/pending_items/attendance/assessments` a partir do PostgreSQL.
5. API → Agent Service: `POST /internal/v1/student-agent/evaluate` (contrato 1.0, `AGENT_SERVICE_TIMEOUT_MS`).
6. Agent Service: verifica major do contrato, valida com Pydantic, chama `StudentAgentEngine.evaluate`.
7. Engine: valida consistência, aplica regras, calcula confiança, decide abstenção/validação humana, gera `run_id`.
8. API: valida a resposta com Zod, persiste `agent_runs` → `agent_recommendations` → `agent_evidence`, converte para camelCase.
9. Mobile: exibe resumo, recomendações, "Por que estou vendo isso?" (evidências), próxima ação, confiança, validação humana ou abstenção.

## Fluxos de falha

| Cenário | Onde é detectado | Resposta da API | Mobile |
| --- | --- | --- | --- |
| Agent Service fora do ar (E2E-002) | `agentClient` (fetch falha) | 503 `DEPENDENCY_ERROR` | "Não foi possível concluir a análise. Tente novamente." |
| Agent Service lento (E2E-003) | `AbortController` após `AGENT_SERVICE_TIMEOUT_MS` | 504 `TIMEOUT` | "A análise está demorando mais que o esperado. Tente novamente." |
| Contrato 2.0 / schema inválido (E2E-004) | `validateAgentResponse` (zod) | 502 `CONTRACT_ERROR` | mensagem controlada + tentar novamente |
| Dados insuficientes (E2E-005) | Engine (`abstention.py`) | 201 `status: abstained` | card de abstenção com motivo |
| Validação humana (E2E-006) | Engine (regras `attendance_critical`, `institutional_validation`) | 201 `requiresHumanValidation: true` | banner + próxima ação segura |
| Sem token / outro estudante (E2E-008) | `authenticate` / serviços | 401 / 403 | volta ao login / mensagem de permissão |

Nenhum desses caminhos persiste um `agent_run`, exceto a abstenção e a validação humana,
que são execuções válidas.

## Configuração

| Variável | Serviço | Uso |
| --- | --- | --- |
| `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_TTL_DAYS` | API | persistência e sessão |
| `AGENT_SERVICE_URL`, `AGENT_SERVICE_TIMEOUT_MS` | API | integração com o agente |
| `AGENT_CONFIG_DIR`, `AGENT_LOG_LEVEL` | Agent Service | configuração e logs |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_TIMEOUT_MS`, `EXPO_PUBLIC_ANALYSIS_TIMEOUT_MS` | Mobile | base URL e timeouts |

Detalhes do agente (regras, limiares, confiança): [agent-engine.md](agent-engine.md).
Assistente por voz/texto (intenções, segurança, privacidade): [voice-assistant.md](voice-assistant.md).
Autenticação (cadastro, recuperação, sessão, biometria, controles de segurança): [authentication.md](authentication.md).
