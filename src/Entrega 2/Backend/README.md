# Entrega 2 — Backend

Serviços do ASA Conecta. Os comandos abaixo rodam **a partir desta pasta** (`src/Entrega 2/Backend`).

| Módulo | Pasta |
| --- | --- |
| API principal (Node.js + TypeScript) | [`api/`](api/README.md) |
| Agent Service + Agent Engine (Python) | [`agent-service/`](agent-service/README.md) |
| Banco (migrations e seeds) | [`database/`](database/README.md) |
| Contratos versionados | [`contracts/`](contracts/README.md) |
| Scripts (E2E e sincronia de contratos) | `scripts/` |
| Ambiente local (PostgreSQL + API + agente + Mailpit) | `docker-compose.yml` e `.env.example` |

```bash
docker compose up -d --build          # sobe tudo; a API aplica migrations e seeds
./scripts/e2e.sh                      # cenários E2E oficiais + evidências
./scripts/check-contracts-sync.sh     # contrato Mobile ↔ API igual nas três cópias
```

O aplicativo mobile fica em [`../Frontend`](../Frontend/README.md). Instruções completas no
[README principal](../../../README.md#-como-executar-o-asa-conecta).
