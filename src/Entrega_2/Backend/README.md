# Entrega 2 — Backend

Serviços do ASA Conecta. Os comandos abaixo rodam **a partir desta pasta** (`src/Entrega_2/Backend`).

| Módulo | Pasta |
| --- | --- |
| API principal (Node.js + TypeScript) | [`api/`](api/README.md) |
| Agent Service + Agent Engine (Python) | [`agent-service/`](agent-service/README.md) |
| Banco (migrations e seeds) | [`database/`](database/README.md) |
| Contratos versionados | [`contracts/`](contracts/README.md) |
| Scripts (E2E, sincronia de contratos, smoke test de uma implantação) | `scripts/` |
| Ambiente local **opcional** em containers (PostgreSQL + API + agente + Mailpit + portal) | `docker-compose.yml` e `.env.example` |

Produção: **Vercel**. Esta pasta é o projeto `asa-conecta-api` ([`vercel.json`](vercel.json): Services `api` e
`agent`, com o agente privado), e o portal é um projeto separado. O banco é PostgreSQL gerenciado (Supabase, schema
`asa`). Desenvolvimento roda com ou sem Docker. Passo a passo, variáveis e decisões em
[`docs/migration/`](../../../docs/migration/04-deploy-vercel.md).

```bash
docker compose up -d --build          # opcional: sobe tudo; a API aplica migrations e seeds
./scripts/e2e.sh                      # cenários E2E oficiais + evidências
./scripts/check-contracts-sync.sh     # contrato Mobile ↔ API igual nas três cópias
node scripts/smoke.mjs <url>          # verifica uma implantação (local, preview ou produção); código 1 em falha
```

O aplicativo mobile fica em [`../Frontend`](../Frontend/README.md). Instruções completas no
[README principal](../../../README.md#-como-executar-o-asa-conecta).
