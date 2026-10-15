# ADR-007 — Fila presencial do ASA: monitor no backend, push e alertas idempotentes

- **Status:** aceito (2026-10-06)
- **Contexto da decisão:** pedido para que o estudante acompanhe a fila presencial do ASA
  (<https://presencial.fecap.br/>) dentro do ASA Conecta, com posição, mesa, alertas antecipados, push,
  vibração e a voz do ASA IA — sem precisar olhar o painel.

## Contexto

A fila é uma página pública do Power Pages (Dynamics 365). Não há API documentada nem tempo real na
origem. O app é Expo/React Native (sem react-navigation, com um assistente de voz próprio) e o backend é
um BFF Node.js com PostgreSQL. O aplicativo pode estar suspenso, bloqueado ou fechado exatamente quando a
senha é chamada.

## Decisões

1. **Monitor no backend, nunca no app.** Um único `QueueMonitor` consulta a fonte e abastece todos os
   alunos; o app recebe estado por SSE (aberto) e push (segundo plano/fechado). Polling no app só como
   plano B do SSE e só em primeiro plano.
2. **Endpoint estruturado do portal como fonte primária.** A investigação mostrou que a própria página
   carrega as listas por `POST /_services/entity-grid-data.json` (JSON, anônimo, com token anti-CSRF). É
   preferido ao HTML, que nem contém as senhas. Fallback de HTML com parser por títulos; automação de
   navegador descartada. Listas identificadas por colunas, nunca por posição.
3. **Camada `QueueProvider`.** `FecapPortalQueueProvider`, `FecapQueueHtmlProvider`, `MockQueueProvider`
   (este só com `ASA_QUEUE_PROVIDER=mock`, recusado em produção).
4. **Dados reais ou nada.** Senha como texto; posição pela lista real de próximas senhas (nunca subtração
   de números); mesa só quando informada; estimativa como faixa a partir do ritmo global de chamadas, ou
   ausente. Lista vazia ≠ fila encerrada.
5. **Alertas idempotentes pelo estado.** O tracker reavalia cada acompanhamento contra o snapshot atual;
   o marco (`QUEUE_5_AHEAD` → `QUEUE_3_AHEAD` → `QUEUE_NEXT` → `QUEUE_CALLED`) só avança por
   compare-and-set no banco e cada envio tem chave de idempotência. No app, o alerta interno compara o
   marco do servidor com o último marco exibido no aparelho. Repetição de snapshot, reconexão, duas
   instâncias ou app reaberto não duplicam avisos.
6. **Uma única voz.** Os alertas falam pelo TTS do assistente (`announce` no controlador de voz), com
   prioridade alta para a chamada; preferência própria "ASA IA por voz" na fila.
7. **SSE em vez de WebSocket.** HTTP simples no Express, sem dependência nova; no app, cliente sobre
   `XMLHttpRequest`. Conexões renovadas periodicamente para usar o token de acesso atualizado.
8. **Push via Expo** com `NotificationService` genérico (retries, recibos, desativação de tokens,
   mascaramento); o Atendimento (ADR-006) reutiliza o mesmo serviço.
9. **Multi-instância com o que já existe.** Advisory lock do PostgreSQL elege o líder; o último snapshot
   fica em `queue_monitor_state` (cache entre instâncias e após reinício). Redis não foi adicionado.
10. **Vínculo temporário.** `queue_subscriptions` vale para o dia de atendimento e expira sozinho;
    nunca é exposto a outro usuário.

## Consequências

- Funciona com o app fechado (push) e sem carga proporcional ao número de alunos sobre a FECAP.
- Dependência de um endpoint não documentado: mudanças no portal são detectadas (erro de parser,
  métricas, saúde), o último estado é preservado e o app avisa que não consegue atualizar. Uma API
  oficial da FECAP removeria esse risco — o provider pode ser trocado sem mexer no resto.
- Push real exige build com projeto EAS; no Expo Go/web os avisos aparecem só com o app aberto.
- Detalhes, variáveis e roteiro de testes: [architecture/queue-presencial.md](../architecture/queue-presencial.md).

## Adendo (2026-10-15) — fonte padrão e autorização

- **Mudança:** o provedor padrão passou a ser o **simulador** (`ASA_QUEUE_PROVIDER=mock`), identificado
  como demonstração nos clientes (`sync.source.kind = demo`, "Simulação — dados fictícios").
- **Motivo:** o painel público `presencial.fecap.br` não tem contrato nem autorização institucional
  registrados. A plataforma não deve presumir essa autorização.
- **Como usar a fonte real:** defina `ASA_QUEUE_PROVIDER=fecap`. Enquanto `ASA_QUEUE_SOURCE_AUTHORIZED` não for
  `true`, os clientes mostram "Fonte pública sem autorização institucional registrada".
- **Produção:**
  - sem provedor explícito, a fila fica **desligada** com o motivo informado na saúde da API;
  - o simulador é recusado.
- **Inalterado:**
  - um único monitor por instância líder;
  - backoff e circuito;
  - nenhum dado pessoal é enviado à fonte.
- Ver também [SECURITY_AND_LGPD.md](../plataforma/SECURITY_AND_LGPD.md) §6.
