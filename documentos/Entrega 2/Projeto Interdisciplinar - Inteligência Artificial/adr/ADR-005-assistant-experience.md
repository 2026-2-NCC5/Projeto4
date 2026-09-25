# ADR-005 — Nova experiência: Design System (light/dark), assistente global e "Hey Asa"

- **Status:** Aceito
- **Data:** 2026-09-17
- **Relacionado:** [ADR-003](ADR-003-voice-assistant.md), [ADR-004](ADR-004-authentication.md)

## Contexto

O app da Entrega 2 já tinha um assistente por voz funcional, mas como uma aba isolada, com tema fixo
claro e sem ativação por voz. A evolução pedida: identidade visual própria (ASA + FECAP), Light/Dark,
Home centrada no assistente, overlay global, "Hey Asa", contexto conversacional e de tela,
configurações de privacidade e documentação — preservando tudo o que já funcionava.

## Decisões

1. **Design System centralizado** em `src/Entrega 2/Frontend/theme` com tokens semânticos (`brand`, `background`,
   `surface`, `text`, `border`, `status`, `assistant`, `nav`, `control`) e dois temas desenhados
   separadamente. Cores da marca vêm dos SVGs oficiais: verde ASA `#00AB7E`, roxo `#845DF2`, amarelo
   `#FFDE33` (só acento), verde FECAP `#023327`. Preenchimentos com texto usam `primaryStrong`
   (`#008F69`) para contraste ≥ 3:1; o verde vivo fica para brilhos, orb e ícones ativos.
2. **`Animated` + native driver, sem Reanimated/Skia/Lottie.** O orb existente já atingia 60 FPS
   assim, funciona no Expo Go e não exige plugin Babel/worklets. Adicionar Reanimated criaria duas
   arquiteturas de animação paralelas — contra a regra de adaptar ao projeto existente. Toda animação
   respeita "Reduzir movimento".
3. **Sem novas dependências**: gradientes/brilhos em `react-native-svg`; wake word em
   `expo-speech-recognition`; TTS em `expo-speech`.
4. **Navegação local tipada** (`navigation/`) em vez de introduzir react-navigation/Expo Router agora:
   o app não tem deep linking e a migração seria uma reescrita sem benefício imediato. O reducer é
   puro e testado, e a tela atual vira `currentScreen` para o assistente.
5. **Assistente como camada global** (`AssistantProvider` + `AssistantOverlay`) acima das telas; a
   conversa (reducer/controller existentes) foi mantida e estendida (thread, transcript direto,
   navegação, contexto, callbacks de fala).
6. **"Hey Asa" honesto**: reconhecedor do sistema em sessão contínua, só em primeiro plano, opt-in,
   com indicador permanente de microfone; indisponível no Expo Go; background não implementado
   (exigiria serviço nativo). Detalhes em `assistant/wake-word.md`.
7. **Contrato v1.2 (compatível)**: `currentScreen` na requisição, intenção `open_screen` +
   `entities.screen`, `navigation` na resposta, destinos `assistant` e `services`. Interpretação e
   allow-lists continuam na API; o app só executa destinos permitidos.
8. **Privacidade por padrão**: histórico local só texto; telemetria sem conteúdo; permissões pedidas
   após explicação; nada roda em background.

## Alternativas consideradas

| Alternativa | Motivo para não adotar agora |
| --- | --- |
| Reanimated 4 + Worklets | Nova toolchain (plugin Babel, mocks de teste) e duas arquiteturas de animação; ganho de desempenho não necessário para transform/opacity. |
| Motor de wake word nativo (Porcupine) | Licença/custo, módulo nativo e Expo Go incompatível; pode ser plugado no `WakeWordService` no futuro. |
| Escuta em background | Restrições de iOS/Android, bateria e privacidade; fora do escopo sem serviço nativo dedicado. |
| Expo Router | Reescrita da navegação sem deep linking previsto; o reducer tipado atende e é testável. |
| `react-native-gifted-chat` (layout "Chat V1") | Traria uma segunda arquitetura de mensagens (estado próprio, composer próprio) paralela ao reducer/provider existentes e não conhece cards inteligentes, recomendações nem máquina de estados de voz. O layout foi reproduzido com componentes do design system (`ChatBubble`, `ChatInputBar`, `ChatEmptyState`, `StreamingText`). |
| `@shopify/react-native-skia` (fundo radial "Sign Up V1") | Módulo nativo pesado só para um gradiente; `react-native-svg` (já presente) desenha o mesmo radial de 7 paradas (`AuroraBackground`) em iOS, Android e web. |
| `expo-symbols` + fontes proprietárias (SF Pro Rounded, Helvetica Now) | SF Symbols só existem no iOS e as fontes não são licenciadas para distribuição; o app segue com Ionicons e a fonte do sistema (escala dinâmica preservada). |

## Adendo (2026-09-17) — layouts "Chat V1" e "Sign Up V1"

Os padrões visuais de referência foram **adaptados** à arquitetura existente, sem novas dependências:

- **Chat V1 → aba Assistente e overlay**: streaming caractere a caractere com fade (18 ms / 250 ms) via
  `Animated` + native driver (`StreamingText`, por palavra acima de 160 caracteres para manter 60 FPS),
  balões escuros do estudante, resposta do ASA em texto corrido + cards, campo multilinha que cresce até
  5 linhas, botão mic ⇄ enviar (crossfade + escala), ações secundárias e estado vazio com saudação e
  ações rápidas. Todos os rótulos acessíveis e testIDs existentes foram preservados.
- **Sign Up V1 → autenticação**: `AuthShell` com `AuroraBackground` (radial roxo → verde, cores do logo
  ASA, 7 paradas), campos com foco no roxo da marca, botões alternativos no estilo "login social" ligados
  a recursos reais (biometria do aparelho, criar conta), divisor "OU" e tipografia responsiva
  (`useResponsive`). As telas **Criar conta** e **Esqueci minha senha** passaram a existir no app,
  usando os endpoints públicos da API já implementados (`/api/auth/register`, `forgot-password`,
  `verify-reset-code`, `reset-password`) e a política pública (`/api/auth/policy`).
- **Demais telas**: o `Screen` aplica um brilho aurora sutil no topo (opt-out por prop), unificando a
  linguagem visual; tokens novos em `theme/colors.ts` (`chat`, `aurora`) para claro e escuro.

## Adendo (2026-09-17) — Reanimated 4 nas telas públicas e login sem atalhos de demonstração

Por decisão do grupo, as telas **Entrar**, **Criar conta** e **Redefinir senha** passaram a usar
`react-native-reanimated` 4 (+ `react-native-worklets`), revendo parcialmente a decisão 2:

- Escopo: apenas `components/auth/*` e `screens/auth/AuthFlow.tsx` (entrada em cascata com animações de
  layout, borda de foco e "tremor" de erro nos campos, mola de toque nos botões alternativos, medidor de
  força da senha e stepper da redefinição). O restante do app segue com `Animated` + native driver; não
  há duas arquiteturas na mesma tela.
- Toolchain: o `babel-preset-expo` adiciona o plugin de worklets automaticamente; no Jest o módulo
  nativo é substituído por `react-native-worklets/src/mock` + `setUpTests()` (ver `jest.setup.ts`).
- Movimento reduzido: `ReduceMotion.System` mais a preferência "Sempre" do aluno (`useAuthMotion`).
- As telas públicas são sempre claras (`ThemeProvider scheme="light"` no `AuthFlow`); a preferência
  de aparência volta a valer na área autenticada. O logo ASA (branco) fica em bloco verde
  institucional com borda no verde ASA; o logo FECAP fica solto, sem caixa.
- O painel "Ambiente de demonstração" e a variável `EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS` foram removidos:
  as contas fictícias continuam apenas no seed do banco.

## Adendo (2026-09-17) — Tema claro único e responsividade

- **Todas as telas passam a ser claras**, inclusive a experiência do assistente (overlay, hero da Home,
  card "Decisão humana"): `ThemeProvider` aplica sempre `LIGHT_THEME`, `userInterfaceStyle: light` e a
  opção Perfil → Aparência foi removida (a preferência `appearance` continua aceita no armazenamento por
  compatibilidade, sem efeito). Os tokens `assistant.surface/onSurface` do tema claro viraram claros;
  `DARK_THEME` permanece em `colors.ts` só como referência de contraste.
- **Responsividade**: `useResponsive` ganhou `gutter`, `contentMaxWidth` (720 dp em ≥ 600 dp), `columns`
  e `isLandscape`; `Screen` centraliza o conteúdo e escala a margem, `ScreenHeader`/hero escalam o
  título, `StatTile` e atalhos quebram linha em telas estreitas, Serviços usa 2 colunas em tablets,
  `BottomNav` e o overlay do assistente têm largura máxima e o orb do assistente se adapta à paisagem.

## Consequências

- Voz real (STT e "Hey Asa") exige development build; Expo Go segue 100% funcional por texto + TTS.
- Novos testes: máquina de estados, matcher/serviço de wake word, provider (5 casos críticos),
  navegação, tema/contraste; API: `open_screen` e contexto de tela.
- Documentação em `assistant/` e READMEs atualizados.
