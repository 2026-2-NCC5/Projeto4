# Contratos da API (app e portal)

## Fonte única e cópias verificadas

- **Canônico:** `src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts`.
- **Cópias idênticas byte a byte:**
  - `api/src/contracts/mobileApi.v1.ts` (API);
  - `Frontend/types/api.ts` (app);
  - `Web/src/types/api.ts` (portal).
- `Backend/scripts/check-contracts-sync.sh` compara as quatro cópias e roda no CI (job "Contratos sincronizados").
  Qualquer divergência quebra o build.
- Para alterar: edite o canônico, copie para as três cópias (o script mostra o `cp` exato) e rode
  `typecheck` nos três projetos.

## Versões (todas compatíveis com as anteriores)

| Versão | Seção | Conteúdo |
|---|---|---|
| 1.0–1.2 | base | Autenticação, aluno, agente, assistente, saúde |
| 1.3 | support | Atendimento ASA (chamados, mensagens, anexos, avisos, fila da equipe) |
| 1.4 | queue | Fila presencial e push |
| 1.5 | platform | `/api/platform/info`, `/api/auth/me`, sessões, sessão web (cookies + CSRF), central de avisos, painel, métricas, CSV, alunos atendidos, auditoria; canal `web` nos chamados |
| 1.6 | appointments | Agendamentos do aluno e da equipe, disponibilidade, `.ics` |
| 1.7 | knowledge/assistant/agent | Base de conhecimento, `sources`/`handoff`/`provider` no assistente, feedback e indicadores do agente |
| 1.8 | admin | Administração completa. Também: `location` na reserva e na remarcação, `rescheduledToId`, filtro `sla=near_deadline`, `?limit` no `PATCH /api/notifications`, primeira resposta da equipe (`SupportTicket.firstResponse`, `SupportCategory.firstResponseHours`, `kpis.firstResponseOnTime`/`firstResponseMeasured`) |

`GET /api/platform/info` informa `contractVersion` (hoje `1.8`). Campos novos são opcionais ou têm valor padrão.
Nenhum campo existente mudou de tipo nem de significado.

## Envelope

```jsonc
// sucesso
{ "data": { … }, "meta": { "requestId": "…", "correlationId": "…" } }
// erro
{ "error": { "code": "CONFLICT", "message": "Texto para pessoas", "reason": "slot_unavailable",
             "details": [{ "field": "startsAt", "message": "…" }], "requestId": "…", "correlationId": "…" } }
```

- `code`: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `RATE_LIMITED` (429, com `retryAfterSeconds` e `Retry-After`), `DEPENDENCY_ERROR` (502/503), `TIMEOUT` (504),
  `CONTRACT_ERROR` e `INTERNAL_ERROR` (500).
- `reason`: motivo **estável** para o cliente decidir a mensagem. Os clientes nunca exibem detalhes técnicos.
- `X-Correlation-Id` é aceito e devolvido. Logs e auditoria usam o mesmo identificador.

### Motivos mais usados

| Área | `reason` |
|---|---|
| Sessão | `missing_token`, `token_expired`, `token_invalid`, `session_expired`, `session_revoked`, `csrf_failed`, `invalid_credentials`, `account_disabled`, `demo_account_disabled`, `rate_limited` |
| Autorização | `permission_denied`, `feature_disabled` (também no `404` do assistente desligado, mantido por compatibilidade com o app) |
| Dependências | `database_required` (recurso exige PostgreSQL), `academic_source_unavailable`, `queue_disabled`, `recovery_unavailable` |
| Chamados | `ticket_changed` (versão), `ticket_not_open`, `ticket_finished`, `invalid_transition`, `status_unchanged`, `attachment_unavailable`, `file_too_large`, `file_type_not_allowed`, `file_type_mismatch`, `export_too_large` |
| Agendamentos | `slot_unavailable`, `student_conflict`, `active_limit`, `too_soon`, `too_far`, `change_window_closed`, `appointment_not_active`, `appointment_changed`, `availability_overlap` |
| Base de conhecimento | `article_changed`, `publish_blocked`, `slug_taken` (também para endereços reservados, como `manage`) |
| Administração | `self_change`, `last_admin`, `invalid_transition`, `account_exists`, `already_active` |

## Convenções

- **Autenticação.**
  - App: `Authorization: Bearer <jwt>`.
  - Portal: cookies `asa_at`/`asa_rt`, mais `X-CSRF-Token` em qualquer método que altera dados.
  - As mesmas rotas servem os dois canais. O servidor registra o canal (`app` ou `web`) nos chamados,
    agendamentos e auditoria.
- **Idempotência.**
  - O cliente gera `clientRequestId`, de 8 a 128 caracteres, para abrir chamado, agendar e remarcar.
  - O cliente gera `clientMessageId` para mensagens.
  - Repetir o pedido devolve o mesmo recurso (200 em vez de 201) e nunca cria um duplicado.
- **Concorrência otimista.** Alterações da equipe em chamados e agendamentos, e edições de artigos, levam a
  versão esperada. Se ela mudou: `409 ticket_changed` / `appointment_changed` / `article_changed`.
- **Paginação.**
  - Listas de chamados usam cursor opaco (`cursor`, `nextCursor`).
  - Listas administrativas usam `page`/`pageSize` (máximo 100) e devolvem `total`.
- **Datas.**
  - Instantes em ISO 8601 UTC (`…Z`).
  - Datas de calendário em `AAAA-MM-DD` no fuso da instituição (`America/Sao_Paulo`). Esses são os parâmetros
    `from`/`to` de métricas, horários e agenda, e as datas das séries.
- **Origem dos dados.** Métricas e painéis trazem `source` (descrição, `generatedAt`, fuso, `dataMode`). Toda
  resposta leva `X-ASA-Data-Mode`.

## Rotas por área

### Plataforma, conta e avisos (todos os perfis)

`GET /api/platform/info` · `GET /api/auth/me` · `GET /api/auth/sessions` · `DELETE /api/auth/sessions/:id` ·
`POST /api/auth/sessions/revoke-others` · `POST /api/auth/logout-all` ·
`GET /api/web/auth/csrf` · `POST /api/web/auth/{session,login,register,refresh,logout}` ·
`GET|PATCH /api/notifications` · `GET|PATCH /api/notifications/preferences` · `GET /api/audit/mine` (equipe e administração)

### Aluno (app e portal)

| Recurso | Rotas |
|---|---|
| Acadêmico | `GET /api/student/{me,summary,subjects,assessments,attendance,pending-items}` |
| Agente | `POST /api/agent/analyze` · `GET /api/agent/recommendations(/:id)` · `POST /api/agent/recommendations/:id/feedback` · `GET /api/agent/history(/:runId)` |
| Assistente | `POST /api/assistant/message` (resposta com `sources`, `handoff`, `provider`) |
| Chamados | `GET /api/support/{catalog,overview}` · `GET|POST /api/support/tickets` · `GET /api/support/tickets/:id(/events)` · `POST /api/support/tickets/:id/{messages,read,cancel,reopen,rating}` · `POST /api/support/uploads` · `GET /api/support/notifications` |
| Agendamentos | `GET /api/appointments/{catalog,slots}` · `GET|POST /api/appointments` · `GET /api/appointments/:id(/calendar.ics)` · `POST /api/appointments/:id/{cancel,reschedule}` |
| Ajuda | `GET /api/knowledge-base(/:slug)` |
| Fila presencial | `/api/queue/*` (ver ADR-007) |

### Equipe ASA

| Recurso | Rotas |
|---|---|
| Painel e métricas | `GET /api/asa/dashboard` · `GET /api/asa/metrics?from&to` · `GET /api/asa/reports/tickets.csv?from&to` |
| Fila de chamados | `GET /api/support/staff/tickets?status&assigned&team&category&priority&sla=at_risk\|near_deadline\|overdue&unread&sort&search&cursor` · `GET /api/support/staff/tickets/:id` · `POST …/{read,status,assign,messages,notes,priority,resolve}` · `POST|DELETE /api/support/staff/uploads` |
| Alunos atendidos | `GET /api/asa/students` · `GET /api/asa/students/:id` (auditado) |
| Agenda | `GET /api/asa/appointments?from&to&status&attendant=mine` · `GET|PATCH /api/asa/appointments/:id` · `GET|POST /api/asa/availability` · `PATCH /api/asa/availability/:id` |
| Base de conhecimento | `GET|POST /api/knowledge-base/manage` · `GET|PUT /api/knowledge-base/manage/:id` · `POST …/:id/{submit,publish,archive,restore}` |
| Indicadores do agente | `GET /api/asa/agent-insights?from&to` |

### Administração

`GET /api/admin/overview` · `GET|POST /api/admin/users` · `GET|PATCH /api/admin/users/:id` ·
`POST /api/admin/users/:id/{revoke-sessions,invite}` · `GET /api/admin/permissions` ·
`GET /api/admin/sla-policies` · `PUT /api/admin/sla-policies/:categoryId` ·
`GET|POST /api/admin/automations` · `PATCH /api/admin/automations/:id` · `GET /api/admin/automations/:id/runs` ·
`GET /api/admin/integrations` · `GET /api/admin/health` · `GET /api/admin/settings` · `PUT /api/admin/settings/:key` ·
`GET /api/admin/tickets` (metadados) · `GET /api/admin/audit-events`. A administração também usa as rotas de
métricas, base de conhecimento e indicadores do agente.

A permissão exigida por cada rota está em [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md).
