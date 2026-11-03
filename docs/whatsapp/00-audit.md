# Auditoria inicial

Feita em 02/11/2026 no branch `feat/migracao-vercel`, antes de qualquer alteração.

## O que já existia

O prompt mestre descrevia um snapshot antigo. O checkout atual já tinha muito mais:

| Área | Prompt mestre | Checkout |
|---|---|---|
| Portal web | "se ainda não existir" | Existe: áreas aluno, Operação ASA e Administração |
| Chamados | não citados como prontos | Módulo completo: protocolo, SLA, histórico só-inserção, anexos, avaliação |
| RBAC | a mapear | Matriz em `auth/permissions.ts`, com `requirePermission` |
| Migrations | 001 a 003 | 001 a 016 |
| Hospedagem | Docker | Produção em funções serverless na Vercel |
| Pastas | `src/Entrega 2/` | `src/Entrega_2/` |

A hospedagem serverless pesou em várias decisões: não há processo residente para Socket.IO, e o gateway Baileys não pode rodar ali.

## Baseline

Todos verdes antes da primeira alteração:

| Pacote | Lint | Tipos | Testes |
|---|---|---|---|
| API | 0 erros | ok | 354 unitários, 53 de integração (PostgreSQL 16 real) |
| Portal | 0 erros | ok | 283 |
| App | 0 erros, 10 avisos | ok | 564 |
| Contratos | | | 3 cópias sincronizadas |

Um teste existente (`admin.integration`) falhava só entre 21h e 24h no horário de Brasília, porque montava a data em UTC. Foi corrigido.

## Matriz de decisão

| Conceito do prompt | Decisão | Onde |
|---|---|---|
| `support_tickets` | **Adaptar:** estudante opcional, canal `whatsapp`, conversa, sequência | migration 017 |
| `support_ticket_events` | **Preservar** como histórico; o log de tempo real é separado | migration 004 |
| `support_messages` | **Adaptar** `support_ticket_messages`: transporte, entrega, visibilidade | migration 017 |
| `support_attachments` | **Adaptar:** origem, visibilidade, análise | migration 017 |
| `support_internal_notes` | **Reutilizar:** eventos `internal_note` | migration 004 |
| `support_assignments` | **Reutilizar:** eventos `ticket_assigned` e `department_forwarded` | migration 004 |
| `support_queues` | **Reutilizar:** equipes do catálogo | `support/catalog.ts` |
| `support_sla_policies`, `support_business_calendars` | **Reutilizar:** metas da administração | migration 009 |
| `support_audit_logs` | **Reutilizar:** `audit_events` | migration 006 |
| Canais, conexões, conversas, vínculos, consentimentos, inbox, outbox, etiquetas, modelos | **Implementar** | migration 017 |
| `support_read_cursors` | **Não implementado:** a leitura continua compartilhada pela equipe | ver plano |
| Socket.IO | **Descartar:** incompatível com funções serverless; long polling por cursor | `support/realtime` |
| Painel e banco do WA-AKG | **Descartar:** só o protocolo, por adapter | `support/whatsapp/providers` |
| Anti-ban do WA-AKG | **Descartar** | [integration-wa-akg.md](integration-wa-akg.md) |
| Fila com Redis/BullMQ | **Descartar:** outbox SQL com `skip locked` basta nesta escala | `support/whatsapp/outboxWorker.ts` |

## Bloqueios encontrados

Não podem ser resolvidos por código:

- Sem autorização formal de um número institucional.
- Sem credenciais da Cloud API.
- Sem base legal e política de retenção aprovadas para o tratamento no WhatsApp.
- Sem host persistente para o gateway fora da Vercel.

## Mudanças que afetam quem já usa o sistema

- Chamado de outro aluno agora responde **404, não 403** (o prompt pede para não revelar a existência). Testes atualizados.
- `SupportStaffTicket.student` passou a poder ser `null`; as telas da equipe tratam esse caso.
- `STAFF_TRANSITIONS` tornou explícitas as transições de situação. Nenhum caminho antes válido foi removido.
