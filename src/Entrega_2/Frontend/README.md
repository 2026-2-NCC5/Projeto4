# ASA Conecta — App mobile (Expo)

Aplicativo do estudante: Home personalizada, área acadêmica, **Assistente ASA** (voz + texto, overlay
global e "Hey Asa"), serviços e perfil. Expo SDK 57 · React Native 0.86 · TypeScript · sem chaves no app.

## Pré-requisitos

- Node.js 20+ e npm
- Expo Go para o SDK 57 (texto + TTS) **ou** um development build (voz e "Hey Asa")
- API Node.js rodando (`src/Entrega_2/Backend/api`, porta 3000) — ver README raiz

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

As contas de demonstração vivem apenas no seed do banco (`src/Entrega_2/Backend/database/seeds`) e estão listadas no README
raiz. A tela de login não exibe atalhos nem senhas: entra-se como em produção, com e-mail e senha.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm start` / `npm run android` / `npm run ios` / `npm run web` | Metro / plataformas |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (config Expo + regras React Compiler) |
| `npm test` | Jest (jest-expo) — 32 suítes, 488 testes |
| `npm run doctor` | `expo-doctor` |

## Estrutura

```text
App.tsx                      Preferences → Theme → Session → Navigation → AssistantProvider → telas + BottomNav + overlay
theme/                       Design System: palette (logos), colors (tema claro aplicado; escuro só como referência), typography, spacing, radius, shadows, animations, ThemeProvider (useTheme, makeStyles)
navigation/                  reducer puro + provider tipado (aba, detalhe, tela atual, allow-list → ação)
features/assistant/          state machine da casca, wakeWordMatcher/Service, histórico local, telemetria, useAssistant (provider global)
features/support/            Atendimento ASA: api (HTTP + demonstração), hooks (cache SWR, lista paginada, detalhe, ações otimistas, abertura com rascunho, anexos), labels, progress, format, motion (Reanimated)
components/ui/               AppText, AppButton, Surface, List/ListItem, Divider, Badge, Avatar, SectionHeader, EmptyState, Skeletons, SettingRow, IconButton, PressableScale, OfflineBanner
components/academic/         MetricStrip, UpcomingList, InsightList, SubjectCard, GradeRow, AttendanceRow, PendingRow
components/assistant/        AssistantOrb, AssistantOverlay, VoiceWaveform, MicrophoneIndicator, HeyAsaOnboarding, AssistantSettingsSection
                             chat (layout "Chat V1"): StreamingText (revelação caractere a caractere), ChatBubble (UserBubble/AssistantMessage/TypingIndicator), ChatInputBar (campo que cresce até 5 linhas, mic ⇄ enviar), ChatEmptyState (saudação + ações rápidas), AssistantTranscript
components/voice/            AsaVoiceOrb, VoiceWave, VoiceResponse, VoiceStatus, VoiceSuggestions, voiceModes (rótulos do botão de voz)
components/tickets/          Atendimento: TicketStatusBadge, FilterChips, SearchField, StepIndicator, SelectRow, TicketRow, TicketSummaryCard, TicketProgress, TicketTimeline, TicketMessages, TicketComposer, AttachmentItems, TicketStatusCards, TicketRating, BottomSheet, AnimatedCheck, Appear, SupportNotice, TicketEmptyState
components/auth/             AuthShell (logos + título responsivo), AuthTextField (foco verde), AuthDivider ("ou"), AuthAltButton (biometria), AuthStepper, PasswordRequirements
components/                  BottomNav, Screen, ScreenHeader, SegmentedControl, ProgressBar, InfoRow, StateView, ErrorBanner, análise do agente…
screens/                     Home, Academic, Assistant (chat), Services, Profile, History, RecommendationDetail, RunDetail, Login, SignUp, ForgotPassword, auth/AuthFlow (login ↔ cadastro ↔ recuperação)
screens/support/             Atendimento (hub), Meus chamados, Abrir chamado, Detalhe do chamado, SupportHomeSection (Home/Avisos), SupportRouter
hooks/                       useSession, usePreferences, useResource, useAnalysis, useAcademicOverview, useNetworkStatus, useReducedMotion, useResponsive, useAuthPolicy, useVoiceAssistant + voiceAssistantReducer
services/                    apiClient (timeout, refresh, erros normalizados), auth/student/agent/assistant services, voice/ (STT, TTS, háptica), sessionStorage, biometricService
config/                      env (URL da API), services (timeouts, VOICE, WAKE_WORD, HISTORY, rotas)
types/                       api.ts (cópia do contrato), assistant.ts, voice.ts, ui.ts
utils/                       format, greeting (saudação/datas), messages (textos oficiais), authValidation
__tests__/                   Jest + Testing Library (fakes de voz/wake word em support/)
```

## Design System

- Tokens semânticos em `theme/colors.ts` (`brand`, `background`, `surface`, `text`, `border`, `status`,
  `assistant`, `nav`, `control`, `skeleton`, `chat`) com **Light e Dark projetados separadamente**. Fundos e
  textos são neutros (cinzas frios, sem matiz verde); o verde marca só ação e seleção.
- Verde institucional `brand.primaryStrong` (`#0D6D53`, mesmo matiz do logo, 6,3:1 com texto branco) em
  botão principal, item ativo, links e progresso saudável. O verde do logo (`#00AB7E`) fica restrito à marca;
  verde FECAP (`#023327`) só no bloco do logo ASA. Sem gradientes, brilhos ou sombras coloridas.
- Tipografia única (`display`, `h1`–`h4`, `body`, `bodySmall`, `caption`, `label`, `tab`, `mono`, `button`,
  `input`, `metric`) com peso 700 só em títulos de tela; raios `xs` 4 · `sm` 6 · `md` 10 (botões, campos) ·
  `lg` 12 (cards) · `xl` 16 (folhas) · `pill`; sombras neutras `sm`/`md`/`lg` (só no que flutua); espaçamento
  base 4; movimento de 150–250 ms sem rebote (`motion`).
- Composição: `Surface` é o card padrão (branco, borda de 1 px, sem sombra). Informações da mesma natureza
  ficam num único `List` com divisores (`ListItem`, `GradeRow`, `AttendanceRow`, `PendingRow`) em vez de um
  card por item; ícones são Ionicons simples de 20 px (sem círculos coloridos); status usa `Badge` com ícone
  e texto (nunca só cor). Uma ação principal por tela.
- Uso: `const theme = useTheme()` ou `const useStyles = makeStyles((theme) => ({ ... }))` (cache por tema).
- Tema sempre claro (`ThemeProvider` ignora o esquema do sistema; `userInterfaceStyle: light` no `app.json`); não há mais a opção Perfil → Aparência.
- Responsividade: `hooks/useResponsive.ts` (escala 0.86–1.12, `gutter`, `contentMaxWidth` 720 em tablets/paisagem, `columns`); `Screen` centraliza o conteúdo e reserva a altura da barra inferior fixa (`hooks/useNavBarInset.ts`, inclui a área segura); ações rápidas do assistente em 1 coluna em telas estreitas; overlay do assistente com largura máxima.
- Animações com `Animated` + `useNativeDriver` (transform/opacity) na área autenticada; as telas públicas
  (entrar, criar conta, redefinir senha) usam **Reanimated 4** (`components/auth/authMotion.ts`: entrada em
  cascata, foco dos campos, medidor de senha, stepper) e são sempre exibidas no tema claro. Tudo respeita
  "Reduzir movimento" (`ReduceMotion.System` + preferência do aluno).

## Assistente ASA

Documentação completa em [`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/`](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/architecture.md>). Resumo:

- **Acesso**: Home (linha do assistente + botão de microfone), botão central (toque = abrir; toque longo = falar), overlay
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
| `EXPO_PUBLIC_USE_MOCK_TICKETS` | `false` | chamados de demonstração no app (sem a API de chamados) |
| `EXPO_PUBLIC_USE_MOCK_QUEUE` | `false` | fila presencial simulada no app (sem a API da fila) |

Limites em `config/services.ts` (`VOICE`, `WAKE_WORD`, `HISTORY`). Nenhuma chave ou segredo no app.

### Privacidade e permissões

- Áudio **não é gravado nem enviado** (`recordingOptions.persist: false`); só o texto vai à API.
- Permissão de microfone pedida apenas ao tocar no microfone ou ao ativar o "Hey Asa" após o onboarding;
  negar mantém o app funcional por texto.
- "Hey Asa": só em primeiro plano; em background o microfone é desligado; indicador visível sempre que a
  captura está ativa. Detalhes em [`documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/privacy.md`](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/privacy.md>).
- Preferências em `AsyncStorage` (`asa.preferences.v2`); histórico local (só texto) em `asa.assistant.history.v1`.

## Atendimento ASA (chamados)

Serviços → **Atendimento**: abrir chamado em etapas (categoria → detalhes → anexos → revisão → protocolo), "Meus
chamados" com filtros, busca e paginação, e o detalhe com progresso, prazo, histórico, mensagens, arquivos,
resolução, avaliação, reabertura e cancelamento. A Home mostra um card só quando há um chamado relevante e os
avisos não lidos entram em Serviços → Avisos.

- Dados da API (`/api/support/*`, contrato v1.3); `EXPO_PUBLIC_USE_MOCK_TICKETS=true` usa chamados de demonstração
  no próprio app.
- Atualização a cada 30 s no detalhe e 60 s na lista (só em primeiro plano) + pull-to-refresh; cache local por
  usuário (`asa.support.cache.v1:*`) para abrir na hora e funcionar offline; rascunho da abertura em
  `asa.support.draft.v1:<usuário>`.
- Anexos: `expo-document-picker` + `expo-file-system` (PDF, imagem, DOC, TXT até 5 MB); "Copiar protocolo" com
  `expo-clipboard`. Os três funcionam no Expo Go.
- Animações com Reanimated 4 via `features/support/motion.ts`, todas respeitando "Reduzir movimento".

Detalhes: [`architecture/support-tickets.md`](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/support-tickets.md>) e
[ADR-006](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/adr/ADR-006-support-tickets.md>).

## Fila presencial do ASA

Serviços → **Fila presencial** (também em Atendimento e pelo assistente: "abre a fila do ASA"): o aluno informa
a senha que retirou no ASA e o app mostra a senha em atendimento por mesa, as últimas chamadas, quantas pessoas
estão à frente (só quando o painel informa), uma estimativa aproximada e o andamento. A Home mostra um card só
enquanto há uma senha acompanhada.

- O app nunca consulta `presencial.fecap.br`: o backend monitora a fonte e envia **push** (app fechado) e eventos
  em tempo real por SSE (app aberto; polling de 15 s só como plano B, só em primeiro plano).
- Alertas progressivos (5 à frente, 3 à frente, próxima, chamada) sem repetição: aviso no topo, modal
  "É a sua vez!", vibração (`expo-haptics`) e a voz do ASA IA pelo mesmo TTS do assistente; o aluno controla
  notificação, vibração e voz. Leitor de tela e "Reduzir movimento" são respeitados.
- Push: `expo-notifications`; a permissão é pedida só depois que o aluno começa a acompanhar uma senha. Exige
  build com projeto EAS (`extra.eas.projectId`) — no Expo Go/web os avisos aparecem só com o app aberto. Toque
  na notificação ou link `asaconecta://atendimento/fila` abre a fila.
- `EXPO_PUBLIC_USE_MOCK_QUEUE=true` simula a fila no aparelho; em desenvolvimento a tela tem o painel
  "Simulação" (cenários relativos à senha 0029).

Detalhes: [`architecture/queue-presencial.md`](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/queue-presencial.md>) e
[ADR-007](<../../../documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/adr/ADR-007-queue-presencial.md>).

## Sessão e segurança

Access token só em memória; refresh token no `expo-secure-store` apenas com "Manter conectado"; web nunca
persiste tokens; senha nunca é gravada. Biometria emite uma credencial de dispositivo revogável
(ver `documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/architecture/authentication.md`).

## Contrato Mobile ↔ API

`types/api.ts` deve ser idêntico a `src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts` (v1.2):

```bash
cp ../Backend/contracts/api/mobile-api.v1.ts types/api.ts
../Backend/scripts/check-contracts-sync.sh
```

## Limitações conhecidas

- "Hey Asa" não roda em background nem no Expo Go (decisão documentada em `documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/wake-word.md`).
- Barge-in por voz depende do cancelamento de eco do aparelho (experimental, desligado por padrão).
- Sem streaming da API ainda (arquitetura preparada; ver `documentos/Entrega_2/Projeto_Interdisciplinar_Inteligencia_Artificial/assistant/architecture.md`).
- Compromissos, avisos e "Para você" são derivados dos dados reais da API (pendências, avaliações,
  última análise); não existe endpoint de horários de aula/salas nem de notificações institucionais.
- Sem deep linking; navegação por estado local tipado.
