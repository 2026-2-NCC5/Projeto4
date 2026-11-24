# Notificações push do app

## O que chega no celular

| Origem | Quando | Categoria (preferência do aluno) |
|---|---|---|
| Atendimento | a equipe responde ou muda a situação de um chamado | `support` |
| Agendamentos | confirmação, remarcação, cancelamento e lembretes | `appointment` |
| Fila presencial | senha próxima e "É a sua vez!" (canal Android de prioridade alta) | fila |
| **Avisos do ASA** | a equipe envia em **Portal → Enviar aviso** (`/asa/enviar-aviso`, `/admin/enviar-aviso`) | `system` |
| Teste | o aluno ativa as notificações no app | — |

Todos também aparecem na central de avisos (app e portal). O aluno desliga o push por categoria nas
preferências; o aviso continua na central.

## Como o app se registra

- Depois do login o app registra o aparelho em `POST /api/notifications/push-token` se a permissão já existe
  (antes, só quem acompanhava a fila presencial recebia push).
- Sem permissão, a Home e a tela Avisos mostram **"Ative as notificações"**; o pedido do sistema só aparece
  quando o aluno toca. Ao ativar, o app manda um push de teste (`POST /api/notifications/push-test`).
- No logout o aparelho é removido (`DELETE /api/notifications/push-token`).
- A API envia pelo Expo Push Service (`PUSH_PROVIDER=expo`), com idempotência (o mesmo aviso nunca chega
  duas vezes), recibos de entrega e desativação de tokens inválidos.

## Avisos para todos os alunos

`POST /api/notifications/broadcast` `{ title (3–65), body (3–240) }`, permissão `notifications:broadcast`
(equipe ASA e administração), até 10 envios por hora por pessoa. O mesmo texto repetido em 10 minutos não
duplica. A auditoria registra quem enviou e o alcance, não o texto. Não inclua dados pessoais no aviso.

## Requisito para o Android (Firebase Cloud Messaging)

O Expo Go **não recebe push** (desde o SDK 53) e o APK só recebe depois de configurar o FCM, uma vez:

1. Em <https://console.firebase.google.com> crie um projeto (ex.: "ASA Conecta") e adicione um app
   Android com o pacote `com.asaconecta.app`. Baixe o `google-services.json`.
2. Coloque o arquivo em `src/Entrega_2/Frontend/google-services.json` e adicione em `app.json` →
   `expo.android.googleServicesFile: "./google-services.json"` (o arquivo contém só identificadores
   públicos do app, mas o repositório é público: prefira o segredo de arquivo do EAS,
   `eas env:create --name GOOGLE_SERVICES_JSON --type file`).
3. Firebase → Configurações do projeto → Contas de serviço → **Gerar nova chave privada** (JSON). Envie ao
   EAS: `npx eas-cli credentials` → Android → production → *Google Service Account* → *Push Notifications
   (FCM V1)*. **Nunca** versione essa chave.
4. Gere um novo APK (mudança nativa; o EAS Update não basta).

iOS exige conta Apple Developer (chave APNs, configurada pelo `eas credentials`).
