# Fila presencial do ASA no ASA Conecta

O estudante retira a senha no balcão do ASA, informa a senha no app e pode sair de perto do painel: o
ASA Conecta acompanha a fila pública <https://presencial.fecap.br/> e avisa quando a vez estiver
chegando e quando a senha for chamada — por push (app fechado), aviso na tela, vibração e pela voz do
ASA IA. Decisões: [ADR-007](../adr/ADR-007-queue-presencial.md).

Implementação: `src/Entrega_2/Backend/api/src/queue/` (monitor, parser, alertas, API),
`src/Entrega_2/Backend/api/src/notifications/` (push), `database/migrations/005_queue_tracking.sql`,
`src/Entrega_2/Frontend/features/queue/` (tela, alertas, push, tempo real). Contrato: seção *queue*
(v1.4) de `src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts`.

## Arquitetura

```text
┌──────────────────────────────┐
│ presencial.fecap.br          │  Power Pages / Dataverse (tabela ret_relacionamento)
└──────────────┬───────────────┘
               │ 2 POST JSON a cada 10 s (uma única consulta para todos os alunos)
               ▼
┌──────────────────────────────┐
│ QueueProvider                │  FecapPortalQueueProvider (endpoint JSON do portal)
│ API estruturada → HTML       │  └─ fallback FecapQueueHtmlProvider · MockQueueProvider (dev)
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ QueueMonitor (líder)         │  snapshot + diff · backoff/circuito · lock de liderança (pg advisory)
│ snapshot → banco (cache)     │  queue_monitor_state · queue_calls (histórico)
└──────────────┬───────────────┘
               │ QueueEventBus: queue.updated · queue.source_unavailable · queue.ticket.*
       ┌───────┴──────────────────────────┐
       ▼                                  ▼
┌──────────────────────┐        ┌──────────────────────────┐
│ QueueTracker         │        │ QueueRealtimeHub (SSE)   │  GET /api/queue/stream
│ avalia cada senha    │        │ queue.status · queue.sync│  app aberto
│ marcos idempotentes  │        │ queue.ticket.*           │
└──────────┬───────────┘        └────────────┬─────────────┘
           ▼                                 │
┌──────────────────────┐                     │
│ QueueAlertDispatcher │──► NotificationService ──► Expo Push ──► APNs/FCM
│ push (idempotente)   │    (retries, tokens, recibos)            app em 2º plano/fechado
└──────────────────────┘                     │
                                             ▼
┌──────────────────────────────────────────────────────────────┐
│ ASA Conecta (app)                                            │
│ QueueProvider → tela/Início/Serviços · aviso interno · modal │
│ "É a sua vez!" · vibração (expo-haptics) · ASA IA (TTS do    │
│ assistente) · leitor de tela · deep link asaconecta://…/fila │
└──────────────────────────────────────────────────────────────┘
```

O app **nunca** consulta `presencial.fecap.br` e não usa WebView: com o app suspenso ou fechado, quem
continua acompanhando é o backend, que envia o push.

## Investigação da fonte (06/10/2026)

| Item | Achado |
| --- | --- |
| Plataforma | Microsoft Power Pages (Dynamics 365 Portals) |
| HTML do servidor | **sem senhas**: as listas são preenchidas no navegador; o placeholder "Não há registros a serem exibidos." vem no HTML mesmo com fila cheia |
| "PRÓXIMAS SENHAS" | lista de entidade `ret_relacionamento`, colunas `fecap_posicaonafilapresencial` (posição) e `fecap_senhanopresencial` (senha) |
| "SENHAS ANTERIORES" | mesma tabela, colunas `fecap_senhanopresencial`, `fecap_mesaasa_porextenso` (mesa), `fecap_datadeatribuicao` (hora da chamada, UTC) e `statuscode` ("Em atendimento"/"Concluído") |
| "ÚLTIMA SENHA" | card gallery (controle PCF remoto) que mostra os mesmos registros |
| Endpoint usado pela página | `POST /_services/entity-grid-data.json/<site>` com a configuração da lista (`data-view-layouts`) e o token anti-CSRF de `GET /_layout/tokenhtml` — acesso anônimo, JSON estruturado |
| Tempo real na origem | não há WebSocket/SSE; o recarregamento automático da página está desativado |

Ordem de preferência aplicada: não existe API oficial documentada → **endpoint estruturado usado pelo
próprio portal** (primário) → parser de HTML (fallback) → automação de navegador não é usada. As listas
são localizadas pelos **nomes lógicos das colunas**, não por posição ou seletores CSS.

## Provider, parser e snapshot

- `FecapPortalQueueProvider`: descobre as listas no HTML (uma vez, renovando a cada 30 min ou quando a
  fonte recusa a sessão com 4xx), guarda token e cookies em memória e, a cada ciclo, faz 2 POSTs
  pequenos (próximas senhas até 50; últimas 12 chamadas). Timeout configurável.
- `fecapParser.ts`: decodifica `data-view-layouts`, lê o token, valida `Records` e converte registros
  em `QueueCall`/`QueueWaiting`. Senha **sempre string** (`"0026\n"` → `"0026"`), datas por `DisplayValue`
  ISO ou `/Date(ms)/`, situação por rótulo ("Concluído" → `completed`).
- `textParser.ts` + `FecapQueueHtmlProvider`: lê o texto visível (títulos "ÚLTIMA SENHA", "PRÓXIMAS
  SENHAS", "SENHAS ANTERIORES", sem acento/caixa). Texto sem nenhuma senha é **erro**, nunca "fila vazia".
- `buildSnapshot`: descarta chamadas de outro dia, ordena e define `status`: `open` (há chamadas ou
  senhas aguardando), `empty` (nada no dia). Lista de próximas senhas vazia **com** chamadas no dia continua
  `open`. `closed` só quando um provider sabe afirmar (hoje, apenas o mock).
- Posição: `ahead` = quantas senhas aparecem **antes** na lista real de próximas senhas. Nunca
  `0030 − 0026`. Senha fora das listas → posição desconhecida ("Sua senha ainda não foi chamada.").
- Várias mesas: `currentCallsByDesk` mostra a última senha de cada mesa; `QueueCall.desk` é `null` quando
  a fonte não informa (o app diz "Mesa não informada", a voz manda conferir o painel).

## Monitor, eventos e idempotência

- **Uma consulta abastece todos os alunos** (nunca uma por aluno). Intervalo `ASA_QUEUE_POLL_INTERVAL_SECONDS`
  (padrão 10 s, mínimo 5 s).
- Falha → mantém o último snapshot válido, conta métricas, avisa `queue.source_unavailable` uma vez por
  indisponibilidade e faz **backoff exponencial** (10 s → 20 s → 40 s …). Após
  `ASA_QUEUE_FAILURE_THRESHOLD` falhas o circuito abre (consultas a cada `ASA_QUEUE_MAX_BACKOFF_SECONDS`);
  a primeira leitura boa fecha o circuito e emite `queue.source_recovered`.
- Várias instâncias da API: `pg_try_advisory_lock` elege um líder; as demais releem
  `queue_monitor_state` e repassam ao tempo real local. Reinício: o último snapshot do dia é restaurado.
- `QueueTracker` reavalia **cada acompanhamento ativo** contra o snapshot atual (função pura
  `evaluateSubscription`). Repetir o mesmo snapshot produz o mesmo resultado, então reconexões não geram
  eventos novos.

| Marco (`last_alert`) | Quando | Estado |
| --- | --- | --- |
| `QUEUE_5_AHEAD` | ≤ 5 senhas à frente | `approaching` |
| `QUEUE_3_AHEAD` | ≤ 3 à frente | `approaching` |
| `QUEUE_NEXT` | ≤ 1 à frente | `next` |
| `QUEUE_CALLED` | senha aparece nas chamadas | `called` → `completed` (fonte "Concluído" + 2 min em `called`) |

- O marco só **avança** (compare-and-set em `queue_subscriptions.last_alert`); salto de 7 para 1 à frente
  dispara só `QUEUE_NEXT`; posição que "volta" não reenvia aviso antigo. Cada marco vira no máximo uma
  linha em `queue_subscription_events` (unique) e um envio em `notification_deliveries`
  (chave `queue:<acompanhamento>:<marco>`).
- Cuidados com reconexão: chamada detectada mais de 10 min depois de acontecer → push no passado ("foi
  chamada às 20:53…"); senha chamada **antes** do cadastro → estado `called` com `alreadyCalled`, sem
  "É a sua vez!". Cadastro já perto da vez → marcos registrados sem push (o aluno está olhando a tela).
- Expiração: o acompanhamento vale para o dia de atendimento (`expires_at` = fim do dia em
  `APP_TIMEZONE`); na virada do dia vira `expired` e deixa de ser monitorado.

| Evento do barramento | Equivale a |
| --- | --- |
| `queue.updated` | QUEUE_UPDATED |
| `queue.source_unavailable` | QUEUE_SOURCE_UNAVAILABLE |
| `queue.ticket.position_changed` | QUEUE_TICKET_POSITION_CHANGED |
| `queue.ticket.approaching` | QUEUE_TICKET_APPROACHING |
| `queue.ticket.next` | QUEUE_TICKET_NEXT |
| `queue.ticket.called` | QUEUE_TICKET_CALLED |
| `queue.ticket.completed` | QUEUE_TICKET_COMPLETED |

## Notificações push

- `NotificationService` (genérico, também usado pelo Atendimento): idempotência por chave, até 3
  tentativas com backoff em falha de transporte, `DeviceNotRegistered` desativa o token, recibos do Expo
  conferidos após `PUSH_RECEIPT_DELAY_SECONDS`, tokens sempre mascarados nos logs
  (`ExponentPushToken[abcd…wxyz]`).
- Mensagens: "Sua vez está chegando" · "Fique por perto" · "Prepare-se" · "É a sua vez! — Sua senha 0029
  foi chamada na Mesa 03." (sem mesa: "Confira a mesa no painel do ASA."). Canal Android `queue-alerts`
  (importância alta, vibração vibrar · pausa · vibrar), `priority: high`, TTL de 10 min (proximidade) e
  30 min (chamada). `data.url = asaconecta://atendimento/fila`.
- App: a permissão é pedida **só** depois que o aluno começa a acompanhar e toca em "Ativar
  notificações". Negada → explicação + atalho para as configurações; a tela continua funcionando.
  O token Expo exige um build com projeto EAS (`extra.eas.projectId`); no Expo Go/web o app explica
  que os avisos aparecem só com ele aberto.

## App

- `QueueProvider` (dentro do `AssistantProvider`) mantém o estado. Com o app aberto e interesse (tela
  da fila aberta ou senha ativa), abre o **SSE** (`XMLHttpRequest`, pois o `fetch` do React Native não
  entrega o corpo aos poucos); se cair, faz **polling a cada 15 s** e tenta reconectar (3 s → 60 s).
  Segundo plano → fecha tudo (o push assume); ao voltar, uma leitura imediata.
- Alertas internos são decididos pelo **estado** (marco do servidor × último marco exibido, guardado no
  aparelho): funcionam igual com SSE, polling, push ou app reaberto e nunca se repetem.
- Efeitos: aviso no topo (proximidade) ou modal "É a sua vez!" (chamada); `expo-haptics` (respeita as
  configurações de vibração; dois pulsos na chamada); voz pelo **mesmo TTS do assistente**
  (`useVoiceAssistant().announce`): a chamada tem prioridade alta e interrompe outra fala/escuta,
  avisos de proximidade só falam com o assistente ocioso; leitor de tela recebe "Sua senha 0029 foi
  chamada para a Mesa 03." e, quando ativo, substitui o TTS.
- Push com o app aberto: não vira banner do sistema (a tela mostra o próprio aviso), mas a chamada toca
  o som curto da notificação. Toque na notificação ou link `asaconecta://atendimento/fila` → tela da fila.
- Estados de experiência: `not_tracking`, `waiting`, `approaching`, `next`, `called`, `completed`,
  `queue_empty`, `service_closed`, `sync_error`, `offline` — todos com texto, não só cor.
- Movimento: destaque único em `approaching`/`next` (escala 0,98/0,97 → 1), troca "4 → 3 pessoas" com
  fade + deslocamento curto, modal com anel que se expande uma vez, senha crescendo e mesa deslizando.
  Sem loops. "Reduzir movimento" (sistema ou preferência) troca tudo por fade.
- Entradas: Serviços → "Fila presencial", Atendimento → "Fila presencial do ASA", card no Início
  (só com senha acompanhada), assistente ("abre a fila do ASA").

## ASA IA

Intenções `get_queue_status`, `get_queue_current_call`, `get_queue_estimate` no interpretador pt-BR, com
respostas montadas a partir dos dados reais:

- "ASA, quantas pessoas faltam para mim?" → "Existem três atendimentos antes da sua senha."
- "Qual senha está sendo atendida?" → "A senha 0026 está entre as últimas chamadas e foi direcionada para a Mesa 03."
- "Quanto tempo falta?" (com senha acompanhada) → "A estimativa atual é de aproximadamente 10 a 15 minutos."
  ou, sem dados suficientes, "Não consigo estimar o tempo com segurança agora, mas posso acompanhar sua
  posição na fila." Sem senha acompanhada, "quanto tempo falta?" continua sendo pergunta acadêmica.
- Fonte indisponível → a resposta começa com "Não consegui atualizar a fila agora; a última informação é das 20:43."

## Estimativa

`estimateWait`: ritmo **global** de chamadas (todas as mesas juntas) nos últimos 60 min, mínimo de 4
chamadas em ≥ 5 min e a última há ≤ 20 min. Espera ≈ (senhas à frente + 1) ÷ chamadas por minuto,
exibida como faixa (× 0,75 a × 1,3, arredondada) e "Estimativa aproximada". Atendimento paralelo já
aparece no ritmo; não há suposição de atendimento serial. Limitações: não conhece prioridades, pausas,
desistências nem a duração de cada atendimento — por isso faixa larga, confiança no máximo "medium" e
nenhuma estimativa quando os dados não sustentam.

## API

| Método | Rota | Autenticação | Resposta |
| --- | --- | --- | --- |
| GET | `/api/queue` | Bearer | `QueueOverview` |
| GET | `/api/queue/status` | Bearer | `QueueStatus` (fila + o acompanhamento do próprio usuário) |
| GET | `/api/queue/stream` | Bearer | SSE: `queue.status`, `queue.sync`, `queue.ticket.*` (conexão renovada a cada 5 min) |
| POST | `/api/queue/subscriptions` `{ticket, pushEnabled?, voiceEnabled?, vibrationEnabled?}` | Bearer | `QueueStatus` (`201`; substitui o acompanhamento ativo anterior) |
| GET | `/api/queue/subscriptions/current` | Bearer | `QueueSubscription \| null` |
| PATCH | `/api/queue/subscriptions/current` `{pushEnabled?, voiceEnabled?, vibrationEnabled?}` | Bearer | `QueueSubscription` |
| DELETE | `/api/queue/subscriptions/current` | Bearer | `204` |
| POST / DELETE | `/api/notifications/push-token` `{token, platform}` / `{token}` | Bearer | `204` |
| GET | `/health/queue` | pública (sem dados de alunos) | `QueueHealth` (`503` só sem nenhum dado) |
| POST | `/api/queue/dev/mock` `{scenario?, advance?}` | Bearer | só com `ASA_QUEUE_PROVIDER=mock` fora de produção |

O usuário vem sempre do token: corpos estritos (`userId` → `400`). Limites por usuário: 10 cadastros e
60 alterações a cada 10 min (`429` + `Retry-After`). O vínculo aluno ↔ senha nunca aparece para outro
usuário.

## Configuração

| Variável (API) | Padrão | Uso |
| --- | --- | --- |
| `ASA_QUEUE_ENABLED` | `true` | desliga o monitor e as rotas de cadastro (`503 queue_disabled`) |
| `ASA_QUEUE_PROVIDER` | `fecap` | `fecap` (portal + fallback HTML) · `fecap-html` · `mock` (recusado em produção) |
| `ASA_QUEUE_SOURCE_URL` | `https://presencial.fecap.br/` | origem |
| `ASA_QUEUE_POLL_INTERVAL_SECONDS` | `10` | intervalo entre consultas (5–300) |
| `ASA_QUEUE_CACHE_TTL_SECONDS` | `30` | idade a partir da qual o dado é "desatualizado"; ritmo dos seguidores |
| `ASA_QUEUE_REQUEST_TIMEOUT_MS` | `8000` | timeout de cada requisição à origem |
| `ASA_QUEUE_MAX_BACKOFF_SECONDS` / `ASA_QUEUE_FAILURE_THRESHOLD` | `300` / `5` | backoff máximo / falhas até abrir o circuito |
| `ASA_QUEUE_SUBSCRIPTION_RATE_LIMIT` | `10` | cadastros por usuário a cada 10 min |
| `ASA_QUEUE_MOCK_SCENARIO` / `ASA_QUEUE_MOCK_STEP_SECONDS` | `progression` / `20` | simulação |
| `PUSH_PROVIDER` | `expo` | `expo` · `log` (só registra) · `disabled` |
| `EXPO_ACCESS_TOKEN` | — | segredo do backend, só com "Enhanced Security for Push" |
| `PUSH_RECEIPT_DELAY_SECONDS` | `60` | conferência dos recibos (0 desativa) |

App: `EXPO_PUBLIC_USE_MOCK_QUEUE=true` liga a fila simulada no aparelho (nenhum segredo no app).

## Observabilidade

Logs estruturados (`module: queue`): `queue_monitor_started`, `queue_fetch_success`/`queue snapshot
updated`, `queue_fetch_error`, `queue_parser_error`, `queue_source_recovered`, `queue_ticket_called`,
`queue_alert_reached`, `notification_queued`/`notification_sent`/`notification_failed`/
`notification_delivered`. Métricas em `GET /health/queue`: `queue_fetch_success_total`,
`queue_fetch_failure_total`, `queue_parser_failure_total`, `queue_snapshot_age_seconds`,
`queue_notifications_sent_total`, `queue_notifications_failed_total`, `queue_calls_observed_total`.

## Desenvolvimento e testes

```bash
# API com fila simulada (0026 → 0029 a cada 20 s)
ASA_QUEUE_PROVIDER=mock PUSH_PROVIDER=log npm run dev          # src/Entrega_2/Backend/api
# App com fila simulada no próprio aparelho (sem API)
EXPO_PUBLIC_USE_MOCK_QUEUE=true npx expo start                  # src/Entrega_2/Frontend
```

Em desenvolvimento a tela mostra o painel "Simulação" (cenários `empty`, `waiting`, `5_ahead`, `3_ahead`,
`next`, `called`, `completed`, `offline`, `progression` e "Chamar próxima").

Testes automatizados: `api/test/unit/queueParser.test.ts` (fixtures reais reduzidas em
`api/test/fixtures/queue/`), `queueMonitor.test.ts`, `queueAlerts.test.ts`, `queueApi.test.ts`,
`api/test/integration/queue.integration.test.ts` (PostgreSQL); no app `queueLogic.test.ts`,
`queueController.test.ts`, `QueueScreen.test.tsx`, `voiceAnnounce.test.tsx`, `queueNavigation.test.ts`.

Roteiro manual (aparelho real com build de desenvolvimento): app aberto · minimizado · bloqueado ·
fechado · push permitido · push negado · voz ativa/desativada · internet perdida · fonte indisponível
(`ASA_QUEUE_PROVIDER=mock` + cenário `offline`) · fila vazia · senha chamada · várias mesas · mesmo
snapshot repetido (sem alerta duplicado).

## Limitações conhecidas

- A integração depende de um endpoint **não documentado** do portal: se a FECAP mudar colunas ou a
  forma de carregar as listas, o monitor registra `queue_parser_error`, mantém o último estado e o app
  mostra "Não conseguimos atualizar a fila agora". O ideal é a FECAP oferecer uma API oficial.
- "Concluído" na fonte nem sempre significa atendimento realizado (uma senha pode ser concluída por
  ausência); o app diz "O painel do ASA marcou esta senha como concluída".
- Push exige build com projeto EAS (não funciona no Expo Go para Android) e permissão do sistema; o
  "som curto" vem da própria notificação.
- Em iOS o padrão de vibração do canal não se aplica (o sistema vibra uma vez); no app, dois pulsos de
  `expo-haptics`.
- O token de push fica registrado por aparelho; outro login no mesmo aparelho o transfere para o novo usuário.
