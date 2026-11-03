# Comparação de provedores

| | `fake` | `wa-akg` | `meta-cloud-api` |
|---|---|---|---|
| Uso | Testes e demonstração | Piloto autorizado | Produção institucional |
| Oficial | Não se aplica | **Não** (Baileys) | Sim |
| Sai para o WhatsApp | **Nunca** | Sim | Sim |
| Testado contra o serviço real | Não se aplica | **Não** | **Não** |
| Testes | Fluxo completo com banco real | Contrato com payloads do código auditado | Contrato com formato documentado |
| Permitido em produção | Recusado na subida | Tecnicamente sim; ver riscos | Sim |
| Conexão | Simulador | QR no portal | Fora do portal (Meta) |
| Janela de 24 h | Não | Não | **Sim**, bloqueio prévio |
| "Enviada" significa | Aceita | Aceita pelo gateway | Webhook `sent` |
| Pode dizer "lida" | Sim | **Nunca** (status deslocado no gateway) | Sim |
| Detecta falha depois de aceitar | Simulada | **Não** | Sim |
| Assinatura do webhook | HMAC próprio | `X-Webhook-Signature` + janela de 5 min | `X-Hub-Signature-256` |
| Reenvio de webhook pelo provedor | Não se aplica | **Nenhum** (reconciliação) | Até 7 dias |
| Mídia recebida | Arquivos sintéticos | Caminho do gateway | Graph API, hosts da Meta |
| Enviar anexo | **Não implementado** | **Não implementado** | **Não implementado** |
| Modelos aprovados | Não se aplica | Não se aplica | **Não implementado** (bloqueia com `template_required`) |
| Roda na Vercel | Sim | Só o adapter; o gateway precisa de host persistente | Sim |
| Custo | Nenhum | Infra + risco de perder o número | Por mensagem |

Trocar de provedor é configuração (`ASA_WHATSAPP_PROVIDER`). Telas e regras de negócio não mudam.

Só o provedor configurado fica ativo. Um canal de outro provedor continua existindo, com histórico preservado, mas não recebe nem envia.
