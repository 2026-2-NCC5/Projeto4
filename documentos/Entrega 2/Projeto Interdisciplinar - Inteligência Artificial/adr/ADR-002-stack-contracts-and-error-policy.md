# ADR-002 — Stack, contratos versionados e política de erros

- **Status:** Aceito
- **Data:** 2026-09-16
- **Origem:** [TASK-001](<../../../Entrega 1/Projeto Interdisciplinar - Inteligência Artificial/pipelines/TASK_001.md>) §2 e §11, [TASK-004](<../../../Entrega 1/Projeto Interdisciplinar - Inteligência Artificial/pipelines/TASK_004.md>) §22-39

## Decisão de stack

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Mobile | Expo SDK 57 / React Native 0.86 / TypeScript | UI, estado, sessão segura, cliente HTTP |
| API principal / BFF | Node.js 20 + TypeScript + Express 5 + pg + zod | auth, autorização, sessão, composição, acesso ao PostgreSQL, cliente do agente |
| Agent Service | Python 3.12 + FastAPI + Pydantic v2 | endpoint interno, validação de contrato, orquestração do engine |
| Agent Engine | Python puro (dataclasses + YAML) | regras, evidências, confiança, abstenção, validação humana |
| Persistência | PostgreSQL 16 | dados acadêmicos sintéticos + execuções do agente |
| Infra | Docker Compose, GitHub Actions | ambiente reproduzível e CI |

O Node.js **não** foi substituído pelo Python: o Python não conhece usuários, JWT ou banco.

## Contratos

- `src/Entrega 2/Backend/contracts/agent/*.v1.json` (Node ↔ Python, snake_case) — validados por Zod (consumidor)
  e Pydantic (provedor). `contract_version` segue `MAJOR.MINOR`; o consumidor aceita
  apenas `1.x`. Major diferente → `CONTRACT_ERROR` (502) na API; `422
  CONTRACT_VERSION_UNSUPPORTED` no Agent Service.
- `src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts` (Mobile ↔ Node, camelCase) — copiado para os dois
  projetos e verificado em CI (`src/Entrega 2/Backend/scripts/check-contracts-sync.sh`).
- A transformação snake_case → camelCase acontece uma única vez, em
  `src/Entrega 2/Backend/api/src/services/agentService.ts`.

## Rastreabilidade

`request_id` (por requisição), `correlation_id` (por fluxo, aceito do header
`x-correlation-id` ou gerado) e `run_id` (por execução do agente, gerado pelo engine)
são propagados por header e corpo e persistidos em `agent_runs`.

## Política de erros (TASK-004 §36)

| Situação | HTTP | `code` | Mensagem ao estudante |
| --- | --- | --- | --- |
| Contrato/dados inválidos do cliente | 400 | `VALIDATION_ERROR` | detalhes por campo |
| Sem sessão / token inválido ou expirado | 401 | `UNAUTHORIZED` (+`reason`) | "Sua sessão expirou. Entre novamente." |
| Autenticado sem permissão / dado de outro estudante | 403 | `FORBIDDEN` | — |
| Recurso inexistente | 404 | `NOT_FOUND` | — |
| Agent Service indisponível ou 5xx | 503 | `DEPENDENCY_ERROR` | "Não foi possível concluir a análise. Tente novamente." |
| Agent Service excedeu `AGENT_SERVICE_TIMEOUT_MS` | 504 | `TIMEOUT` | "A análise está demorando mais que o esperado. Tente novamente." |
| Resposta fora do contrato 1.x | 502 | `CONTRACT_ERROR` | mensagem controlada |
| Falha interna | 500 | `INTERNAL_ERROR` | sem stack trace |

Abstenção (`status = abstained`) **não** é erro: retorna `201` com `abstained = true` e motivo.
