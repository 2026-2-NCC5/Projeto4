# Contratos do ASA Conecta

Contratos explícitos e versionados entre os módulos (TASK-004 §22–26).

| Fronteira | Fonte da verdade | Formato |
| --- | --- | --- |
| Node.js API ↔ Python Agent Service | `contracts/agent/student-agent-request.v1.json` e `student-agent-response.v1.json` | JSON Schema (snake_case) |
| Mobile ↔ Node.js API | `contracts/api/mobile-api.v1.ts` | Tipos TypeScript (camelCase), copiados para API e mobile |

## Regras

- `contract_version` segue `MAJOR.MINOR`. Consumidores aceitam apenas `1.x`; qualquer outro major é rejeitado com falha controlada (`CONTRACT_ERROR` na API, `422` no Agent Service).
- O Agent Service valida o request com Pydantic (`src/Entrega 2/Backend/agent-service/app/contracts/schemas.py`).
- A API Node.js valida a resposta com Zod (`src/Entrega 2/Backend/api/src/contracts/agentContract.ts`) antes de persistir ou devolver ao mobile.
- Os exemplos em `contracts/agent/examples/` são usados pelos testes de contrato dos dois serviços. Alterar o schema exige atualizar exemplos e testes.
- A transformação snake_case → camelCase acontece somente na API Node.js (`src/Entrega 2/Backend/api/src/services/agentService.ts`).

## Assistente conversacional (Mobile ↔ API)

Os tipos `Assistant*` foram adicionados ao final de `contracts/api/mobile-api.v1.ts` como mudança
compatível (nenhum tipo existente mudou). A allow-list de intenções do tipo `AssistantIntent` é
espelhada em `src/Entrega 2/Backend/api/src/assistant/intents.ts` (`INTENT_KIND: Record<AssistantIntent, …>`),
o que quebra a compilação da API se uma intenção for adicionada ao contrato sem implementação.

## Autenticação (Mobile ↔ API)

`AuthSession` passou a ter `refreshExpiresIn` e `rememberMe`, e o contrato ganhou `AuthPolicy`,
`ProgramOption`, `RegisterRequest`, os tipos de recuperação de senha e de biometria, o código
`RATE_LIMITED` e os campos `retryAfterSeconds`/`attemptsRemaining` em `ApiErrorBody`. Como
`AuthSession` mudou de forma obrigatória, API e app foram atualizados juntos.
