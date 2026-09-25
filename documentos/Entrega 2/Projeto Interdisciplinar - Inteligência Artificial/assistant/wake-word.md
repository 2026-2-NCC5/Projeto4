# "Hey Asa" — ativação por voz

## O que é (e o que não é)

Não existe um motor de *wake word* (Porcupine, Snowboy, etc.) disponível no Expo sem módulo nativo
próprio ou licença. **Não implementamos uma detecção falsa.** A ativação usa o **reconhecedor de fala do
sistema** (Google no Android, Apple no iOS, Web Speech API no navegador) em sessão contínua, com estas
consequências reais:

| Tema | Realidade | Como o app lida |
| --- | --- | --- |
| Expo Go | módulo nativo ausente | detecção **indisponível**; o app diz isso e mantém botão + texto |
| Background | iOS/Android não permitem escuta contínua de apps em segundo plano sem justificativa/serviço específico; Web Speech para quando a aba perde foco | a detecção **só roda em primeiro plano**; `AppState` ≠ `active` desliga o microfone imediatamente |
| Bateria/dados | o serviço do sistema pode usar rede e consome bateria | opção **desligada por padrão**; sessão reciclada a cada 55 s; desligue quando quiser |
| Privacidade | o serviço de voz do fabricante pode processar áudio em servidores | onboarding explica antes de pedir permissão; indicador visível sempre que o microfone está ativo; `EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY=true` força reconhecimento local |
| Silêncio | o reconhecedor encerra sozinho após alguns segundos sem fala | religamos após 350 ms; erros `no-speech` não contam como falha |
| Falhas | rede indisponível, serviço ocupado | após 4 falhas seguidas a detecção para com status `error` e o app volta ao botão |
| Recurso único | o mesmo reconhecedor serve a conversa | detecção pausa durante a escuta/fala e religa quando a conversa volta ao repouso |

## Modos

1. **Primeiro plano** (implementado): com a opção ligada e permissão concedida, dizer "Hey Asa" abre o
   overlay e começa a ouvir. Se a frase já trouxer o pedido ("Hey Asa, qual minha próxima aula?"), o
   comando é enviado direto (`inputType: 'voice'`).
2. **Background** (não implementado, por decisão): exigiria serviço nativo (Android Foreground Service
   com notificação persistente; iOS não oferece API pública para wake word em background). Documentado
   como pendência para um módulo nativo/config plugin futuro.
3. **Fallback** (sempre disponível): botão central da navegação (toque = abrir; toque longo = falar
   agora), "Falar agora"/"Digitar" na Home, campo de texto em todo lugar.

## Detecção

`features/assistant/services/wakeWordMatcher.ts`:

- normaliza (minúsculas, sem acentos/pontuação);
- aceita `WAKE_WORD.PHRASES` (`hey asa`, `ei asa`, `ok asa`, `oi asa`, variações fonéticas `aza/assa/aça`)
  e o padrão genérico prefixo + "asa" fonético;
- **não** ativa com "asa" isolada ("a asa do avião", "o ASA Conecta");
- devolve `remainder` (comando dito na sequência) — `isDirectCommand` exige ≥ 2 palavras;
- `looksLikeEcho(transcript, textoFalado)` descarta trechos do próprio TTS.

`features/assistant/services/wakeWordService.ts`: sessão contínua (`continuous: true`, sem eventos
de volume, sem pontuação), reinício após `end`/`no-speech`, reciclagem por `MAX_SESSION_MS`,
`COOLDOWN_MS` contra disparo duplo (parcial + final), parada imediata ao detectar (libera o recurso).

## Ciclo de vida (`AssistantProvider`)

```text
shouldListen = feature habilitada ∧ preferência "Hey Asa" ∧ app em primeiro plano ∧ disponível
             ∧ permissão concedida ∧ sem ativação em curso ∧ (conversa em repouso ∨ (falando ∧ barge-in))
```

Quando `shouldListen` muda: `start()` ou `stop()`. O status vai para a casca
(`off | starting | listening | paused | unavailable | error`) e alimenta o `MicrophoneIndicator`.

## Primeira ativação e permissões

```text
Perfil/Home → "Ativar Hey Asa"
   → onboarding "Conheça o Hey Asa" (2 passos: o que é · como o microfone é usado)
   → aceitar → permissão do sistema → concedida → ligado
                                     → negada   → continua por texto e botão (nada quebra)
   → "Agora não" → tudo continua funcionando por texto e botão
```

A permissão nunca é pedida na abertura do app nem sem explicação.

## Configuração

`config/services.ts → WAKE_WORD`: `FEATURE_ENABLED` (`EXPO_PUBLIC_WAKE_WORD_ENABLED`), `ENABLED_DEFAULT`
(`false`), `PHRASES`, `RESTART_DELAY_MS` (350), `RETRY_DELAY_MS` (1500), `MAX_CONSECUTIVE_FAILURES` (4),
`COOLDOWN_MS` (2500), `MAX_SESSION_MS` (55000), `ACTIVATION_MS` (420), `BARGE_IN_FEATURE_ENABLED`.

## Testes

`__tests__/wakeWord.test.ts` (matcher e serviço com módulo nativo simulado) e
`__tests__/AssistantProvider.test.tsx` (Hey Asa → listening; microfone negado; API fora; `open_screen`;
barge-in; background; eco; onboarding; fechar overlay).
