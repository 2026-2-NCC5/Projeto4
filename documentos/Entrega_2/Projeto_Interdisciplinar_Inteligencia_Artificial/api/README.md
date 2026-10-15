# API principal — referência (v1)

Base URL local: `http://localhost:3000`. Todas as respostas são JSON.

> **Rotas da plataforma (v1.5–v1.8):** portal web, sessões, avisos, agendamentos, base de conhecimento,
> operação do ASA e administração estão em
> [../plataforma/API_CONTRACTS.md](../plataforma/API_CONTRACTS.md), com a permissão exigida por rota em
> [../plataforma/ROLE_PERMISSION_MATRIX.md](../plataforma/ROLE_PERMISSION_MATRIX.md).

## Envelopes

```jsonc
// sucesso
{ "data": { ... }, "meta": { "requestId": "req-…", "correlationId": "corr-…" } }
// erro
{ "error": { "code": "TIMEOUT", "message": "…", "reason?": "…", "details?": [{ "field": "…", "message": "…" }], "requestId": "req-…", "correlationId": "corr-…" } }
```

Headers: envie `x-correlation-id` (opcional; gerado quando ausente) e `Authorization: Bearer <accessToken>`.
A resposta sempre devolve `x-request-id` e `x-correlation-id`.

## Endpoints

| Método | Rota | Auth | Resposta (`data`) |
| --- | --- | --- | --- |
| GET | `/health` | — | `HealthStatus` (`503` quando banco ou agente estão fora) |
| GET | `/api/auth/policy` | — | `AuthPolicy` (senha, domínios, RA, código, sessão, biometria) |
| GET | `/api/auth/programs` | — | `ProgramOption[]` |
| POST | `/api/auth/login` `{email, password, rememberMe?}` | — | `AuthSession` |
| POST | `/api/auth/register` `RegisterRequest` | — | `AuthSession` (`201`) |
| POST | `/api/auth/refresh` `{refreshToken}` | — | `AuthSession` (rotaciona o refresh token, mantém `rememberMe`) |
| POST | `/api/auth/logout` `{refreshToken?}` | opcional | `204` |
| POST | `/api/auth/forgot-password` `{email}` | — | `ForgotPasswordResponse` (`202`, sempre igual) |
| POST | `/api/auth/resend-reset-code` `{email}` | — | `ForgotPasswordResponse` (`202`) |
| POST | `/api/auth/verify-reset-code` `{email, code}` | — | `VerifyResetCodeResponse` |
| POST | `/api/auth/reset-password` `{resetToken, newPassword}` | — | `ResetPasswordResponse` |
| POST | `/api/auth/biometric/enroll` `{deviceLabel?}` | Bearer | `BiometricEnrollResponse` (`201`) |
| POST | `/api/auth/biometric/login` `{credentialId, credential}` | — | `AuthSession` |
| POST | `/api/auth/biometric/revoke` `{credentialId}` | Bearer | `204` |
| GET | `/api/student/me` | Bearer | `StudentProfile` |
| GET | `/api/student/summary` | Bearer (estudante) | `StudentSummary` |
| GET | `/api/student/subjects` | Bearer (estudante) | `StudentSubject[]` |
| GET | `/api/student/assessments` | Bearer (estudante) | `StudentAssessment[]` |
| GET | `/api/student/attendance` | Bearer (estudante) | `StudentAttendance[]` |
| GET | `/api/student/pending-items` | Bearer (estudante) | `StudentPendingItem[]` |
| POST | `/api/agent/analyze` `{}` | Bearer (estudante) | `AgentAnalysis` (`201`) |
| GET | `/api/agent/recommendations` | Bearer (estudante) | `AgentAnalysis \| null` (última análise) |
| GET | `/api/agent/recommendations/:id` | Bearer (estudante) | `AgentRecommendationDetail` |
| GET | `/api/agent/history?limit=20` | Bearer (estudante) | `AgentHistoryItem[]` |
| GET | `/api/agent/history/:runId` | Bearer (estudante) | `AgentAnalysis` |
| POST | `/api/assistant/message` | Bearer (estudante) | `AssistantResponse` |
| — | `/api/support/*` | Bearer | Atendimento ASA (chamados) — ver [seção abaixo](#atendimento-asa-chamados) |
| — | `/api/queue/*`, `/api/notifications/push-token`, `/health/queue` | Bearer (saúde: pública) | Fila presencial do ASA — ver [architecture/queue-presencial.md](../architecture/queue-presencial.md#api) |

Tipos: `src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts`.

## Regras de autorização

- A identidade do estudante vem exclusivamente do JWT (`sub` → `students.user_id`).
- `student_id` no corpo de `/api/agent/analyze` é rejeitado com `400 VALIDATION_ERROR`.
- Recurso de outro estudante → `403 FORBIDDEN`. Perfil não-estudante em rota de estudante → `403`.
- Access token: HS256, 15 min (`JWT_EXPIRES_IN`), `iss=asa-conecta-api`, `aud=asa-conecta-mobile`, vinculado a uma sessão revogável (`sid`).
- Refresh token: aleatório (48 bytes), armazenado apenas como SHA-256 em `refresh_sessions`, rotacionado a cada uso, TTL `REFRESH_TOKEN_TTL_DAYS`.

## Códigos de erro

`VALIDATION_ERROR` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 ·
`RATE_LIMITED` 429 (`retryAfterSeconds` + header `Retry-After`) · `INTERNAL_ERROR` 500 ·
`CONTRACT_ERROR` 502 · `DEPENDENCY_ERROR` 503 · `TIMEOUT` 504.

`reason` estável (`AuthErrorReason` no contrato): `invalid_credentials`, `account_disabled`,
`too_many_attempts`, `rate_limited`, `missing_token`, `token_invalid`, `token_expired`,
`session_revoked`, `session_expired`, `account_exists`, `email_domain_not_allowed`,
`invalid_registration_number`, `unknown_program`, `weak_password` (com `details` por requisito),
`code_invalid` (com `attemptsRemaining`), `code_expired`, `code_locked`, `reset_token_invalid`,
`recovery_unavailable`, `biometric_credential_invalid`.

Controles de segurança e fluxos: [`architecture/authentication.md`](../architecture/authentication.md).

## Exemplo com curl

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"estudante.exemplo@demo.asa","password":"Demo@2026"}' | jq -r .data.accessToken)

curl -s -X POST localhost:3000/api/agent/analyze \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H 'x-correlation-id: corr-manual-001' -d '{}' | jq .
```

## Assistente conversacional (voz/texto)

`POST /api/assistant/message` — mesmo endpoint para fala transcrita e texto digitado.

```jsonc
// requisição (campos extras, como studentId, → 400)
{
  "inputType": "voice",                       // "voice" | "text"
  "text": "Tenho alguma atividade pendente essa semana?",   // 1–500 caracteres
  "conversationContext": { "lastIntent": "get_attendance", "lastSubjectId": "subject-demo-002" },
  "clientMetrics": { "speechRecognitionMs": 1400 }
}
```

```jsonc
// resposta (data)
{
  "interactionId": "int-…", "requestId": "req-…", "correlationId": "corr-…",
  "inputType": "voice", "intent": "get_pending_items", "intentConfidence": 0.92,
  "entities": { "period": "this_week" },
  "status": "success",
  "display": { "title": "Atividades pendentes", "message": "Você tem 1 atividade pendente nesta semana. …", "items": [ … ], "recommendations": [] },
  "speech": { "text": "Você tem uma atividade pendente nesta semana. …" },
  "nextActions": [{ "type": "navigate", "label": "Ver pendências", "target": "academic.pending" }],
  "clientCommand": null, "requiresHumanValidation": false, "abstained": false, "abstentionReason": null,
  "runId": null, "context": { "lastIntent": "get_pending_items" }, "createdAt": "…"
}
```

`status`: `success`, `empty`, `not_found`, `needs_clarification`, `abstained`, `human_validation`,
`refused`. Erros: `400` corpo inválido, `401`, `403` (perfil não estudante), `404` assistente
desabilitado (`VOICE_ASSISTANT_ENABLED=false`), `503`/`504`/`502` quando a pergunta exige o Agente
e ele falha. Intenções e regras: [`architecture/voice-assistant.md`](../architecture/voice-assistant.md).

```bash
curl -s -X POST localhost:3000/api/assistant/message \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"inputType":"text","text":"Tem alguma matéria que merece atenção?"}' | jq .data.display
```

### v1.2 — contexto da tela e navegação por intenção

Adições compatíveis ao mesmo endpoint (`src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts`):

| Campo | Direção | Descrição |
| --- | --- | --- |
| `currentScreen?: AssistantScreenContext` | requisição | tela visível no app (`home`, `academic.assessments`, `academic.attendance`, `academic.pending`, `academic.subjects`, `assistant`, `services`, `history`, `profile`, `recommendation`, `run`). Só desambigua perguntas curtas ("qual foi a menor?"); nunca define identidade nem autorização. Valor fora da allow-list → `400`. |
| `intent: 'open_screen'` + `entities.screen` | resposta | "Abre minhas notas", "vai para as pendências" → o app navega. Intenção de controle: não altera `context`. |
| `navigation?: { target, params? }` | resposta | destino da allow-list (`AssistantNavigationTarget`, agora com `assistant` e `services`) que o app executa após mostrar/falar a resposta curta ("Claro. Abrindo suas avaliações e notas."). |

```bash
curl -s -X POST localhost:3000/api/assistant/message \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"inputType":"voice","text":"Abre minha frequência","currentScreen":"home"}'
# → { "intent": "open_screen", "navigation": { "target": "academic.attendance" }, "speech": { "text": "Claro. Abrindo sua frequência." }, ... }
```

## Atendimento ASA (chamados)

Contrato v1.3 (`Support*` em `mobile-api.v1.ts`). Arquitetura e regras: [architecture/support-tickets.md](../architecture/support-tickets.md) · [ADR-006](../adr/ADR-006-support-tickets.md).

| Método | Rota | Auth | Resposta (`data`) |
| --- | --- | --- | --- |
| GET | `/api/support/catalog` | Bearer | `SupportCatalog` (categorias, artigos da Central de ajuda, limites) |
| GET | `/api/support/overview` | Bearer (estudante) | `SupportOverview` (contagens + um chamado em destaque para a Home) |
| GET | `/api/support/tickets?status=a,b&search=&limit=20&cursor=` | Bearer (estudante) | `SupportTicketList` (paginação por cursor; busca por protocolo, assunto e categoria, sem acento) |
| POST | `/api/support/tickets` `SupportTicketCreateRequest` | Bearer (estudante) | `SupportTicket` (`201`; `200` com o mesmo `clientRequestId`) |
| GET | `/api/support/tickets/:id` | Bearer (estudante) | `SupportTicket` (eventos públicos, mensagens, arquivos, prazo, permissões) |
| GET | `/api/support/tickets/:id/events` | Bearer (estudante) | `SupportTicketEvent[]` |
| POST | `/api/support/tickets/:id/messages` `{clientMessageId, content, attachmentIds?}` | Bearer (estudante) | `SupportTicket` (`201`; responde a `waiting_student` e retoma o prazo) |
| POST | `/api/support/tickets/:id/read` | Bearer (estudante) | `SupportTicket` (marca mensagens e avisos do chamado como lidos) |
| POST | `/api/support/tickets/:id/cancel` `{reason?}` | Bearer (estudante) | `SupportTicket` (`409 cancel_not_allowed` se finalizado) |
| POST | `/api/support/tickets/:id/reopen` `{reason}` | Bearer (estudante) | `SupportTicket` (só `resolved`, até 7 dias; `409 reopen_not_allowed`) |
| POST | `/api/support/tickets/:id/rating` `{rating 1–5, comment?}` | Bearer (estudante) | `SupportTicket` (`201`; `409 already_rated`) |
| GET | `/api/support/tickets/:id/attachments/:attachmentId/link` | Bearer (estudante) | `SupportAttachmentLink` (URL assinada, 5 min) |
| GET | `/api/support/files/:attachmentId?exp=&sig=` | link assinado | arquivo (`Content-Type` original, `Cache-Control: private, no-store`) |
| POST | `/api/support/uploads` `{name, mimeType, contentBase64}` | Bearer (estudante) | `SupportUpload` (`201`; PDF/imagem/DOC/TXT até 5 MB; conteúdo conferido) |
| DELETE | `/api/support/uploads/:uploadId` | Bearer (estudante) | `204` (só envio pendente do próprio usuário) |
| GET | `/api/support/notifications?limit=20` | Bearer (estudante) | `SupportNotificationList` |
| POST | `/api/support/notifications/read` `{ids?}` | Bearer (estudante) | `SupportNotificationList` (sem `ids`: todos) |

Equipe (`institutional_staff`, `technical_admin`):

| Método | Rota | Corpo | Efeito |
| --- | --- | --- | --- |
| GET | `/api/support/staff/tickets` / `:id` | — | fila de todos os estudantes / detalhe com eventos internos e o estudante |
| POST | `/api/support/staff/tickets/:id/status` | `{status, publicNote?}` | `triage`, `assigned`, `in_analysis`, `in_progress`, `waiting_department`, `waiting_external`, `closed`, `cancelled` |
| POST | `/api/support/staff/tickets/:id/assign` | `{team, publicNote?}` | encaminha para uma equipe da lista |
| POST | `/api/support/staff/tickets/:id/messages` | `{content, attachmentIds?, requestAction?}` | mensagem; com `requestAction` → `waiting_student` (prazo pausado) |
| POST | `/api/support/staff/tickets/:id/notes` | `{content}` | nota interna (nunca vista pelo estudante) |
| POST | `/api/support/staff/tickets/:id/priority` | `{priority}` | `normal`, `high`, `urgent` (evento interno) |
| POST | `/api/support/staff/tickets/:id/resolve` | `{resolution}` | `resolved` + aviso ao estudante |
| POST / DELETE | `/api/support/staff/uploads` / `:uploadId` | como o do estudante | arquivos enviados pela equipe |

Regras: corpos estritos (`studentId`, `status`, `priority` no corpo do estudante → `400`); chamado de outro
estudante → `403`; alteração concorrente → `409 ticket_changed`; erros com mensagem em português pronta para o
app (`Conte um pouco mais sobre sua solicitação.`, `O arquivo é maior que 5 MB.`...).

## Agent Service (interno)

`POST /internal/v1/student-agent/evaluate` — contrato `src/Entrega_2/Backend/contracts/agent/student-agent-request.v1.json` →
`student-agent-response.v1.json`. `GET /health`, `GET /internal/v1/student-agent/config`, docs em `/internal/docs`.
Não deve ser exposto ao aplicativo.
