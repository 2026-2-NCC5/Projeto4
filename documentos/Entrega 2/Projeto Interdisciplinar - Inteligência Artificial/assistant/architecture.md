# Assistente ASA — arquitetura (app + API)

> Evolução da Entrega 2: o assistente deixa de ser "uma aba" e passa a ser uma camada global do app,
> acessível de qualquer tela (overlay), por botão, por gesto e pela frase de ativação **"Hey Asa"**.
> A interpretação continua 100% na API (regras pt-BR, sem provedor externo) e o Agente para o
> Estudante continua sendo a única fonte de recomendações. Nada aqui inventa dados acadêmicos.

```text
┌──────────────────────────────── src/Entrega 2/Frontend ──────────────────────┐
│ App.tsx                                                                      │
│  PreferencesProvider → ThemeProvider (tema claro) → SessionProvider              │
│   └─ NavigationProvider (estado local tipado: aba, detalhe, tela atual)       │
│       └─ AssistantProvider  ← features/assistant/hooks/useAssistant.tsx      │
│           ├─ VoiceAssistantProvider (conversa: reducer puro + controller)     │
│           ├─ WakeWordService ("Hey Asa", primeiro plano, opt-in)             │
│           ├─ shell reducer (overlay, ativação, status do wake word)           │
│           ├─ histórico local (texto/horário/intenção; sem áudio)             │
│           └─ telemetria sem conteúdo sensível                                 │
│           children: telas + BottomNav + MicrophoneIndicator + AssistantOverlay│
└──────────────────────────────────────────────────────────────────────────────┘
                 │ POST /api/assistant/message { inputType, text, conversationContext, currentScreen }
                 ▼
┌──────────────────────────────── src/Entrega 2/Backend/api ───────────────────┐
│ auth → requireStudent → zod (.strict) → RuleBasedIntentInterpreter           │
│   → validateInterpretation (allow-list, disciplina do aluno, confiança)     │
│   → RESPONDERS[intent] (consulta | Agente | política | controle | open_screen)│
│   → AssistantResponse { display, speech, nextActions, navigation, context }  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Camadas no app

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Design System | `theme/` (`palette`, `colors`, `typography`, `spacing`, `radius`, `shadows`, `animations`, `theme`, `ThemeProvider`) | Tokens semânticos com Light e Dark projetados separadamente; `useTheme()` e `makeStyles()` (cache por tema). Cores da marca extraídas dos SVGs oficiais (`assets/branding`). |
| UI base | `components/ui/` | `AppText`, `AppButton` (primary/secondary/ghost/danger/assistant/inverse), `Surface` (inclui vidro), `GradientSurface` (SVG), `Badge`, `Avatar`, `SectionHeader`, `EmptyState`, `Skeleton`s, `SettingRow`, `IconButton`, `PressableScale`, `OfflineBanner`. |
| Acadêmico | `components/academic/`, `hooks/useAcademicOverview.ts` | `StatTile`, `ScheduleCard` (compromissos derivados de pendências + avaliações reais), `InsightCard` (alertas), `SubjectCard`, `GradeCard`, `AttendanceCard`, `PendingCard`. |
| Navegação | `navigation/` | `navigationReducer` (puro, testado), `NavigationProvider`/`useAppNavigation`, `currentScreenKey`, `actionForTarget` (allow-list do contrato → ação). |
| Assistente | `features/assistant/` | máquina de estados da casca (`assistantStateMachine.ts`), `wakeWordMatcher.ts`, `wakeWordService.ts`, `conversationHistory.ts`, `assistantTelemetry.ts`, `useAssistant.tsx`. |
| Assistente (UI) | `components/assistant/` | `AssistantOrb`, `AssistantOverlay`, `VoiceWaveform`, `MicrophoneIndicator`, `AssistantTranscript`, `HeyAsaOnboarding`, `AssistantSettingsSection`. |
| Chat (layout "Chat V1") | `components/assistant/` | `StreamingText` (revelação caractere a caractere com fade, `Animated` + native driver), `ChatBubble` (`UserBubble` escuro à direita, `AssistantMessage` sem balão com avatar ASA, `TypingIndicator`), `ChatInputBar` (multilinha até 5 linhas; botão mic ⇄ seta de envio; ações secundárias), `ChatEmptyState` (saudação + grade de ações rápidas). |
| Conversa (existente) | `hooks/voiceAssistantReducer.ts`, `hooks/useVoiceAssistant.tsx`, `services/voice/*`, `components/voice/*` | Fases `idle → listening → transcribing → understanding → thinking → answering`, STT (`expo-speech-recognition`), TTS (`expo-speech`), orb. |

## Estado único do assistente

O que a interface mostra é **derivado** (`deriveAssistantState`) de três fontes — nunca de booleans soltos:

```text
AssistantState =
  idle | wake-word-listening | activating | listening | processing | thinking
  | speaking | interrupted | error | offline
```

| Fonte | Onde vive | Exemplos |
| --- | --- | --- |
| Fase da conversa (`VoicePhase`) | `voiceAssistantReducer` (puro) | `listening`, `thinking`, `answering` |
| Casca (`AssistantShellState`) | `assistantShellReducer` (puro) | overlay aberto, `activation: activating/interrupted`, status do wake word, app em primeiro plano |
| Conectividade | `useNetworkStatus` | `offline` |

Prioridade: `interrupted` > `activating` > fase da conversa > `offline` > `wake-word-listening` > `idle`.
Todo estado tem texto (`ASSISTANT_STATE_LABELS`) e rótulo acessível — a animação nunca é o único canal.

## Fluxo "Hey Asa" (primeiro plano)

```text
wake word (recognizer contínuo) ──▶ matchWakeWord(transcript)
   │ eco do TTS? (looksLikeEcho) → ignora e religa
   ▼
ACTIVATE (haptic + overlay + orb "burst", 420 ms)
   ├─ frase trouxe comando ("Hey Asa, qual minha próxima aula?") → submitTranscript(remainder) (inputType 'voice')
   └─ só a ativação → startListening()
   ▼
STT → API → display + speech → TTS (opcional) → nextActions / navigation
   ▼
conversa em repouso → detecção religada automaticamente
```

Recurso único: o reconhecedor do sistema é compartilhado entre wake word e STT. O `AssistantProvider`
para a detecção antes de ouvir a pergunta e a religa quando a conversa volta ao repouso
(`READY_PHASES`) — ou durante a fala do ASA quando o barge-in está ligado.

## Overlay vs. experiência completa

- **Overlay (`AssistantOverlay`)**: aparece sobre a tela atual (wake word, toque longo no botão central,
  "Falar agora" na Home, indicador de microfone). Mostra orb + waveform + status, a pergunta em balão,
  a resposta em streaming com cards compactos (até 2 itens, até 3 ações) e a `ChatInputBar` (mic ⇄ enviar).
  "Ver detalhes" leva à aba Assistente **sem perder a conversa** (mesmo provider).
- **Aba Assistente (`AssistantScreen`)**: layout de chat — cabeçalho fixo (Nova conversa · Assistente ASA ·
  resposta por voz), estado vazio com saudação, orb e ações rápidas; conversa com balões do estudante à
  direita e respostas do ASA em texto corrido (streaming) seguidas dos cards inteligentes, recomendações
  com evidências e próximas ações; barra de mensagem fixa embaixo com status da voz e "Parar resposta".
  "Conversas recentes" (histórico local, quando permitido) aparece no estado vazio. Modo "Análise
  completa" continua existindo.
- **Streaming visual**: só a resposta recém-chegada anima (`streamedTurnId`); respostas já presentes ao
  abrir a tela/overlay aparecem completas. Com "Reduzir movimento" o texto aparece de uma vez. Durante a
  revelação, o texto inteiro fica disponível ao leitor de tela (`accessibilityLabel`).

## Contexto enviado à API

```json
{ "inputType": "voice", "text": "qual foi a menor?", "conversationContext": { "lastIntent": "get_assessments" }, "currentScreen": "academic.assessments" }
```

`currentScreen` é apenas contexto de interpretação para perguntas curtas ("e a menor?", "e essa?").
Não define identidade (vem do token), não amplia autorização e é validado por allow-list (`400` fora dela).

## Intenções e ações

| Tipo | Exemplo | O que o app faz |
| --- | --- | --- |
| Consulta/análise | "Como estão minhas notas?" | mostra `display` (cards) e fala `speech`; `nextActions` viram chips |
| `navigation` (intenção `open_screen`) | "Abre minhas notas", "vai para as pendências" | `navigateTo(target)` pela allow-list e recolhe o overlay; fala curta "Claro. Abrindo…" |
| `clientCommand` | "repete", "para de falar", "volta" | executado só no dispositivo |
| Política | "corrige minha nota", "notas do João", "vou reprovar?" | validação humana / recusa / abstenção — nada é executado |

Ações sensíveis (matrícula, pagamento, alteração de registros) **nunca** são executadas pelo app; o
assistente orienta e a decisão continua humana (ver `assistant/privacy.md`).

## Streaming (preparação)

A API responde em uma única mensagem hoje. A arquitetura está pronta para respostas progressivas:
`SendAssistantMessage` é a única fronteira de transporte (`services/assistantService.ts`), o reducer
já separa `understanding → thinking → answering` e a UI revela a resposta por estado. Para SSE/WebSocket
basta um novo transporte que emita `RESPONSE_RECEIVED` ao final (parciais alimentariam `notice`/`partial`).
Na UI, `StreamingText` já aceita texto que **cresce mantendo o prefixo**: só as novas unidades animam,
então tokens parciais de SSE/WebSocket podem ser encaminhados diretamente para a mensagem em exibição.

## Decisões técnicas

- **Animações com `Animated` + `useNativeDriver`** (transform/opacity) em vez de adicionar
  Reanimated/Skia/Lottie: o projeto já usava esse padrão com 60 FPS no orb, funciona no Expo Go, não
  exige plugin Babel/worklets e evita duas arquiteturas de animação paralelas. Tudo respeita
  "Reduzir movimento" (sistema ou preferência).
- **Sem dependências novas** no app: gradientes e brilhos usam `react-native-svg` (já presente);
  wake word usa `expo-speech-recognition` (já presente).
- **Mocks só em testes** (`__tests__/support`): nenhum dado acadêmico fictício vive no app.

Veja também: [`voice.md`](voice.md), [`wake-word.md`](wake-word.md), [`privacy.md`](privacy.md),
[ADR-005](../adr/ADR-005-assistant-experience.md).
