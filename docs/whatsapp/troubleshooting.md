# Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Nenhum provedor ativo" | `ASA_WHATSAPP_PROVIDER=none`, ou falta segredo (o motivo aparece na tela) | Configure as variáveis citadas |
| API não sobe: "fake nunca é permitido em produção" | `ASA_WHATSAPP_PROVIDER=fake` com `NODE_ENV` ou `APP_ENV` de produção | Use outro provedor. É proposital |
| "A conexão pelo portal está desligada" | `ASA_WHATSAPP_SESSION_MANAGEMENT_ENABLED=false` | Ligue só com autorização |
| "Informe a referência da autorização" | Provedor real sem referência no canal | Registre em Canal WhatsApp |
| "Não foi possível falar com o provedor" | Gateway fora, URL errada ou chave errada | Veja `lastErrorCode`: `gateway_unreachable`, `gateway_auth_failed` |
| `public_base_url_missing` | Falta `ASA_SUPPORT_PUBLIC_BASE_URL` | Defina; o webhook exige HTTPS público |
| Mensagens não chegam (WA-AKG) | Webhook recusado, ou gateway ficou fora | Último webhook na tela; aguarde ou rode `support-whatsapp-reconcile` |
| Webhook responde 401 | Segredo divergente, ou relógio com mais de 5 min de diferença | Confira os dois lados e o NTP |
| Resposta "provider_unavailable" | Disjuntor aberto após falhas seguidas | Aguarde 60 s; confira o gateway |
| Portal "tentando reconectar" | API fora ou sem rede. **Não diz nada sobre o WhatsApp** | Veja `/health`. A tela recarrega ao voltar |
| Feed atrasado vários segundos | Transação longa no banco segura o horizonte | Procure em `pg_stat_activity`. Eventos não se perdem |
| Aluno não vê o chamado do WhatsApp | Sem vínculo, ou vínculo sem autorizar chamados anteriores | Peça a vinculação pelo app. A equipe não vincula manualmente |
| Aluno não vê as mensagens do WhatsApp | Padrão: `ASA_SUPPORT_MIRROR_WHATSAPP_TO_APP=false` | Só muda com decisão institucional |
| Telefones ilegíveis, erro ao enviar | `ASA_WHATSAPP_PII_KEY` trocada | Restaure a chave anterior do cofre |
| PDF não abre na prévia | Arquivo inválido, ou CSP diferente | A tela oferece download. Confira a CSP (`script-src 'self'` cobre o worker) |
| "Lida" nunca aparece (WA-AKG) | Status deslocado no gateway | Esperado: não é possível distinguir |
| Login bloqueado em build de produção com API de demonstração | `RequireInstitutionalData` | Proposital; use `npm run dev` para demonstração |
