# API de estágios

Todas as rotas exigem a sessão ASA Conecta e vínculo de estudante, suportando Bearer e cookie web/CSRF conforme o middleware existente. O identificador do estudante nunca vem do payload.

| Método | Rota | Função |
|---|---|---|
| GET | `/api/v1/internships` | Lista solicitações próprias |
| POST | `/api/v1/internships` | Cria rascunho idempotente por `clientRequestId` |
| GET/PATCH | `/api/v1/internships/:id` | Consulta ou atualiza rascunho próprio |
| POST | `/api/v1/internships/:id/validate` | Valida endereço, dados e datas |
| POST | `/api/v1/internships/:id/documents/generate` | Cria versão, snapshot e hash; `omitFields` apenas para teste de falha |
| GET | `/api/v1/internships/:id/documents` | Lista versões próprias |
| POST | `/api/v1/internships/:id/submit` | Prepara encaminhamento manual se a versão for válida |
| GET | `/api/v1/internships/:id/timeline` | Lista eventos próprios |
| POST | `/api/v1/internships/:id/appeals` | Abre contestação rastreável |

Contrato OpenAPI: [`openapi.yaml`](openapi.yaml). A validação efetiva segue os schemas Zod em `api/src/internships/routes.ts`.
