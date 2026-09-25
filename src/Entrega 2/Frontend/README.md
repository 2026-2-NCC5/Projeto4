# ASA Conecta — App mobile (Expo)

Aplicativo do estudante: Home personalizada, área acadêmica, **Assistente ASA** (voz + texto, overlay
global e "Hey Asa"), serviços e perfil. Expo SDK 57 · React Native 0.86 · TypeScript · sem chaves no app.

## Pré-requisitos

- Node.js 20+ e npm
- Expo Go para o SDK 57 (texto + TTS) **ou** um development build (voz e "Hey Asa")
- API Node.js rodando (`src/Entrega 2/Backend/api`, porta 3000) — ver README raiz

## Instalação e execução

```bash
cp .env.example .env      # opcional: EXPO_PUBLIC_API_URL=http://<IP-da-máquina>:3000
npm install
npx expo start            # Expo Go / web
```

### Development build (entrada por voz e "Hey Asa")

```bash
npx expo prebuild         # aplica os config plugins (microfone, reconhecimento de fala, biometria)
npx expo run:android      # ou npx expo run:ios
# nuvem: eas build --profile development --platform android
```

## Apontando para a API

1. `EXPO_PUBLIC_API_URL` no `.env` (override explícito);
2. sem a variável, o app usa o host do Metro na porta 3000 (Expo Go no celular alcança a API da mesma máquina);
3. fallback `http://localhost:3000`.

## Contas fictícias

As contas de demonstração vivem apenas no seed do banco (`src/Entrega 2/Backend/database/seeds`) e estão listadas no README
raiz. A tela de login não exibe atalhos nem senhas: entra-se como em produção, com e-mail e senha.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm start` / `npm run android` / `npm run ios` / `npm run web` | Metro / plataformas |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (config Expo + regras React Compiler) |
| `npm test` | Jest (jest-expo) — 20 suítes, 392 testes |
| `npm run doctor` | `expo-doctor` |

## Estrutura

```text
App.tsx                      Preferences → Theme → Session → Navigation → AssistantProvider → telas + BottomNav + overlay
theme/                       Design System: palette (logos), colors (tema claro aplicado; escuro só como referência), typography, spacing, radius, shadows, animations, ThemeProvider (useTheme, makeStyles)
navigation/                  reducer puro + provider tipado (aba, detalhe, tela atual, allow-list → ação)
features/assistant/          state machine da casca, wakeWordMatcher/Service, histórico local, telemetria, useAssistant (provider global)
components/ui/               AppText, AppButton, Surface, GradientSurface, AuroraBackground (radial roxo→verde em SVG), Badge, Avatar, SectionHeader, EmptyState, Skeletons, SettingRow, IconButton, PressableScale, OfflineBanner
components/academic/         StatTile, ScheduleCard, InsightCard, SubjectCard, GradeCard, AttendanceCard, PendingCard
components/assistant/        AssistantOrb, AssistantOverlay, VoiceWaveform, MicrophoneIndicator, HeyAsaOnboarding, AssistantSettingsSection
                             chat (layout "Chat V1"): StreamingText (revelação caractere a caractere), ChatBubble (UserBubble/AssistantMessage/TypingIndicator), ChatInputBar (campo que cresce até 5 linhas, mic ⇄ enviar), ChatEmptyState (saudação + ações rápidas), AssistantTranscript
components/voice/            AsaVoiceOrb, VoiceWave, VoiceButton, VoiceResponse, VoiceStatus, VoiceSuggestions, VoiceTextInput, VoiceTranscript
components/auth/             layout "Sign Up V1": AuthShell (fundo aurora + logos + título responsivo), AuthTextField (foco roxo), AuthDivider ("OU"), AuthAltButton (biometria/criar conta), PasswordRequirements
components/                  Card, Pill, PrimaryButton, ProgressBar, Screen, ScreenHeader, SegmentedControl, StateView, ErrorBanner, análise do agente…
screens/                     Home, Academic, Assistant (chat), Services, Profile, History, RecommendationDetail, RunDetail, Login, SignUp, ForgotPassword, auth/AuthFlow (login ↔ cadastro ↔ recuperação)
hooks/                       useSession, usePreferences, useResource, useAnalysis, useAcademicOverview, useNetworkStatus, useReducedMotion, useResponsive, useAuthPolicy, useVoiceAssistant + voiceAssistantReducer
services/                    apiClient (timeout, refresh, erros normalizados), auth/student/agent/assistant services, voice/ (STT, TTS, háptica), sessionStorage, biometricService
config/                      env (URL da API), services (timeouts, VOICE, WAKE_WORD, HISTORY, rotas)
types/                       api.ts (cópia do contrato), assistant.ts, voice.ts, ui.ts
utils/                       format, greeting (saudação/datas), messages (textos oficiais), authValidation
__tests__/                   Jest + Testing Library (fakes de voz/wake word em support/)
```

## Design System

- Tokens semânticos em `theme/colors.ts` (`brand`, `background`, `surface`, `text`, `border`, `status`,
  `assistant`, `nav`, `control`, `skeleton`) com **Light e Dark projetados separadamente**. Cores da marca
  extraídas dos SVGs oficiais em `assets/branding` (verde ASA `#00AB7E`, roxo `#845DF2`, amarelo
  `#FFDE33`, verde FECAP `#023327`). Preenchimentos com texto usam `brand.primaryStrong` (contraste ≥ 3:1).
- Tipografia única (`display`, `h1`–`h4`, `body`, `bodySmall`, `caption`, `label`, `mono`, `button`,
  `input`, `metric`), raios (`xs`–`xxxl`, `pill`), sombras (`sm`/`md`/`lg`/`nav`/`assistantGlow`) e
  vocabulário de movimento (`motion`).
- Uso: `const theme = useTheme()` ou `const useStyles = makeStyles((theme) => ({ ... }))` (cache por tema).
- Tema sempre claro (`ThemeProvider` ignora o esquema do sistema; `userInterfaceStyle: light` no `app.json`); não há mais a opção Perfil → Aparência.
- Responsividade: `hooks/useResponsive.ts` (escala 0.86–1.12, `gutter`, `contentMaxWidth` 720 em tablets/paisagem, `columns`); `Screen` centraliza o conteúdo, `StatTile`/atalhos quebram linha em telas estreitas, Serviços em 2 colunas em tablets, BottomNav e overlay do assistente com largura máxima.
- Animações com `Animated` + `useNativeDriver` (transform/opacity) na área autenticada; as telas públicas
  (entrar, criar conta, redefinir senha) usam **Reanimated 4** (`components/auth/authMotion.ts`: entrada em
  cascata, foco dos campos, medidor de senha, stepper) e são sempre exibidas no tema claro. Tudo respeita
  "Reduzir movimento" (`ReduceMotion.System` + preferência do aluno).

## Assistente ASA

Documentação completa em [`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/`](<../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/architecture.md>). Resumo:

- **Acesso**: Home ("Falar agora"/"Digitar"), botão central (toque = abrir; toque longo = falar), overlay
  sobre qualquer tela, indicador de microfone e a frase **"Hey Asa"** (primeiro plano, opt-in).
- **Estados** (derivados): `idle`, `wake-word-listening`, `activating`, `listening`, `processing`,
  `thinking`, `speaking`, `interrupted`, `error`, `offline` — sempre com texto e rótulo acessível.
- **Conversa**: uma única função de envio para voz e texto; contexto (`conversationContext`) e tela
  (`currentScreen`) enviados à API; `nextActions`, `navigation` (intenção `open_screen`) e
  `clientCommand` executados no app somente para destinos da allow-list.
- **Voz**: STT `expo-speech-recognition` (development build/web), TTS `expo-speech` (Expo Go também),
  barge-in por toque (e por voz, experimental).

### Onde a voz funciona

| Ambiente | Texto + TTS | Entrada por voz | "Hey Asa" |
| --- | --- | --- | --- |
| Expo Go (Android/iOS) | ✓ | ✗ — "No Expo Go o reconhecimento de voz exige um development build." | ✗ |
| Development build (Android/iOS) | ✓ | ✓ | ✓ (primeiro plano) |
| Web (Chrome, Edge, Safari) | ✓ | ✓ via Web Speech API | ✓ (Chrome/Edge) |
| Web (Firefox) | ✓ | ✗ | ✗ |

### Variáveis

| Variável | Padrão | Uso |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | (derivada do Metro) | URL da API |
| `EXPO_PUBLIC_API_TIMEOUT_MS` / `EXPO_PUBLIC_ANALYSIS_TIMEOUT_MS` / `EXPO_PUBLIC_ASSISTANT_TIMEOUT_MS` | 10000 / 15000 / 15000 | timeouts |
| `EXPO_PUBLIC_VOICE_ASSISTANT_ENABLED` | `true` | modo "Conversar" |
| `EXPO_PUBLIC_SPEECH_PROVIDER` | `device` | `device` / `none` |
| `EXPO_PUBLIC_SPEECH_LANGUAGE` | `pt-BR` | STT/TTS |
| `EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY` | `false` | reconhecimento só no aparelho |
| `EXPO_PUBLIC_TTS_ENABLED_DEFAULT` | `true` | valor inicial de "Resposta por voz" |
| `EXPO_PUBLIC_WAKE_WORD_ENABLED` | `true` | disponibiliza o "Hey Asa" (preferência do aluno nasce desligada) |
| `EXPO_PUBLIC_BARGE_IN_ENABLED` | `true` | disponibiliza "Interromper por voz" (opt-in) |

Limites em `config/services.ts` (`VOICE`, `WAKE_WORD`, `HISTORY`). Nenhuma chave ou segredo no app.

### Privacidade e permissões

- Áudio **não é gravado nem enviado** (`recordingOptions.persist: false`); só o texto vai à API.
- Permissão de microfone pedida apenas ao tocar no microfone ou ao ativar o "Hey Asa" após o onboarding;
  negar mantém o app funcional por texto.
- "Hey Asa": só em primeiro plano; em background o microfone é desligado; indicador visível sempre que a
  captura está ativa. Detalhes em [`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/privacy.md`](<../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/privacy.md>).
- Preferências em `AsyncStorage` (`asa.preferences.v2`); histórico local (só texto) em `asa.assistant.history.v1`.

## Sessão e segurança

Access token só em memória; refresh token no `expo-secure-store` apenas com "Manter conectado"; web nunca
persiste tokens; senha nunca é gravada. Biometria emite uma credencial de dispositivo revogável
(ver `documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/authentication.md`).

## Contrato Mobile ↔ API

`types/api.ts` deve ser idêntico a `src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts` (v1.2):

```bash
cp ../Backend/contracts/api/mobile-api.v1.ts types/api.ts
../Backend/scripts/check-contracts-sync.sh
```

## Limitações conhecidas

- "Hey Asa" não roda em background nem no Expo Go (decisão documentada em `documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/wake-word.md`).
- Barge-in por voz depende do cancelamento de eco do aparelho (experimental, desligado por padrão).
- Sem streaming da API ainda (arquitetura preparada; ver `documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/architecture.md`).
- Compromissos, avisos e "Para você" são derivados dos dados reais da API (pendências, avaliações,
  última análise); não existe endpoint de horários de aula/salas nem de notificações institucionais.
- Sem deep linking; navegação por estado local tipado.
