# Integração com o WA-AKG (piloto)

Revisão auditada: **`04d6c0f5e484df469840697e3573654691792958`** (v1.7.0, licença MIT). O código da revisão fixada prevaleceu sobre README, `docs/` e `swagger.json`, que divergem em cerca de 30 pontos.

> **Estado:** adapter implementado e testado com os payloads montados a partir do código do gateway. **Nunca rodou contra um gateway real nem um número real.** O gateway não foi instalado nem executado nesta entrega.

## O que foi aproveitado

Só o protocolo, por HTTP, em um serviço isolado. Nenhum código do WA-AKG entrou no ASA Conecta, e o painel dele não é usado nem embutido.

| Aspecto do gateway | Fato na revisão fixada | Decisão no adapter |
|---|---|---|
| Autenticação | `x-api-key`, uma chave por usuário, sem escopo nem validade | Usuário dedicado + proxy com lista de rotas |
| Estado da sessão | **Não existe webhook de status** | Sempre lido em `GET /api/sessions/{id}`; `CONNECTED` com `hasInstance: false` é registro velho e conta como desconectado |
| Vocabulário | `STOPPED`, `DISCONNECTED`, `SCAN_QR`, `CONNECTED`, `LOGGED_OUT` | Mapeado; valor novo vira `ERROR`, nunca "conectado" |
| Status de mensagem | **Deslocado em uma posição** em relação ao Baileys | `SENT`/`DELIVERED` = enviada; `READ` = entregue, **nunca "lida"**; `PENDING` ignorado |
| Falha de envio | O webhook de status não informa falha | Só a resposta do `/send` indica recusa |
| Webhook | Uma tentativa, 10 s, sem fila; só HTTPS público | Reconciliação periódica; registro exige `ASA_SUPPORT_PUBLIC_BASE_URL` |
| Mensagem com o gateway fora | Armazenada, mas **sem webhook** | Reconciliação por `GET /api/chat/{s}/{jid}` |
| Assinatura | `X-Webhook-Signature: sha256=` (HMAC do corpo cru) | Verificada; `timestamp` assinado limita repetição a 5 min |
| Idempotência no envio | **Não existe** | Timeout, queda de conexão (`ECONNRESET`) e 5xx genérico viram `unknown`, sem reenvio automático |
| Rotação do segredo | O registro guarda o segredo | Cada conexão reaplica o segredo no webhook existente |
| JID | `from` traz o telefone quando resolve; senão fica `@lid` | Telefone ou LID opaco; nunca deduz telefone de LID |
| Grupos | Entregues pelo mesmo evento | Ignorados (fora de escopo) |
| Mídia | Caminho relativo `/api/media/...`, sem tipo nem tamanho | Só esse formato de caminho; tipo conferido pelo conteúdo |
| `/reply` | Sem id de retorno, repassa URLs sem validar | **Nunca chamada**; usa `/send` com `quotedMessageId` |

### Por que a reconciliação tem limite de data

O gateway guarda o histórico completo do número. Sem limite, a primeira reconciliação importaria conversas antigas como chamados. Por isso ela nunca volta além da criação do canal nem de 3 dias, e usa os mesmos ids do webhook: a inbox deduplica.

## Segurança: o que precisa ser feito antes de subir

Achados da auditoria, por ordem de gravidade:

1. **Críticos em dependências:** `next@16.1.1`, `next-auth@5.0.0-beta.30`, `@auth/core`. Total do `npm audit`: 72 (3 críticos, 51 altos, 14 moderados, 4 baixos); 44 dos críticos e altos alcançam o pacote de produção. A atualização sugerida (`next@16.4.4`) **não foi testada com este código**, e as correções automáticas de `baileys` e `jimp` seriam rebaixamentos de versão principal.
2. **Leitura de arquivo local e SSRF, com chave válida:** `/reply`, `/{messageId}/reply`, `/album`, `/interactive` e `mediaUrl` do agendador repassam URLs sem validar. Análise estática, sem execução.
3. **Negação de serviço remota:** mídia recebida não tem limite de tamanho nem retenção, então qualquer pessoa que escreva para o número pode esgotar memória ou disco.
4. **LGPD:** `syncFullHistory: true` é fixo, e tudo fica sem cifra e sem retenção. Use um número novo, dedicado.
5. **Exposição:** o compose original publica a porta 3000 em todas as interfaces, e `listen()` ignora `HOSTNAME`. Não há limite de tentativas de login.
6. **Telemetria ligada por padrão**, com POST a cada 30 s para `api-wa-akg.aikeigroup.net`.
7. **Outros:** segredos de webhook em texto e devolvidos por rotas GET; o primeiro usuário registrado vira SUPERADMIN; credenciais podem sobreviver à exclusão da sessão (inferido).

### Lista de rotas no proxy

Com a chave sem escopo, o proxy reverso é a principal barreira. Libere apenas:

```text
POST /api/messages/{s}/{jid}/send
GET  /api/media/*
GET  /api/sessions/{s}
GET  /api/sessions/{s}/qr
POST /api/sessions
POST /api/sessions/{s}/(start|logout)
GET|POST /api/webhooks/{s}
PUT  /api/webhooks/{s}/{id}
GET  /api/chat/{s}
GET  /api/chat/{s}/{jid}
```

Bloqueie todo o resto, em especial `/_next/image`, `/reply`, `/spam`, `/broadcast`, `/album`, `/interactive`, `/api/scheduler` e `/api/auth/register`. Painel administrativo do gateway, só por rede administrativa.

### Anti-ban

O recurso "anti-ban" é uma fila com atrasos aleatórios por sessão. **Não usamos e não deve ser ligado:** contornar controles do WhatsApp está fora de escopo. Ele vem desligado. Confira que `GET /api/sessions/{id}/bot-config` responde `antiSpamEnabled: false`.

## Como subir (só com autorização)

1. Clone a revisão auditada, fora do versionamento:

   ```bash
   git clone https://github.com/mrifqidaffaaditya/WA-AKG .references/WA-AKG
   git -C .references/WA-AKG checkout 04d6c0f5e484df469840697e3573654691792958
   ```

2. Defina os segredos `WA_AKG_*` no `.env` de `src/Entrega_2/Backend` e suba:

   ```bash
   cd src/Entrega_2/Backend
   docker compose -f docker-compose.yml -f docker-compose.whatsapp-pilot.yml --profile whatsapp-pilot up -d --build wa-akg
   ```

   O arquivo validado por `docker compose config` publica só em `127.0.0.1:3100`, usa MySQL próprio em rede interna e passa `ENABLE_TELEMETRY=false` e `ENCRYPTION_KEY`. **O build e a subida não foram executados.**

3. Crie um usuário `USER` dedicado no gateway e gere a chave em `POST /api/user/api-key` (só por sessão de cookie).

4. Configure a API do ASA:

   ```dotenv
   ASA_WHATSAPP_PROVIDER=wa-akg
   ASA_WHATSAPP_PII_KEY=<openssl rand -base64 48>
   ASA_WHATSAPP_WEBHOOK_SECRET=<openssl rand -base64 48>
   ASA_WA_AKG_BASE_URL=http://wa-akg:3000
   ASA_WA_AKG_API_KEY=<chave do usuário dedicado>
   ASA_SUPPORT_PUBLIC_BASE_URL=https://<api-publica>
   ASA_WHATSAPP_SESSION_MANAGEMENT_ENABLED=true
   # só depois de validar a conexão:
   ASA_WHATSAPP_OUTBOUND_ENABLED=true
   ```

5. Em **Administração > Canal WhatsApp**: crie o canal, registre a referência da autorização e conecte pelo QR, com o aparelho do número autorizado.

## Decisão em aberto: Vercel até o gateway

O backend de produção roda em funções serverless, sem IP de saída fixo, e o gateway exige um processo persistente fora da Vercel.

- **ASA → gateway:** precisa de túnel autenticado ou proxy com credencial própria na frente do `x-api-key`. Nada disso foi definido.
- **Gateway → ASA:** o webhook em HTTPS público funciona, mas sem reenvio: cold start ou erro perde o evento até a próxima reconciliação.
- Os laços residentes não rodam na Vercel. Agende `support-outbox` e `support-whatsapp-reconcile` em `/api/internal/jobs/*`, ou use o worker. O plano Hobby limita o cron a uma vez por dia; com operadores conectados, a fila anda junto com o long polling deles.

**Recomendação:** não invista nesse caminho para produção. Se o piloto for aprovado, rode a API e o gateway juntos em um host dedicado, ou vá direto à Cloud API, que não tem esse problema.

## Atribuição

WA-AKG © 2026 Aditya, licença MIT. Usado apenas como serviço externo opcional; nenhum código copiado.
