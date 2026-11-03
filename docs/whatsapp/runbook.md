# Runbook

## Acompanhar

**Administração > Canal WhatsApp** mostra estado real, último webhook, fila e falhas. Eventos relevantes nos logs (`pino`, com `correlation_id`):

| Mensagem | Significado |
|---|---|
| `whatsapp webhook rejected` | Assinatura ou formato recusados. Vários seguidos: segredo divergente ou tentativa de forjar |
| `whatsapp provider circuit opened` | 5 falhas seguidas; envios suspensos por 60 s |
| `whatsapp event processing failed` | Evento guardado na inbox e será refeito |
| `whatsapp send raised` | Exceção no envio; a mensagem fica `unknown` |
| `whatsapp reconcile failed` | Reconciliação do WA-AKG não conseguiu ler o gateway |
| `whatsapp inbox row could not be decrypted` | Linha ilegível, em geral chave trocada. As demais seguem |

Logs nunca trazem telefone, texto de mensagem, QR ou chave. Se aparecer, trate como incidente.

## Tarefas agendadas

Sem processo residente, agende com `Authorization: Bearer $CRON_SECRET`:

| Tarefa | Frequência sugerida |
|---|---|
| `POST /api/internal/jobs/support-outbox` | 1 min |
| `POST /api/internal/jobs/support-channel-health` | 1 a 5 min |
| `POST /api/internal/jobs/support-whatsapp-reconcile` | 5 min (só WA-AKG) |
| `POST /api/internal/jobs/support-maintenance` | 1 vez ao dia |

Todas são idempotentes. Com Docker ou `npm start`, os laços internos já cobrem as três primeiras.

## Situações

### Canal caiu

Os chamados continuam acessíveis. Respostas pelo WhatsApp são recusadas com o motivo; o chat do app segue funcionando. Reconecte em **Canal WhatsApp**. Mensagens já na fila aguardam, com espera crescente, e falham de forma explícita depois de 5 tentativas.

### Mensagens "Sem confirmação"

O provedor não confirmou. Ela pode ter chegado. **Não há reenvio automático.** Quem atende confere e usa **Tentar de novo**, ciente do risco de duplicar. Com o WA-AKG, uma confirmação posterior só chega se o envio tiver devolvido id.

### Número suspenso (WA-AKG)

Desligue `ASA_WHATSAPP_OUTBOUND_ENABLED`, pause o canal e reavalie com a instituição. Não tente contornar com outro número sem autorização.

### Desligar tudo rapidamente

Defina `ASA_WHATSAPP_PROVIDER=none` e publique. Atendimento pelo app e pelo portal continua; chamados do WhatsApp seguem acessíveis, sem novas entradas nem envios.

### Mensagens recebidas que falharam

Ficam guardadas, cifradas, e são refeitas com espera crescente. Depois de 8 tentativas, param. Em **Canal WhatsApp > Saúde da entrega**, use **Reprocessar agora** depois de resolver a causa. Após 30 dias, a tarefa de manutenção apaga.

### Revisão de vínculo

Em **Canal WhatsApp > Vínculos em revisão**. Confira a identidade **fora do sistema** antes de decidir, porque o painel mostra só o contato mascarado. "Transferir vínculo" revoga o anterior, e o estudante ainda confirma no app.

## Backup

| O quê | Onde | Observação |
|---|---|---|
| Banco do ASA | Backup do PostgreSQL | Inclui conversas e anexos |
| `ASA_WHATSAPP_PII_KEY` | Cofre | **Sem ela, telefones ficam ilegíveis** e não há como responder |
| Gateway (piloto) | MySQL + volume de mídia + `ENCRYPTION_KEY` | Restaurar requer os três juntos |

Procedimento de restauração não foi exercitado nesta entrega.

## Reverter a migration

`database/rollback/017_support_whatsapp.down.sql`. **Apaga** canais, conversas, vínculos e chamados nascidos no WhatsApp sem estudante. Faça backup antes. A validade é testada em transação desfeita, nunca executada em dados reais.
