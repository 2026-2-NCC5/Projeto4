# 03 — Matriz de integrações (frontend ↔ backend ↔ persistência)

Gerada a partir do código em 27/10/2026. As rotas vêm de `router.get/post/...` da API e foram cruzadas com:

- os consumidores no app (`Frontend/`) e no portal (`Web/src/`);
- os testes (`Backend/api/test`, `Web/e2e`, testes do portal e do app);
- o smoke test (`Backend/scripts/smoke.mjs`).

Cada linha corresponde a uma rota. Nenhum caminho mudou na migração.

**Resumo:** 136 endpoints (134 existentes + 2 novos de tarefas agendadas).

| Resultado | Endpoints |
|---|---:|
| Validado por testes automatizados e pelo smoke test (local, entrada serverless e `vercel dev`) | 18 |
| Validado por testes automatizados (unitários, integração com PostgreSQL real, E2E, portal, app) | 112 |
| Sem teste dedicado: consumido pelos clientes, mas sem teste automatizado próprio (situação anterior à migração) | 6 |

Os 6 sem teste dedicado: `POST /api/web/auth/register`, `POST /api/web/auth/session`,
`GET /api/support/tickets/:id/events`, `POST /api/support/staff/uploads`, `DELETE /api/support/staff/uploads/:uploadId`
e `GET /api/support/staff/tickets/:id/attachments/:attachmentId/link`. As versões equivalentes do aluno e do app
têm testes. Ficam como pendência P3 em [10-relatorio-final.md](10-relatorio-final.md).

Legenda: `App:` = `src/Entrega_2/Frontend/…`, `Portal:` = `src/Entrega_2/Web/src/…`,
`api:` = `Backend/api/test/…`, `e2e:` = `Web/e2e/…`, `w:` = testes do portal, `m:` = testes do app.
"(+n)" indica mais arquivos além dos listados. O handler é `arquivo:linha` em `Backend/api/src/`.

O que mudou de comportamento (mesmo contrato):

- Rotas da fila e `/health/queue`: atualizam o estado antes de responder quando a API roda sem processo residente.
- `GET /api/support/catalog`: `limits.maxAttachmentBytes` reflete o limite do ambiente (3 MiB na Vercel).
- `GET /api/admin/health`: as migrations pendentes vêm da lista do código. Ela e `GET /api/admin/integrations`
  atualizam a fila antes de mostrar a saúde dela.
- `POST /api/assistant/message`: nas perguntas sobre a fila, atualiza o estado antes de responder.

### Saúde da aplicação (liveness/readiness)

Persistência: ping no PostgreSQL + /health do Agent Service.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /health` | App: config/services.ts (+1); Portal: types/api.ts | `routes/index.ts:106` | api:support/agentServiceProcess.ts, api:support/agentStubServer.ts (+1) · smoke | Validado — testes + smoke |
| `GET /health/queue` | monitoramento | `queue/routes.ts:68` | api:unit/queueApi.test.ts · smoke | Validado — testes + smoke |

### Plataforma (versão do contrato, ambiente, modo de dados)

Persistência: settings (somente leitura).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/platform/info` | App: features/platform/platformInfo.ts (+1); Portal: services/api/endpoints.ts | `routes/platform.ts:81` | api:unit/aiProviders.test.ts, api:unit/platform.test.ts (+7) · smoke | Validado — testes + smoke |

### Autenticação do app (Bearer + refresh token no SecureStore)

Persistência: users, refresh_sessions, password_resets, device_credentials.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `POST /api/auth/biometric/enroll` | App: config/services.ts | `routes/index.ts:132` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+1) | Validado — testes automatizados |
| `POST /api/auth/biometric/login` | App: config/services.ts | `routes/index.ts:133` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+1) | Validado — testes automatizados |
| `POST /api/auth/biometric/revoke` | App: config/services.ts | `routes/index.ts:134` | api:e2e/auth.e2e.test.ts, api:unit/authFlows.test.ts | Validado — testes automatizados |
| `POST /api/auth/forgot-password` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:128` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+1) | Validado — testes automatizados |
| `POST /api/auth/login` | App: config/services.ts | `routes/index.ts:123` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+10) · smoke | Validado — testes + smoke |
| `POST /api/auth/logout` | App: config/services.ts | `routes/index.ts:126` | api:integration/database.integration.test.ts, api:unit/auth.test.ts (+2) · smoke | Validado — testes + smoke |
| `POST /api/auth/logout-all` | Portal: services/api/endpoints.ts | `routes/platform.ts:111` | api:integration/platform.integration.test.ts, api:unit/platform.test.ts | Validado — testes automatizados |
| `GET /api/auth/me` | Portal: services/api/endpoints.ts | `routes/platform.ts:88` | api:integration/admin.integration.test.ts, api:integration/platform.integration.test.ts (+4) · smoke | Validado — testes + smoke |
| `GET /api/auth/policy` | App: config/authPolicy.ts (+2); Portal: services/api/endpoints.ts | `routes/index.ts:121` | api:unit/authFlows.test.ts, api:unit/platform.test.ts | Validado — testes automatizados |
| `GET /api/auth/programs` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:122` | api:integration/auth.integration.test.ts, api:unit/authFlows.test.ts | Validado — testes automatizados |
| `POST /api/auth/refresh` | App: config/services.ts | `routes/index.ts:125` | api:e2e/auth.e2e.test.ts, api:integration/admin.integration.test.ts (+6) · smoke | Validado — testes + smoke |
| `POST /api/auth/register` | App: config/services.ts | `routes/index.ts:124` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+4) | Validado — testes automatizados |
| `POST /api/auth/resend-reset-code` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:129` | api:unit/authFlows.test.ts | Validado — testes automatizados |
| `POST /api/auth/reset-password` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:131` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+1) | Validado — testes automatizados |
| `GET /api/auth/sessions` | App: types/api.ts; Portal: services/api/endpoints.ts (+1) | `routes/platform.ts:92` | api:integration/platform.integration.test.ts, api:unit/platform.test.ts | Validado — testes automatizados |
| `DELETE /api/auth/sessions/:id` | Portal: services/api/endpoints.ts | `routes/platform.ts:96` | api:unit/platform.test.ts | Validado — testes automatizados |
| `POST /api/auth/sessions/revoke-others` | Portal: services/api/endpoints.ts | `routes/platform.ts:105` | api:unit/platform.test.ts | Validado — testes automatizados |
| `POST /api/auth/verify-reset-code` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:130` | api:e2e/auth.e2e.test.ts, api:integration/auth.integration.test.ts (+1) | Validado — testes automatizados |

### Sessão do portal web (cookies HttpOnly + CSRF, mesma origem)

Persistência: users, refresh_sessions (cookie HttpOnly).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/web/auth/csrf` | Portal: services/api/client.ts (+1) | `routes/platform.ts:120` | api:support/webClient.ts, api:unit/platform.test.ts (+1) · smoke | Validado — testes + smoke |
| `POST /api/web/auth/login` | Portal: services/api/endpoints.ts | `routes/platform.ts:162` | api:support/webClient.ts, api:unit/platform.test.ts | Validado — testes automatizados |
| `POST /api/web/auth/logout` | Portal: services/api/endpoints.ts | `routes/platform.ts:208` | api:unit/platform.test.ts | Validado — testes automatizados |
| `POST /api/web/auth/refresh` | Portal: services/api/client.ts | `routes/platform.ts:192` | api:integration/platform.integration.test.ts, api:unit/platform.test.ts (+1) | Validado — testes automatizados |
| `POST /api/web/auth/register` | Portal: services/api/endpoints.ts | `routes/platform.ts:182` | — | Sem teste dedicado |
| `POST /api/web/auth/session` | Portal: services/api/endpoints.ts | `routes/platform.ts:129` | — | Sem teste dedicado |

### Dados acadêmicos do aluno (perfil, disciplinas, notas, faltas, pendências)

Persistência: students, subjects, enrollments, assessments, attendance, pending_items.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/student/assessments` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:139` | api:unit/student.test.ts, m:__tests__/App.test.tsx (+1) | Validado — testes automatizados |
| `GET /api/student/attendance` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:140` | api:integration/database.integration.test.ts, api:unit/student.test.ts (+1) | Validado — testes automatizados |
| `GET /api/student/me` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:136` | api:e2e/auth.e2e.test.ts, api:unit/auth.test.ts (+5) · smoke | Validado — testes + smoke |
| `GET /api/student/pending-items` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:141` | api:integration/database.integration.test.ts, api:unit/student.test.ts (+4) · smoke | Validado — testes + smoke |
| `GET /api/student/subjects` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:138` | api:e2e/scenarios.e2e.test.ts, api:integration/demoOff.integration.test.ts (+5) · smoke | Validado — testes + smoke |
| `GET /api/student/summary` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:137` | api:integration/database.integration.test.ts, api:unit/agent.test.ts (+5) · smoke | Validado — testes + smoke |

### Agente para o Estudante — IA explicável (API → Agent Service Python)

Persistência: agent_runs, agent_recommendations, agent_evidence, agent_feedback + Agent Service (Python).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `POST /api/agent/analyze` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:143` | api:e2e/scenarios.e2e.test.ts, api:integration/database.integration.test.ts (+4) | Validado — testes automatizados |
| `GET /api/agent/history` | App: config/services.ts (+1); Portal: services/api/endpoints.ts | `routes/index.ts:152` | api:integration/database.integration.test.ts, api:unit/agent.test.ts (+2) | Validado — testes automatizados |
| `GET /api/agent/history/:runId` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:153` | api:integration/database.integration.test.ts, api:unit/agent.test.ts (+1) | Validado — testes automatizados |
| `GET /api/agent/recommendations` | App: config/services.ts (+2); Portal: features/academic/api.ts (+2) | `routes/index.ts:144` | api:e2e/scenarios.e2e.test.ts, api:integration/knowledge.integration.test.ts (+4) | Validado — testes automatizados |
| `GET /api/agent/recommendations/:id` | App: config/services.ts; Portal: features/academic/api.ts (+1) | `routes/index.ts:145` | api:e2e/scenarios.e2e.test.ts, api:integration/knowledge.integration.test.ts (+3) | Validado — testes automatizados |
| `POST /api/agent/recommendations/:id/feedback` | Portal: features/academic/api.ts | `routes/index.ts:146` | api:integration/knowledge.integration.test.ts, w:pages/student/academic/AcademicPage.test.tsx | Validado — testes automatizados |

### Assistente ASA — voz e texto (intenções + base de conhecimento)

Persistência: assistant_interactions + dados acadêmicos + base de conhecimento.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `POST /api/assistant/message` | App: config/services.ts; Portal: services/api/endpoints.ts | `routes/index.ts:155` | api:e2e/voice.e2e.test.ts, api:integration/database.integration.test.ts (+8) · smoke | Validado — testes + smoke |

### Atendimento — visão da equipe ASA

Persistência: support_tickets, support_ticket_messages, support_ticket_events, support_attachments (bytea).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/support/staff/tickets` | Portal: features/insights/api.ts (+2) | `routes/support.ts:87` | api:integration/admin.integration.test.ts, api:integration/operations.integration.test.ts (+11) | Validado — testes automatizados |
| `GET /api/support/staff/tickets/:id` | Portal: features/support/staff/api.ts (+1) | `routes/support.ts:88` | api:integration/admin.integration.test.ts, api:integration/platform.integration.test.ts (+7) | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/assign` | Portal: services/api/endpoints.ts | `routes/support.ts:100` | api:integration/platform.integration.test.ts, api:integration/support.integration.test.ts (+3) | Validado — testes automatizados |
| `GET /api/support/staff/tickets/:id/attachments/:attachmentId/link` | Portal: features/support/staff/api.ts | `routes/support.ts:90` | — | Sem teste dedicado |
| `POST /api/support/staff/tickets/:id/messages` | Portal: services/api/endpoints.ts | `routes/support.ts:101` | api:integration/admin.integration.test.ts, api:integration/platform.integration.test.ts (+4) | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/notes` | Portal: services/api/endpoints.ts | `routes/support.ts:102` | api:integration/platform.integration.test.ts, api:integration/support.integration.test.ts (+1) | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/priority` | Portal: services/api/endpoints.ts | `routes/support.ts:103` | api:integration/support.integration.test.ts | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/read` | Portal: features/support/staff/api.ts | `routes/support.ts:89` | api:unit/operations.test.ts, w:pages/asa/ConversationsPage.test.tsx | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/resolve` | Portal: services/api/endpoints.ts | `routes/support.ts:104` | api:integration/support.integration.test.ts, api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/staff/tickets/:id/status` | Portal: services/api/endpoints.ts | `routes/support.ts:99` | api:integration/platform.integration.test.ts, api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/staff/uploads` | Portal: features/support/staff/api.ts (+1) | `routes/support.ts:105` | — | Sem teste dedicado |
| `DELETE /api/support/staff/uploads/:uploadId` | Portal: features/support/staff/api.ts | `routes/support.ts:106` | — | Sem teste dedicado |

### Atendimento — chamados do aluno, anexos e Central de ajuda

Persistência: support_tickets, support_ticket_messages, support_ticket_events, support_attachments (bytea).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/support/catalog` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:68` | api:integration/knowledge.integration.test.ts, api:unit/admin.test.ts (+15) · smoke | Validado — testes + smoke |
| `GET /api/support/files/:attachmentId` | link assinado gerado pela API | `routes/support.ts:85` | api:unit/support.test.ts | Validado — testes automatizados |
| `GET /api/support/notifications` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:82` | api:integration/platform.integration.test.ts, api:integration/support.integration.test.ts (+4) | Validado — testes automatizados |
| `POST /api/support/notifications/read` | App: features/support/config.ts | `routes/support.ts:83` | api:unit/support.test.ts | Validado — testes automatizados |
| `GET /api/support/overview` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:69` | api:unit/support.test.ts, w:pages/student/StudentDashboard.test.tsx | Validado — testes automatizados |
| `GET /api/support/tickets` | App: features/support/config.ts (+1); Portal: services/api/endpoints.ts (+1) | `routes/support.ts:70` | api:integration/admin.integration.test.ts, api:integration/platform.integration.test.ts (+14) | Validado — testes automatizados |
| `POST /api/support/tickets` | App: features/support/config.ts (+1); Portal: services/api/endpoints.ts (+1) | `routes/support.ts:71` | api:integration/admin.integration.test.ts, api:integration/platform.integration.test.ts (+14) | Validado — testes automatizados |
| `GET /api/support/tickets/:id` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:72` | api:integration/platform.integration.test.ts, api:integration/support.integration.test.ts (+6) | Validado — testes automatizados |
| `GET /api/support/tickets/:id/attachments/:attachmentId/link` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:79` | api:integration/support.integration.test.ts, api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/tickets/:id/cancel` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:76` | api:unit/admin.test.ts, api:unit/support.test.ts (+1) | Validado — testes automatizados |
| `GET /api/support/tickets/:id/events` | App: features/support/config.ts | `routes/support.ts:73` | — | Sem teste dedicado |
| `POST /api/support/tickets/:id/messages` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:74` | api:integration/support.integration.test.ts, api:unit/operations.test.ts (+1) | Validado — testes automatizados |
| `POST /api/support/tickets/:id/rating` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:78` | api:integration/support.integration.test.ts, api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/tickets/:id/read` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:75` | api:integration/support.integration.test.ts, api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/tickets/:id/reopen` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:77` | api:unit/support.test.ts | Validado — testes automatizados |
| `POST /api/support/uploads` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:80` | api:integration/support.integration.test.ts, api:unit/support.test.ts (+1) | Validado — testes automatizados |
| `DELETE /api/support/uploads/:uploadId` | App: features/support/config.ts; Portal: services/api/endpoints.ts | `routes/support.ts:81` | api:unit/support.test.ts | Validado — testes automatizados |

### Fila presencial do ASA (acompanhamento de senha, tempo real, push)

Persistência: queue_subscriptions, queue_subscription_events, queue_calls, queue_monitor_state, job_leases.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/queue` | App: features/queue/config.ts (+2); Portal: types/api.ts | `queue/routes.ts:73` | api:unit/platform.test.ts, api:unit/queueApi.test.ts · smoke | Validado — testes + smoke |
| `POST /api/queue/dev/mock` | App: features/queue/config.ts | `queue/routes.ts:91` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `GET /api/queue/status` | App: features/queue/config.ts (+1) | `queue/routes.ts:74` | api:unit/platform.test.ts, api:unit/queueApi.test.ts · smoke | Validado — testes + smoke |
| `GET /api/queue/stream` | App: features/queue/config.ts | `queue/routes.ts:75` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `POST /api/queue/subscriptions` | App: features/queue/config.ts | `queue/routes.ts:77` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `DELETE /api/queue/subscriptions/current` | App: features/queue/config.ts | `queue/routes.ts:85` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `GET /api/queue/subscriptions/current` | App: features/queue/config.ts | `queue/routes.ts:81` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `PATCH /api/queue/subscriptions/current` | App: features/queue/config.ts | `queue/routes.ts:82` | api:unit/queueApi.test.ts | Validado — testes automatizados |

### Notificações push e central de avisos

Persistência: push_devices, notification_deliveries, inbox (avisos).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/notifications` | App: features/notifications/api.ts (+2); Portal: services/api/endpoints.ts (+1) | `routes/platform.ts:226` | api:integration/appointments.integration.test.ts, api:integration/platform.integration.test.ts (+8) | Validado — testes automatizados |
| `PATCH /api/notifications` | App: features/notifications/api.ts (+2); Portal: services/api/endpoints.ts (+1) | `routes/platform.ts:230` | api:integration/appointments.integration.test.ts, api:integration/platform.integration.test.ts (+8) | Validado — testes automatizados |
| `GET /api/notifications/preferences` | Portal: services/api/endpoints.ts | `routes/platform.ts:235` | api:unit/platform.test.ts | Validado — testes automatizados |
| `PATCH /api/notifications/preferences` | Portal: services/api/endpoints.ts | `routes/platform.ts:239` | api:unit/platform.test.ts | Validado — testes automatizados |
| `DELETE /api/notifications/push-token` | App: features/queue/config.ts | `notifications/routes.ts:50` | api:unit/queueApi.test.ts | Validado — testes automatizados |
| `POST /api/notifications/push-token` | App: features/queue/config.ts | `notifications/routes.ts:44` | api:unit/queueApi.test.ts | Validado — testes automatizados |

### Agendamentos — aluno

Persistência: appointments, availability (migration 007/010).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/appointments` | App: features/appointments/config.ts (+1); Portal: features/appointments/api.ts (+3) | `routes/appointments.ts:93` | api:integration/appointments.integration.test.ts, api:integration/demoOff.integration.test.ts (+10) | Validado — testes automatizados |
| `POST /api/appointments` | App: features/appointments/config.ts (+1); Portal: features/appointments/api.ts (+3) | `routes/appointments.ts:97` | api:integration/appointments.integration.test.ts, api:integration/demoOff.integration.test.ts (+10) | Validado — testes automatizados |
| `GET /api/appointments/:id` | App: features/appointments/config.ts (+1); Portal: features/appointments/api.ts (+1) | `routes/appointments.ts:101` | api:integration/appointments.integration.test.ts, api:integration/demoOff.integration.test.ts (+6) | Validado — testes automatizados |
| `GET /api/appointments/:id/calendar.ics` | Portal: features/appointments/api.ts | `routes/appointments.ts:110` | api:integration/appointments.integration.test.ts, w:pages/student/appointments/AppointmentsPage.test.tsx (+1) | Validado — testes automatizados |
| `POST /api/appointments/:id/cancel` | App: features/appointments/config.ts; Portal: features/appointments/api.ts | `routes/appointments.ts:104` | api:integration/appointments.integration.test.ts, m:__tests__/appointmentDetail.test.tsx (+3) | Validado — testes automatizados |
| `POST /api/appointments/:id/reschedule` | App: features/appointments/config.ts; Portal: features/appointments/api.ts | `routes/appointments.ts:107` | api:integration/appointments.integration.test.ts, m:__tests__/appointmentDetail.test.tsx (+2) | Validado — testes automatizados |
| `GET /api/appointments/catalog` | App: features/appointments/config.ts; Portal: features/appointments/api.ts | `routes/appointments.ts:82` | m:__tests__/appointmentDetail.test.tsx, m:__tests__/appointmentsBooking.test.tsx (+3) | Validado — testes automatizados |
| `GET /api/appointments/slots` | App: features/appointments/config.ts (+1); Portal: features/appointments/api.ts (+1) | `routes/appointments.ts:85` | api:integration/appointments.integration.test.ts, api:integration/demoOff.integration.test.ts (+6) | Validado — testes automatizados |

### Operação da equipe ASA (painel, agenda, alunos atendidos, métricas)

Persistência: support_*, appointments, audit (operação do ASA).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/asa/agent-insights` | App: types/api.ts; Portal: features/insights/api.ts (+1) | `routes/operations.ts:59` | api:integration/knowledge.integration.test.ts, w:pages/insights/AgentInsightsPage.test.tsx | Validado — testes automatizados |
| `GET /api/asa/appointments` | App: types/api.ts; Portal: features/appointments/api.ts (+2) | `routes/appointments.ts:117` | api:integration/appointments.integration.test.ts, e2e:appointments.spec.ts (+1) | Validado — testes automatizados |
| `GET /api/asa/appointments/:id` | Portal: features/appointments/api.ts | `routes/appointments.ts:125` | api:integration/appointments.integration.test.ts, e2e:appointments.spec.ts (+1) | Validado — testes automatizados |
| `PATCH /api/asa/appointments/:id` | Portal: features/appointments/api.ts | `routes/appointments.ts:128` | api:integration/appointments.integration.test.ts, e2e:appointments.spec.ts (+1) | Validado — testes automatizados |
| `GET /api/asa/availability` | App: types/api.ts; Portal: features/appointments/api.ts (+1) | `routes/appointments.ts:132` | api:integration/appointments.integration.test.ts, w:pages/asa/appointments/AvailabilityPage.test.tsx | Validado — testes automatizados |
| `POST /api/asa/availability` | App: types/api.ts; Portal: features/appointments/api.ts (+1) | `routes/appointments.ts:136` | api:integration/appointments.integration.test.ts, w:pages/asa/appointments/AvailabilityPage.test.tsx | Validado — testes automatizados |
| `PATCH /api/asa/availability/:id` | Portal: features/appointments/api.ts | `routes/appointments.ts:139` | api:integration/appointments.integration.test.ts, w:pages/asa/appointments/AvailabilityPage.test.tsx | Validado — testes automatizados |
| `GET /api/asa/dashboard` | Portal: features/support/staff/api.ts | `routes/operations.ts:34` | api:integration/admin.integration.test.ts, api:integration/appointments.integration.test.ts (+6) | Validado — testes automatizados |
| `GET /api/asa/metrics` | App: types/api.ts; Portal: features/insights/api.ts (+1) | `routes/operations.ts:38` | api:integration/admin.integration.test.ts, api:integration/operations.integration.test.ts (+3) | Validado — testes automatizados |
| `GET /api/asa/reports/tickets.csv` | App: types/api.ts; Portal: features/insights/api.ts (+1) | `routes/operations.ts:42` | api:integration/operations.integration.test.ts, api:unit/operations.test.ts (+1) | Validado — testes automatizados |
| `GET /api/asa/students` | App: types/api.ts; Portal: features/support/staff/api.ts (+1) | `routes/operations.ts:51` | api:integration/operations.integration.test.ts, api:unit/operations.test.ts (+1) | Validado — testes automatizados |
| `GET /api/asa/students/:id` | Portal: features/support/staff/api.ts | `routes/operations.ts:55` | api:integration/operations.integration.test.ts, w:pages/asa/StudentContextPage.test.tsx | Validado — testes automatizados |

### Base de conhecimento (publicação e busca com fontes)

Persistência: knowledge_articles (migration 008).

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/knowledge-base` | App: types/api.ts; Portal: features/knowledge/api.ts (+2) | `routes/knowledge.ts:81` | api:integration/demoOff.integration.test.ts, api:integration/knowledge.integration.test.ts (+3) | Validado — testes automatizados |
| `GET /api/knowledge-base/:slug` | App: types/api.ts; Portal: features/knowledge/api.ts (+2) | `routes/knowledge.ts:89` | api:integration/demoOff.integration.test.ts, api:integration/knowledge.integration.test.ts (+3) | Validado — testes automatizados |
| `GET /api/knowledge-base/manage` | App: types/api.ts; Portal: features/knowledge/api.ts (+1) | `routes/knowledge.ts:50` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeEditorPage.test.tsx (+1) | Validado — testes automatizados |
| `POST /api/knowledge-base/manage` | App: types/api.ts; Portal: features/knowledge/api.ts (+1) | `routes/knowledge.ts:59` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeEditorPage.test.tsx (+1) | Validado — testes automatizados |
| `GET /api/knowledge-base/manage/:id` | Portal: features/knowledge/api.ts | `routes/knowledge.ts:62` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeEditorPage.test.tsx (+1) | Validado — testes automatizados |
| `PUT /api/knowledge-base/manage/:id` | Portal: features/knowledge/api.ts | `routes/knowledge.ts:65` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeEditorPage.test.tsx (+1) | Validado — testes automatizados |
| `POST /api/knowledge-base/manage/:id/archive` | — | `routes/knowledge.ts:74` | api:integration/knowledge.integration.test.ts | Validado — testes automatizados |
| `POST /api/knowledge-base/manage/:id/publish` | — | `routes/knowledge.ts:71` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeListDetail.test.tsx | Validado — testes automatizados |
| `POST /api/knowledge-base/manage/:id/restore` | — | `routes/knowledge.ts:77` | w:pages/insights/knowledge/KnowledgeListDetail.test.tsx | Validado — testes automatizados |
| `POST /api/knowledge-base/manage/:id/submit` | — | `routes/knowledge.ts:68` | api:integration/knowledge.integration.test.ts, w:pages/insights/knowledge/KnowledgeListDetail.test.tsx | Validado — testes automatizados |

### Administração (contas, SLA, automações, integrações, parâmetros)

Persistência: users, sla_policies, automation_rules/runs, settings, audit.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/admin/audit-events` | Portal: features/admin/api.ts | `routes/operations.ts:77` | api:unit/operations.test.ts, w:pages/admin/AuditPage.test.tsx | Validado — testes automatizados |
| `GET /api/admin/automations` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:113` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `POST /api/admin/automations` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:116` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `PATCH /api/admin/automations/:id` | Portal: features/admin/api.ts | `routes/admin.ts:119` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `GET /api/admin/automations/:id/runs` | Portal: features/admin/api.ts | `routes/admin.ts:122` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `GET /api/admin/health` | Portal: features/admin/api.ts | `routes/admin.ts:130` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `GET /api/admin/integrations` | Portal: features/admin/api.ts | `routes/admin.ts:127` | api:unit/admin.test.ts, w:pages/admin/IntegrationsPage.test.tsx | Validado — testes automatizados |
| `GET /api/admin/overview` | Portal: features/admin/api.ts | `routes/admin.ts:72` | api:integration/admin.integration.test.ts, w:pages/admin/AdminOverviewPage.test.tsx | Validado — testes automatizados |
| `GET /api/admin/permissions` | Portal: features/admin/api.ts | `routes/admin.ts:102` | api:unit/admin.test.ts, w:pages/admin/PermissionsPage.test.tsx | Validado — testes automatizados |
| `GET /api/admin/settings` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:133` | api:unit/admin.test.ts, w:pages/admin/settings/SettingsPage.test.tsx | Validado — testes automatizados |
| `PUT /api/admin/settings/:key` | Portal: features/admin/api.ts | `routes/admin.ts:136` | api:unit/admin.test.ts, w:pages/admin/settings/SettingsPage.test.tsx | Validado — testes automatizados |
| `GET /api/admin/sla-policies` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:107` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `PUT /api/admin/sla-policies/:categoryId` | Portal: features/admin/api.ts | `routes/admin.ts:110` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+1) | Validado — testes automatizados |
| `GET /api/admin/tickets` | Portal: features/admin/api.ts | `routes/admin.ts:139` | api:integration/admin.integration.test.ts, e2e:roles.spec.ts (+1) | Validado — testes automatizados |
| `GET /api/admin/users` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:77` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+3) | Validado — testes automatizados |
| `POST /api/admin/users` | App: types/api.ts; Portal: features/admin/api.ts (+1) | `routes/admin.ts:87` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+3) | Validado — testes automatizados |
| `GET /api/admin/users/:id` | Portal: features/admin/api.ts | `routes/admin.ts:90` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+2) | Validado — testes automatizados |
| `PATCH /api/admin/users/:id` | Portal: features/admin/api.ts | `routes/admin.ts:93` | api:integration/admin.integration.test.ts, api:unit/admin.test.ts (+2) | Validado — testes automatizados |
| `POST /api/admin/users/:id/invite` | Portal: features/admin/api.ts | `routes/admin.ts:99` | w:pages/admin/users/UsersPage.test.tsx | Validado — testes automatizados |
| `POST /api/admin/users/:id/revoke-sessions` | Portal: features/admin/api.ts | `routes/admin.ts:96` | api:unit/admin.test.ts, w:pages/admin/users/UsersPage.test.tsx | Validado — testes automatizados |

### Auditoria

Persistência: audit_events.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/audit/mine` | Portal: features/support/staff/api.ts | `routes/operations.ts:73` | api:unit/operations.test.ts, w:pages/asa/MyAuditPage.test.tsx | Validado — testes automatizados |

### Tarefas agendadas — NOVO (substituem os timers do processo residente)

Persistência: automation_runs, queue_monitor_state, job_leases.

| Endpoint | Frontend | Serviço (handler) | Teste | Resultado |
|---|---|---|---|---|
| `GET /api/internal/jobs/:job` | Vercel Cron / agendador | `routes/jobs.ts:45` | api:unit/serverless.test.ts · smoke | Validado — testes + smoke |
| `POST /api/internal/jobs/:job` | Vercel Cron / agendador | `routes/jobs.ts:46` | api:unit/serverless.test.ts · smoke | Validado — testes + smoke |

