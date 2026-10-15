# Atendimento ASA — chamados

Abertura e acompanhamento de solicitações do estudante ao ASA. Decisões em
[ADR-006](../adr/ADR-006-support-tickets.md); rotas em [api/README.md](../api/README.md#atendimento-asa-chamados).

## Fluxo

```text
Estudante                         API (/api/support)                       Equipe (/api/support/staff)
─────────                         ──────────────────                       ───────────────────────────
Abrir chamado (4 etapas)  ──►  submitted → received (automático)
  anexos já enviados              protocolo ASA-AAAA-NNNNN, prazo, aviso
Acompanhar (lista/detalhe) ◄──  eventos públicos, mensagens, arquivos  ◄──  triagem, encaminhamento,
  polling 30 s / 60 s                                                       análise, notas internas
Responder / enviar arquivo ──►  waiting_student → in_analysis          ◄──  pedido de ação (pausa o prazo)
                                 (prazo retomado e estendido)
Ver solução / avaliar      ◄──  resolved (prazo concluído)             ◄──  resolução com texto
"Ainda preciso de ajuda"   ──►  reopened (até 7 dias; novo prazo)
Cancelar (com confirmação) ──►  cancelled (histórico preservado)
```

## Situações e etapas

| Situação | Texto no app | Etapa visível |
| --- | --- | --- |
| `submitted` | Enviado | Envio da solicitação |
| `received` | Recebido pelo ASA | Triagem (atual) |
| `triage` | Em triagem | Triagem (atual) |
| `assigned` | Encaminhado para a equipe responsável | Análise |
| `in_analysis` | Em análise | Análise |
| `in_progress` | Em atendimento | Análise |
| `waiting_student` | Aguardando você | Análise (prazo pausado) |
| `waiting_department` / `waiting_external` | Aguardando setor / retorno externo | Análise |
| `reopened` | Reaberto | Análise |
| `resolved` / `closed` | Resolvido / Encerrado | Resolução (concluída) |
| `cancelled` | Cancelado | até onde chegou + "Chamado cancelado" |

## Dados (migration 004)

| Tabela | Conteúdo |
| --- | --- |
| `support_tickets` | protocolo, estudante, categoria/tipo, assunto, descrição, situação, prioridade, equipe, ação pendente, resolução, prazo (`sla_*`), `version`, chave de idempotência |
| `support_ticket_events` | histórico somente-inserção (público/interno, autor interno + nome público, de/para, detalhes) |
| `support_ticket_messages` | conversa (estudante/equipe), lida em, chave de idempotência |
| `support_attachments` | metadados + conteúdo (`bytea`, ≤ 5 MB); pendentes expiram em 24 h |
| `support_ticket_ratings` | uma avaliação por chamado (1–5 + comentário) |
| `support_notifications` | avisos do app (também payload do push) |

## Código

```text
Backend/api/src/support/        catalog (categorias, equipes, artigos, limites), sla, statuses,
                                attachments (validação, links assinados), mappers, supportService (estudante),
                                supportStaffService (equipe), types (registros + SupportRepository)
Backend/api/src/repositories/pgSupportRepository.ts · routes/support.ts · controllers/supportController.ts
Frontend/features/support/      api (http + demonstração), hooks (cache SWR, lista paginada, detalhe,
                                ações otimistas, abertura com rascunho, envios), labels, progress, format, motion
Frontend/components/tickets/    StatusBadge, FilterChips, SearchField, StepIndicator, SelectRow, TicketRow,
                                TicketSummaryCard, TicketProgress, TicketTimeline, TicketMessages,
                                TicketComposer, AttachmentItems, TicketStatusCards, TicketRating,
                                BottomSheet, AnimatedCheck, Appear, SupportNotice, TicketEmptyState
Frontend/screens/support/       SupportHomeScreen (Atendimento), TicketsScreen, CreateTicketScreen,
                                TicketDetailScreen, SupportHomeSection (Home e Avisos), SupportRouter
```

Entradas no app: Serviços → Atendimento, card "Atendimento" na Home (só com chamado relevante), avisos não
lidos em Serviços → Avisos e no próprio hub.

## Movimento

| Onde | Animação |
| --- | --- |
| Listas, mensagens, histórico | fade + 8 px, stagger de 40 ms (máx. 8 itens) |
| Filtros | indicador desliza até o chip (220 ms), cor do texto interpolada, lista entra com slide lateral |
| Abertura | barra de etapas preenche, círculo atual com mola, check com fade + scale, troca de etapa com slide |
| Categoria | ícone com scale curto, fundo e check com transição; tipos entram com slide de 10 px |
| Anexos | entrada lateral, barra de progresso por etapa, check desenhado ao concluir |
| Confirmação | círculo expande, check é desenhado, conteúdo entra em sequência |
| Andamento | linha se desenha, pontos aparecem em sequência, pulso sutil da etapa atual (3 ciclos) |
| Atualização ao vivo | aviso "Chamado atualizado" + realce temporário do evento novo |
| Ação pendente | entrada fade + slide; ícone faz um único gesto |
| Avaliação | estrelas com scale + mola; agradecimento com check |
| Folhas inferiores | backdrop com fade, folha com mola amortecida |

Com "Reduzir movimento" (sistema ou Perfil), as durações viram 0 e nada pulsa.
