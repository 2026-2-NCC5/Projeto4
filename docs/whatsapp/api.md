# API

Rotas sob a API existente. Respostas no envelope `{ data, meta }`. Tipos em `Backend/contracts/api/mobile-api.v1.ts` (v1.9). Resumo em [openapi.yaml](openapi.yaml).

Decisão de versionamento: o projeto usa `/api/support/*`, então o prefixo `/api/v1/support` sugerido no prompt não foi adotado.

## Equipe

| Rota | Permissão | Uso |
|---|---|---|
| `GET /api/support/staff/events?since=&wait=` | `tickets:read:any` | Feed em tempo real |
| `GET /api/support/staff/inbox/counts` | `tickets:read:any` | Contadores das filas |
| `GET /api/support/staff/tickets?channel=&unidentified=1&tag=` | `tickets:read:any` | Fila (filtros novos) |
| `GET /api/support/staff/whatsapp/status` | `tickets:read:any` | Estado real do canal |
| `GET /api/support/staff/whatsapp/metrics?from=&to=` | `metrics:read` | Indicadores |
| `POST /api/support/staff/tickets/:id/messages` | `tickets:manage` | `transport: "whatsapp"` responde 202 |
| `POST /api/support/staff/tickets/:id/messages/:messageId/retry` | `tickets:manage` | Nova tentativa |
| `POST /api/support/staff/tickets/:id/transfer` | `tickets:manage` | Transferência com motivo |
| `POST /api/support/staff/tickets/:id/reopen` | `tickets:manage` | Reabertura com motivo |
| `PUT /api/support/staff/tickets/:id/tags` | `tickets:manage` | Etiquetas |
| `PATCH /api/support/staff/tickets/:id/attachments/:attachmentId` | `tickets:manage` | Análise e liberação |
| `POST /api/support/staff/tickets/:id/presence` | `tickets:read:any` | Quem mais está no chamado |
| `GET /api/support/staff/tags` | `tickets:read:any` | Etiquetas existentes |
| `GET, POST /api/support/staff/saved-replies` | `tickets:read:any`, `tickets:manage` | Modelos |
| `POST /api/support/staff/saved-replies/:id/status` | `kb:publish` | Aprovar ou arquivar |

## Estudante

| Rota | Uso |
|---|---|
| `GET /api/support/me/events?since=&wait=` | Feed só dos próprios chamados |
| `GET /api/support/me/whatsapp` | Vínculos e pedido em aberto |
| `POST /api/support/me/whatsapp/verifications` | Começa a vinculação (exige aceite) |
| `GET /api/support/me/whatsapp/verifications/:id` | Situação do pedido |
| `POST /api/support/me/whatsapp/verifications/:id/confirm` | Confirma |
| `DELETE /api/support/me/whatsapp/links/:id` | Revoga |

Todas exigem `tickets:read:own`. O estudante vem sempre da sessão.

## Administração (`support_channels:manage`)

| Rota | Uso |
|---|---|
| `GET, POST /api/admin/support/channels` | Lista e cria |
| `PATCH /api/admin/support/channels/:id` | Equipe, situação, número, autorização |
| `GET /api/admin/support/channels/:id/status` | Estado lido do provedor agora |
| `POST /api/admin/support/channels/:id/connect` | Inicia conexão; é a única resposta com QR |
| `DELETE /api/admin/support/channels/:id/connection` | Desconecta, preservando chamados |
| `GET /api/admin/support/provider-health` | Fila, inbox, atraso |
| `POST /api/admin/support/inbox/replay` | Devolve ao processamento o que esgotou as tentativas |
| `GET /api/admin/support/contact-reviews` | Conflitos de vínculo |
| `POST /api/admin/support/contact-reviews/:id/decision` | Decide |

Simulador, só com provedor `fake` fora de produção: `POST /api/admin/support/simulator/{inbound,delivery,connection,next-send}`.

## Webhooks

Autenticados pela assinatura do provedor, nunca por sessão. Corpo lido cru, limite de 3 MB.

| Rota | Autenticação |
|---|---|
| `POST /api/internal/webhooks/wa-akg/:channelId` | `X-Webhook-Signature` + `timestamp` de até 5 min |
| `GET /api/internal/webhooks/meta` | `hub.verify_token` |
| `POST /api/internal/webhooks/meta` | `X-Hub-Signature-256` |
| `POST /api/internal/webhooks/fake/:channelId` | Assinatura própria |

Respostas: 200 com evento já guardado; 401 assinatura inválida; 400 formato inválido; 404 canal desconhecido.

## Tarefas (`Authorization: Bearer $CRON_SECRET`)

`/api/internal/jobs/support-outbox`, `support-channel-health`, `support-whatsapp-reconcile`, `support-maintenance`.

## Erros de negócio

`error.reason` em respostas 409:

| Motivo | Significado |
|---|---|
| `channel_disconnected`, `channel_paused`, `provider_unavailable`, `outbound_disabled` | Canal não aceita envio; nada foi enfileirado |
| `template_required` | Janela de 24 horas encerrada |
| `consent_required` | A pessoa pediu para parar |
| `assigned_to_other` | Exige `overrideAssignee: true` |
| `delivery_unknown` | Exige `confirmDuplicateRisk: true` |
| `no_whatsapp_conversation` | Chamado sem conversa |
| `ticket_changed` | Outra pessoa alterou antes |
| `invalid_transition` | Mudança de situação não permitida |
| `student_not_linked` | Liberar arquivo ou responder no chat do app exige vínculo |
| `conversation_has_open_ticket` | A conversa já tem outro chamado aberto |
| `authorization_required` | Falta a referência da autorização do número |
| `session_management_disabled` | Conexão pelo portal desligada |

## Exemplos (provedor fake)

```bash
API=http://localhost:3000
TOKEN=$(curl -s $API/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin.plataforma@demo.asa","password":"<senha de demonstração>"}' | jq -r .data.accessToken)
CHANNEL=$(curl -s $API/api/admin/support/channels -H "authorization: Bearer $TOKEN" | jq -r '.data.items[0].id')

# conclui a conexão simulada
curl -s $API/api/admin/support/simulator/connection -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"channelId\":\"$CHANNEL\",\"status\":\"CONNECTED\"}"

# recebe uma mensagem; repetir o mesmo providerEventId devolve duplicates: 1
curl -s $API/api/admin/support/simulator/inbound -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"channelId\":\"$CHANNEL\",\"from\":\"+99900001234\",\"text\":\"Olá\",\"providerEventId\":\"exemplo-1\"}"
```

Feed: a primeira chamada, sem `since`, devolve só o cursor; as seguintes esperam eventos.

```bash
CURSOR=$(curl -s "$API/api/support/me/events" -H "authorization: Bearer $STUDENT" | jq -r .data.nextCursor)
curl -s "$API/api/support/me/events?since=$CURSOR&wait=25" -H "authorization: Bearer $STUDENT"
```

Envelope de evento:

```json
{
  "schemaVersion": "1.0",
  "eventId": "6c1f...",
  "correlationId": null,
  "ticketId": "ticket-1a2b...",
  "sequence": 12,
  "type": "support.ticket.status_changed",
  "occurredAt": "2026-11-02T18:00:00.000Z",
  "actor": { "type": "agent" },
  "audience": "STUDENT_VISIBLE",
  "data": { "title": "Atendimento em andamento", "from": "triage", "to": "in_progress", "publicLabel": "Em atendimento" }
}
```

Dos tipos canônicos do prompt, `support.queue.updated`, `support.sla.warning`, `support.sla.breached` e `support.message.read_cursor_changed` **não são emitidos**.
