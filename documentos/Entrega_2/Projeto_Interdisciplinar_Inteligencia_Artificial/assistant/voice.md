# Voz: Speech-to-Text, Text-to-Speech e sessão de voz

## Camadas desacopladas (`VoiceService`)

| Interface | Implementação | Arquivo |
| --- | --- | --- |
| `SpeechRecognitionService` (STT, uma fala por vez) | `expo-speech-recognition` (Android/iOS nativo; Web Speech API no navegador) ou `unavailable` | `services/voice/expoSpeechRecognitionAdapter.ts`, `speechRecognition.ts`, `unavailableSpeechRecognition.ts` |
| `WakeWordService` (STT contínuo só para "Hey Asa") | mesmo módulo nativo, sessão `continuous: true` | `features/assistant/services/wakeWordService.ts` |
| `SpeechSynthesisService` (TTS) | `expo-speech` (funciona no Expo Go) | `services/voice/speechSynthesis.ts` |
| `HapticsService` | `expo-haptics` (no-op no web) | `services/voice/haptics.ts` |
| Gerente da sessão | `VoiceAssistantController` (fora do React) + `AssistantProvider` (posse do microfone) | `hooks/useVoiceAssistant.tsx`, `features/assistant/hooks/useAssistant.tsx` |

A UI nunca fala com módulos nativos: tudo passa por essas interfaces, o que permite injetar fakes nos
testes (`__tests__/support/voiceFakes.ts`).

## Onde funciona

| Ambiente | Texto + TTS | STT (toque para falar) | "Hey Asa" |
| --- | --- | --- | --- |
| Expo Go (Android/iOS) | ✅ | ❌ (sem módulo nativo; o app avisa) | ❌ |
| Development build / EAS (`npx expo run:android`, `npx expo run:ios`, `eas build --profile development`) | ✅ | ✅ | ✅ (primeiro plano) |
| Web (Chrome, Edge, Safari) | ✅ | ✅ (Web Speech API) | ✅ (Chrome/Edge; Safari pode encerrar sessões contínuas) |
| Web (Firefox) | ✅ | ❌ | ❌ |

O app detecta a ausência do módulo nativo com `requireOptionalNativeModule` e nunca finge disponibilidade.

## Máquina de estados da conversa (inalterada, estendida)

```text
idle ─LISTEN_REQUESTED→ listening ─SPEECH_ENDED→ transcribing ─TRANSCRIPT_READY→ understanding
     ─TEXT_SUBMITTED→ understanding ─THINKING_DELAY_ELAPSED→ thinking ─RESPONSE_RECEIVED→ answering | idle | abstained | human_validation
answering ─SPEECH_DONE/STOP_SPEAKING→ repouso · REQUEST_FAILED/RECOGNITION_FAILED → error · CANCEL → repouso
```

Novidades: `thread` (turnos da sessão para o transcript), `conversationId` (agrupa o histórico),
`submitTranscript()` (comando dito junto com "Hey Asa"), `getCurrentScreen` (contexto),
`onNavigate` (intenção `open_screen`), `onSpeakingChange` (pausa/retoma o wake word).

## Interrupção (barge-in)

- **Por toque**: tocar no microfone (ou "Parar resposta") durante a fala para o TTS e abre a escuta.
- **Por voz (experimental, opt-in)**: com "Interromper por voz" ligado, a detecção de "Hey Asa"
  continua durante a fala do ASA. Detectar → `interrupted` → TTS parado → escuta. Transcrições que
  são trechos da própria fala do ASA (`looksLikeEcho`) são descartadas. Depende do cancelamento de eco
  do aparelho; por isso é experimental e nasce desligado.

## Respostas curtas por voz

`speech.text` vem da API já resumido (`limitSpeech`, ~320 caracteres) — o TTS nunca lê a tela inteira.
O texto completo, itens e recomendações ficam na interface.

## Voz do TTS

Perfil → Assistente ASA → **Voz** lista as vozes instaladas no aparelho para o idioma
(`Speech.getAvailableVoicesAsync`). A escolha fica em `preferences.ttsVoiceId` e é aplicada por
`setPreferredVoice()`; `null` usa a voz padrão do idioma.

## Variáveis (app)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `EXPO_PUBLIC_VOICE_ASSISTANT_ENABLED` | `true` | modo "Conversar" |
| `EXPO_PUBLIC_SPEECH_PROVIDER` | `device` | `device` / `none` |
| `EXPO_PUBLIC_SPEECH_LANGUAGE` | `pt-BR` | STT e TTS |
| `EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY` | `false` | força reconhecimento local |
| `EXPO_PUBLIC_TTS_ENABLED_DEFAULT` | `true` | valor inicial de "Resposta por voz" |
| `EXPO_PUBLIC_ASSISTANT_TIMEOUT_MS` | `15000` | timeout de `POST /api/assistant/message` |
| `EXPO_PUBLIC_WAKE_WORD_ENABLED` | `true` | disponibiliza o "Hey Asa" (a preferência do aluno decide se roda) |
| `EXPO_PUBLIC_BARGE_IN_ENABLED` | `true` | disponibiliza "Interromper por voz" (opt-in do aluno) |

Nenhuma chave de provedor é necessária; nada sensível fica no app.
