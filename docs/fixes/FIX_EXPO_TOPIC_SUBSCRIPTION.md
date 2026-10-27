# ASA Conecta — correção de `ExpoTopicSubscriptionModule`

## Diagnóstico

- **Erro:** `Cannot find native module 'ExpoTopicSubscriptionModule'` durante a inicialização Android no Expo Go.
- **Pacote responsável:** `expo-notifications@57.0.23`; o arquivo `build/TopicSubscriptionModule.android.js` executa `requireNativeModule('ExpoTopicSubscriptionModule')`. O ponto de entrada do pacote exporta a API de tópicos, levando o Metro a avaliar esse módulo quando o pacote é importado.
- **Versão do pacote verificada:** `57.0.23` (a alteração local já existente antes desta tarefa). A versão anterior `57.0.22` também contém o mesmo módulo, portanto apenas trocar essas duas versões não resolve a falta do módulo nativo.
- **Expo SDK:** `57.0.0` (`expo@57.0.30`). **React Native:** `0.86.3`. **React:** `19.2.3`. **Node/npm:** `v26.10.0` / `12.1.0`.
- **Ambiente afetado:** Expo Go Android. A API de push remoto não está disponível no Expo Go desde SDK 53; ela exige um development build com os módulos nativos da aplicação.
- **Causa raiz:** código JavaScript do `expo-notifications` tenta resolver um módulo que não está registrado no binário Expo Go. A proteção anterior com `try/catch` não alcançava a falha porque a importação estática carregava o módulo antes de chamar as funções protegidas.

## Solução

- `features/dynamicNotifications/nativeNotifications.ts` identifica Expo Go antes de avaliar `expo-notifications`. No Expo Go, retorna indisponível sem tocar no módulo nativo; em builds próprios, carrega a API normalmente.
- Os roteadores de pushes da central, de chamados e da fila agora usam esse carregador protegido. A aplicação e as telas continuam utilizáveis no Expo Go, mas notificações push ficam indisponíveis nesse runtime.
- A integração visual do repositório `rit3zh/expo-dynamic-notifications` mostra pushes em primeiro plano em um cartão animado e encaminha o toque ao destino correspondente. Pushes da fila preservam o alerta já existente.
- O handler deixa o banner de sistema oculto enquanto o app está aberto para evitar duplicar o overlay; a notificação continua na lista do Android, com som conforme o fluxo anterior.
- `expo-dev-client` e `npm run android:dev` habilitam uma development build local. As dependências do overlay foram instaladas nas versões compatíveis com SDK 57 usando `npx expo install`.
- `app.json` migrou a configuração de splash para o plugin `expo-splash-screen`, mantendo o fundo `#023327`; a configuração `newArchEnabled` foi removida porque o schema SDK 57 a rejeitava (a arquitetura nova é o padrão do SDK). O plugin `expo-image` também foi registrado.

## Arquivos alterados

- `src/Entrega_2/Frontend/App.tsx`
- `src/Entrega_2/Frontend/app.json`
- `src/Entrega_2/Frontend/package.json` e `package-lock.json`
- `src/Entrega_2/Frontend/jest.setup.ts`
- `src/Entrega_2/Frontend/features/notifications/push.ts`
- `src/Entrega_2/Frontend/features/support/push.ts`
- `src/Entrega_2/Frontend/features/queue/services/pushNotifications.ts`
- `src/Entrega_2/Frontend/features/dynamicNotifications/` (componentes, animações, bridge, README e licença)
- `src/Entrega_2/Frontend/__tests__/nativeNotifications.test.ts`

## Validação

- `npm run typecheck` — passou.
- `npm run lint` — passou sem erros; permanecem seis avisos preexistentes de tipagem em `types/api.ts`.
- `npm test -- --runInBand --silent` — passou: 43 suítes, 565 testes.
- `npx expo install --check` — passou; dependências compatíveis.
- `npx expo-doctor@latest` — passou: 21/21 verificações.
- `npx expo export --platform android --clear` — passou; Metro gerou o bundle Android (1.498 módulos) sem o erro original.
- **Validação em aparelho/emulador:** não executada; `adb devices -l` não listou dispositivos conectados. A exportação Android valida o bundle, mas não substitui a abertura do app num Android.

## Prevenção

- Instale pacotes Expo com `npx expo install <pacote>` e confirme com `npx expo install --check` e `npx expo-doctor`.
- Use Expo Go para prévias que não dependam de código nativo personalizado. Para push remoto, use o app ASA Conecta compilado com `npm run android:dev`.
- Ao atualizar `expo-notifications`, revise as importações de módulos nativos e valide o runtime de destino, não apenas o bundle Metro.

## Resultado

**Status:** corrigido no caminho de inicialização e validado por bundle, verificações estáticas e testes automatizados. A validação física Android permanece pendente por falta de dispositivo conectado.
