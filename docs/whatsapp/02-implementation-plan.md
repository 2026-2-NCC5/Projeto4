# Plano e situação

**Legenda:** ✅ implementado e testado · 🟡 parcial · 🔒 bloqueado por dependência externa · ⬜ não iniciado

> "✅" significa testado com o provedor de demonstração ou com respostas simuladas. **Nenhum item foi exercitado contra o WhatsApp real.** O que depende disso está marcado como 🔒.

## Fases

| Fase | Situação | Entregável pedido | Como foi verificado |
|---|---|---|---|
| 0. Descoberta e baseline | ✅ | Auditoria, baseline, ADR de provedor | [00-audit.md](00-audit.md), [provider-risk-assessment.md](provider-risk-assessment.md) |
| 1. Domínio e banco | ✅ | CRUD protegido, transições, auditoria | Integração com PostgreSQL |
| 2. Eventos em tempo real | ✅ | Mudança da equipe chega sem atualizar, e é recuperável | Integração e E2E (long polling + replay) |
| 3. Portal operacional | ✅ | Atendente resolve sem sair da tela | Testes de componente e E2E no navegador |
| 4. Mobile | ✅ | Estudante vê só o que é dele, com evento real | Testes de componente e app em Expo Web contra API real; **sem aparelho real** |
| 5. WhatsApp por provedor | 🟡 | Fluxo fake completo ✅; WA-AKG e Meta só contra simulação; mensagem real 🔒 | Unitários de contrato e integração |
| 6. Segurança e compliance | 🟡 | Testes negativos ✅; análise institucional 🔒 | [security-lgpd.md](security-lgpd.md) |
| 7. Operação e qualidade | 🟡 | Métricas, fila, logs ✅; dashboards externos e teste de carga ⬜ | [runbook.md](runbook.md) |
| 8. Evoluções opcionais | ⬜ | Só com flag e política | Fora desta entrega |

## Rastreabilidade: requisito → rota → tela → teste

Arquivos de teste: **I** = `api/test/integration/whatsapp.integration.test.ts`, **U** = `api/test/unit/whatsapp.test.ts`, **W** = `Web/src/pages/asa/SupportCentralPage.test.tsx`, **A** = `Web/src/pages/admin/WhatsAppChannelPage.test.tsx`, **E** = `Web/e2e/whatsapp-central.spec.ts`.

| Requisito | Rota | Tela | Teste | Situação |
|---|---|---|---|---|
| Inbox unificada, filtros, busca | `GET /staff/tickets`, `/staff/inbox/counts` | `InboxPanel` | W, E | ✅ |
| Três painéis, redimensionáveis por teclado | | `ResizablePanels` | W, E | ✅ |
| Layout salvo por usuário, sem dados sensíveis | | `usePanelLayout` | W | ✅ |
| Tela pequena: navegação sequencial | | `SupportCentralPage` | E | ✅ |
| Chamado de WhatsApp sem vínculo fica só com a equipe | webhooks | | I, E | ✅ |
| Não cria estudante a partir de número | | | I | ✅ |
| Webhook duplicado sem efeito | `support_inbox_dedup` | | I, E | ✅ |
| Mensagens concorrentes: um chamado, nada perdido | | | I | ✅ |
| Fora de ordem | | | I, U | ✅ |
| Tipo não suportado não é descartado | | | I, U | ✅ |
| Resposta por outbox, 202, sem falsa entrega | `POST /staff/tickets/:id/messages` | `ConversationPanel` | I, W, E | ✅ |
| Timeout vira `unknown`, sem reenvio cego | `.../retry` | `ConversationPanel` | I, W, U | ✅ |
| Reinício do processo preserva a fila | | | I | ✅ |
| Canal fora do ar: estado real, nada entregue | `/staff/whatsapp/status` | `ChannelIndicator` | I, W, E | ✅ |
| Disjuntor e espera crescente | | | I, U | ✅ |
| Status do chamado separado do status de entrega | | | I, E | ✅ |
| Transições explícitas | `/status` | `TicketActions` | I, U | ✅ |
| Concorrência: duas pessoas | `expectedVersion` | `ConflictNotice` | I, W | ✅ |
| Presença e aviso de outra pessoa | `/presence` | `ConversationPanel` | I, W | ✅ |
| Transferência e reabertura com motivo | `/transfer`, `/reopen` | `ContextPanel` | I | ✅ |
| Etiquetas, modelos aprovados | `/tags`, `/saved-replies` | `ContextPanel`, composer | I, W | ✅ |
| Notas internas invisíveis ao aluno | `/notes` | `ConversationPanel` | I, W, E | ✅ |
| Prévia segura com chat aberto | `/attachments/:id/link` | `DocumentPreview`, `PdfCanvas` | W, E | ✅ |
| Arquivo: análise, liberação, auditoria de acesso | `PATCH /attachments/:id` | `ContextPanel` | I | ✅ |
| Contexto do aluno com auditoria; "Indisponível" sem vínculo | `/api/asa/students/:id` | `ContextPanel` | W, E | ✅ |
| Tempo real com replay por cursor | `/staff/events`, `/me/events` | `useSupportRealtime` | I, W, E | ✅ |
| Evento de transação lenta não se perde | | | I | ✅ |
| Aluno A × aluno B: REST, feed e anexo | | | I, E | ✅ |
| Número que muda de dono: nada passa de um para o outro | | | I | ✅ |
| Vínculo verificado, conflito sem revelar nada | `/me/whatsapp/*` | app + `ReviewsSection` | I, A, E | ✅ |
| Consentimento e revogação | | app | I | ✅ |
| Pedido para parar | | | I | ✅ |
| QR só para a administração | `/admin/support/channels/:id/connect` | `WhatsAppChannelPage` | I, A, E | ✅ |
| Administração não lê conversas | | | I, E | ✅ |
| Autorização antes de conectar número real | | `ChannelCard` | A | ✅ |
| Saúde e métricas de eventos reais | `/provider-health`, `/metrics` | `HealthSection`, `MetricsPage` | I | ✅ |
| Simulador só fora de produção | `/simulator/*` | `Simulator` | I, U, A | ✅ |
| Contrato WA-AKG | | | U | ✅ só simulado |
| Contrato Cloud API, handshake, janela de 24 h | `/webhooks/meta` | | U | ✅ só simulado |
| Mensagem real do número de teste institucional | | | | 🔒 |
| Espelhamento no app, só com autorização | `ASA_SUPPORT_MIRROR_WHATSAPP_TO_APP` | app | I | ✅ desligado por padrão |
| Rollback | `database/rollback/017` | | I | ✅ em transação |

## O que ficou de fora

| Item do prompt | Situação | Observação |
|---|---|---|
| Enviar anexo pelo WhatsApp | ⬜ | A API recusa com erro claro (`whatsapp_attachments_unsupported`); use o chat do app |
| Enviar modelo aprovado (template) | 🔒⬜ | Depende de credenciamento; fora da janela o envio é bloqueado com a explicação certa |
| Conector JEV, n8n, IA assistida, autoatribuição | ⬜ | Fase 8, opcional |
| Assistente: "como está meu atendimento?" | ⬜ | Fase 8, opcional. Não há ferramenta `getMySupportTickets` |
| Rascunhos por IA | ⬜ | Fase 8. Nenhuma conversa vai para modelo de IA |
| Vários números ou canais simultâneos | ⬜ | MVP: um canal ativo por provedor |
| `support_read_cursors` (não lidos por pessoa) | ⬜ | A leitura é compartilhada pela equipe |
| Paginação e virtualização da conversa | ⬜ | Inbox paginada; a conversa carrega inteira |
| Escopo de fila por usuário | ⬜ | Sistema não tem equipes por usuário; a equipe vê tudo |
| Papel de supervisor separado | ⬜ | Mapeado em `institutional_staff` |
| Eventos de SLA e fila no feed | ⬜ | SLA continua pelas automações existentes |
| Expurgo de mensagens e arquivos | ⬜ | Depende de política ([security-lgpd.md](security-lgpd.md)) |
| Antivírus e quarentena | ⬜ | Sem scanner disponível no ambiente |
| Armazenamento em objeto | ⬜ | Anexos seguem em `bytea`, limite de 5 MB (3 MB na Vercel) |
| Web do aluno: tela de vínculo | ⬜ | Vínculo só no app |
| Teste em aparelho físico | ⬜ | O app foi exercitado em Expo Web, não em iOS ou Android |
| Notificações locais novas | ⬜ | Usa o push e o centro de avisos existentes |
| Dashboards externos, carga, SBOM | ⬜ | |

Comportamentos a conhecer:

- Quem vincula sem autorizar chamados anteriores continua sem ver a conversa em aberto, e novas mensagens entram nesse mesmo chamado, como "contato", até ele ser encerrado. Foi a leitura mais conservadora do requisito de autorização explícita.
- Revogar o vínculo tira o WhatsApp dos chamados do estudante: a equipe passa a responder só pelo chat do app.

## Commits

Nada foi commitado. Por pedido anterior do projeto, a separação por autor e a mensagem de cada commit são apresentadas para aprovação antes.

Sugestão de separação, com branch `feat/asa-whatsapp-support-center`:

1. `feat(support): evolui chamados para WhatsApp` (migration 017, rollback, contrato, tipos, repositórios)
2. `feat(support): feed de eventos com cursor pela ordem de commit`
3. `feat(support): provedores, ingestão, outbox e vínculo verificado` (com testes)
4. `feat(web): Central de Atendimento e canal WhatsApp` (com `pdfjs-dist`)
5. `feat(mobile): acompanhamento ao vivo e vínculo do WhatsApp`
6. `docs: Central de Atendimento WhatsApp`

O working tree tem alterações de outras frentes (fila presencial, `guards.tsx`, etc.) que devem ficar fora desses commits. `docker-compose.yml` e `.env.example` têm trechos das duas frentes, e precisam de `git add -p`.
