# ADR-003 — Assistente por voz como interface do Agente para o Estudante

- **Status:** Aceito
- **Data:** 2026-09-16
- **Relacionado:** [ADR-001](ADR-001-agent-selection.md), [ADR-002](ADR-002-stack-contracts-and-error-policy.md)

## Contexto

O estudante precisa consultar sua situação acadêmica falando em linguagem natural, com
resposta visual e, opcionalmente, falada. O MVP continua tendo **um único agente**
(TASK-001) e não pode depender de LLM ou de provedor pago (TASK-004 §55-56).

## Decisões

1. **Não é um segundo agente.** A voz é uma interface: `texto → intenção → consulta
   objetiva OU Agente para o Estudante → resposta estruturada`. Recomendações, evidências,
   próxima ação, abstenção e validação humana continuam vindo do Agent Engine Python.
2. **Interpretação no Node.js, por regras determinísticas pt-BR** (`src/Entrega 2/Backend/api/src/assistant/`).
   Qualquer interpretador (inclusive um LLM futuro) devolve um objeto **não confiável**, que só é
   usado após `validateInterpretation`: schema estrito → allow-list de intenções → disciplina precisa
   pertencer ao estudante → confiança mínima (`INTENT_MIN_CONFIDENCE`).
3. **Consulta ≠ recomendação.** "Qual minha próxima prova?" lê dados (services). "Tem alguma matéria
   que merece atenção?" executa o Agente (`run_student_analysis`), persistindo `agent_runs`.
4. **Identidade só pela sessão.** O corpo não aceita `studentId`; frases sobre outra pessoa ou de
   injeção ("ignore as regras") são recusadas (`access_other_student`), e mesmo que não fossem, todos
   os responders usam exclusivamente o estudante da sessão.
5. **Pedidos administrativos nunca são executados** (`administrative_request` → `human_validation`).
   O assistente não tem acesso a repositórios de escrita acadêmica.
6. **Speech-to-Text no dispositivo, sem chaves no app:** `expo-speech-recognition@57.1.0` (alinhado ao Expo SDK 57),
   que usa o reconhecedor do sistema (Android/iOS) ou a Web Speech API no navegador. `persist: false`:
   o áudio não é gravado; apenas o texto chega à API.
7. **Expo Go continua funcionando.** O módulo nativo de reconhecimento não existe no Expo Go; o app
   detecta a ausência (`requireOptionalNativeModule`) e mantém o modo texto + TTS. Voz exige
   development build.
8. **Text-to-Speech com `expo-speech`** (funciona no Expo Go), desligável pelo estudante.
9. **Privacidade na persistência:** `assistant_interactions` guarda apenas metadados (intenção,
   status, IDs, durações). Não existe coluna para texto ou áudio.

## Alternativas consideradas

| Alternativa | Motivo para não adotar agora |
| --- | --- |
| LLM para interpretar intenções | Custo, dependência externa e não determinismo; a arquitetura já permite plugar um `IntentInterpreter` com a mesma validação. |
| Gravar áudio (`expo-audio`) e transcrever no backend com provedor externo | Exige chave paga e envio de áudio a terceiros; seria a opção para Expo Go com voz, mas precisa de decisão explícita de privacidade. |
| Interpretar intenções no mobile | Duplicaria regras e permitiria adulteração; a API é a única fonte de verdade. |

## Atualização 2026-09-16 — Expo SDK 57

O app foi atualizado do SDK 54 para o SDK 57 porque o Expo Go distribuído nas lojas passou a
suportar apenas o SDK 57 (erro "Project is incompatible with this version of Expo Go"). As decisões
acima não mudam; apenas as versões das dependências nativas acompanham o SDK.

## Consequências

- Voz real exige `npx expo run:android` / `eas build --profile development` (ou navegador compatível).
- Cobertura de linguagem limitada às regras testadas; frases fora do escopo recebem `unknown` com sugestões.
- A confiança da intenção é a força da regra que casou, não uma probabilidade estatística.
