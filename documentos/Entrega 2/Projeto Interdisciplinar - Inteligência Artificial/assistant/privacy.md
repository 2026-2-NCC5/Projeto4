# Privacidade, permissões e limites do Assistente ASA

## Princípios

1. **Nada escondido**: sempre que o microfone está capturando (conversa ou "Hey Asa"), o
   `MicrophoneIndicator` aparece no topo de qualquer tela e o overlay mostra "Microfone ativo".
2. **Opt-in**: "Hey Asa" nasce desligado; é ativado após o onboarding e a permissão do sistema.
   Em background a detecção é sempre desligada.
3. **Áudio não é gravado** (`recordingOptions.persist: false`) nem enviado à API: só o texto reconhecido.
4. **Mínimo necessário**: a requisição leva `text`, `conversationContext` (sem histórico) e
   `currentScreen`. Identidade vem do token; `studentId` no corpo é rejeitado (`400`).
5. **Sem alucinação**: a API responde apenas com dados do estudante autenticado; sem dados →
   "Não encontrei essa informação nos seus dados acadêmicos" (`empty`/`not_found`), previsões →
   abstenção, pedidos administrativos → validação humana, outras pessoas/injeção → recusa.
6. **Decisão humana**: matrícula, pagamentos, correções e sanções nunca são executados pelo app; o
   assistente orienta e indica quem pode agir.

## Configurações (Perfil → Assistente ASA)

| Opção | Padrão | Efeito |
| --- | --- | --- |
| Ativação "Hey Asa" | OFF | detecção em primeiro plano (indisponível no Expo Go) |
| Interromper por voz (experimental) | OFF | barge-in por "Hey Asa" durante a fala |
| Resposta por voz | ON | TTS das respostas (texto sempre na tela) |
| Voz | padrão do sistema | voz do TTS entre as instaladas no aparelho |
| Feedback tátil | ON | vibração sutil na ativação/ações |
| Animações | ON | OFF = reduzir movimento (também segue o sistema) |
| Transcrição visível | ON | "Você disse:" |
| Salvar histórico | ON | histórico local (texto, horário, intenção, status); desligar apaga |
| Microfone agora / Permissão / Permissões do sistema | — | status visível e atalho para as configurações do SO |

## Histórico

Fica no aparelho (`AsyncStorage`, chave `asa.assistant.history.v1`), no máximo 60 entradas:
`{ id, conversationId, question, answerTitle, answer, intent, status, createdAt }`. Nunca áudio,
tokens ou dados de terceiros. "Limpar histórico" e o logout/desinstalação removem tudo.

## Telemetria e logs

`features/assistant/services/assistantTelemetry.ts` registra eventos (`assistant_opened`,
`assistant_activation`, `assistant_voice_started`, `assistant_text_sent`, `assistant_response`,
`assistant_action_clicked`, `assistant_navigation`, `assistant_interrupted`, `assistant_error`,
`wake_word_status`, `wake_word_detected`, `microphone_permission`) com identificadores, estados e
durações. Chaves como `text`, `transcript`, `audio`, `token`, `email` são descartadas por construção.
Nenhum sink externo é registrado por padrão. Na API, `assistant_interactions` e os logs guardam apenas
metadados (sem texto/áudio), como já documentado em `architecture/voice-assistant.md`.

## Permissões nativas

Config plugin de `expo-speech-recognition` em `app.json`: iOS `NSMicrophoneUsageDescription` e
`NSSpeechRecognitionUsageDescription`; Android `RECORD_AUDIO` e visibilidade do pacote do serviço de
voz. Nenhuma permissão de background é solicitada.
