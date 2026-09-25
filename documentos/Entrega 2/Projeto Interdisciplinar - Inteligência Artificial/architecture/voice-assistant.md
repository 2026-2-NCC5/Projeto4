# Assistente por voz — arquitetura

```text
Estudante ──voz──▶ ASA Conecta Mobile
                   │ SpeechRecognitionService (expo-speech-recognition / indisponível no Expo Go)
                   │ useVoiceAssistant (máquina de estados) ── AsaVoiceOrb (animação)
                   │ texto digitado usa exatamente o mesmo caminho
                   ▼ POST /api/assistant/message { inputType, text, conversationContext, clientMetrics }
                   Node.js API
                   │ auth → requireStudent (identidade da sessão) → validação estrita do corpo
                   │ RuleBasedIntentInterpreter ─▶ validateInterpretation (schema + allow-list + disciplina + confiança)
                   │ RESPONDERS[intenção]
                   │   ├─ consultas objetivas → StudentService (pendências, avaliações, frequência…)
                   │   ├─ análise → AgentService → Python Agent Service → Agent Engine (run_id, evidências)
                   │   ├─ política → abstenção / validação humana / recusa (nada é executado)
                   │   └─ controle → clientCommand (repetir, parar fala, voltar)
                   │ assistant_interactions (metadados, sem texto)
                   ▼ AssistantResponse { display, speech, nextActions, status, runId, context }
                   Mobile: cartões + evidências + próxima ação na tela; TTS (expo-speech) opcional
```

Código: `src/Entrega 2/Backend/api/src/assistant/` (intents, text, subjects, interpretation, ruleBasedInterpreter,
phrasing, responders), `src/Entrega 2/Backend/api/src/services/assistantService.ts`, contrato em
`src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts` (seção *assistant*), app em `src/Entrega 2/Frontend` (ver README do app).

## Intenções (allow-list)

| Tipo | Intenções | Fonte dos dados |
| --- | --- | --- |
| Conversa | `greeting`, `help`, `unknown`, `request_human_help` | textos fixos (sem contatos inventados) |
| Consulta | `get_student_summary`, `get_pending_items`, `get_subjects`, `get_subject_details`, `get_assessments`, `get_next_assessment`, `get_latest_grade`, `get_attendance`, `get_subject_attendance`, `get_agent_history` | PostgreSQL via `StudentService`/`AgentService` (somente leitura) |
| Análise | `run_student_analysis`, `get_recommendations`, `explain_recommendation`, `get_next_action` | Agent Engine (nova execução ou última persistida) |
| Política | `predict_outcome` (abstenção), `administrative_request` (validação humana), `access_other_student` (recusa) | nenhum dado consultado |
| Controle | `repeat_last`, `stop_speaking`, `go_back`, `clarify_last`, `open_screen` (v1.2: navegação para a allow-list) | executado no dispositivo |

Entidades: `subjectId`/`subjectName` (nome, código, iniciais como "BD", plural), `period`
(`today`, `tomorrow`, `this_week` = hoje até domingo, `next_week`, `overdue`), `assessmentType`.

## Ordem de interpretação e confiança

1. Normalização (minúsculas, sem acentos/pontuação) e remoção de "ASA,".
2. Saudação exata → 0,95.
3. **Política primeiro:** injeção (0,97) e referência a outra pessoa (0,95). "notas **do** João" é
   tratado como pessoa porque em pt-BR disciplinas usam "de" ("notas de Banco de Dados"); palavras
   acadêmicas e nomes do catálogo são exceções.
4. Pedido administrativo (verbo imperativo + registro acadêmico, ou "está errada") → 0,92.
5. Comandos curtos ancorados ("para", "repete", "volta", "não entendi") → 0,90–0,95.
6. Previsão de aprovação/reprovação → 0,90.
7. Regras de consulta/análise (0,82–0,93); a maior pontuação vence.
8. Continuação com contexto ("E em Estruturas de Dados?", "e na próxima semana?") → 0,85.
9. Sem regra → `unknown` (0,2–0,3). Abaixo de `INTENT_MIN_CONFIDENCE` (0,6) → `unknown`.

## Contexto conversacional

`{ lastIntent, lastSubjectId, lastRecommendationId, lastRunId }` volta na resposta e o app reenvia na
mensagem seguinte. Não há histórico. A API descarta `lastSubjectId` que não pertence ao estudante e
valida `lastRecommendationId` por dono (403/404 → ignorado, com log de alerta).

## Status da resposta

| `status` | Quando |
| --- | --- |
| `success` | consulta/análise respondida |
| `empty` | consulta válida sem itens ("Não encontrei avaliações futuras nos dados disponíveis.") |
| `not_found` | disciplina fora das matrículas ou inexistente |
| `needs_clarification` | `unknown`, pergunta vaga, disciplina ambígua, nada para repetir |
| `abstained` | Agente se absteve ou pergunta de previsão ("Eu vou reprovar?") |
| `human_validation` | pedido administrativo ou recomendação que exige validação humana |
| `refused` | outra pessoa ou injeção de instrução |

Falhas do Agent Service continuam como erro HTTP (503/504/502), nunca como sucesso vazio.

## Observabilidade

Log `assistant interaction` (sem texto): `interaction_id`, `run_id`, `intent`, `intent_confidence`,
`interpreter`, `status`, `input_type`, `speech_recognition_duration_ms` (informado pelo app),
`intent_duration_ms`, `agent_duration_ms`, `total_duration_ms`, mais `request_id`/`correlation_id`.
Os mesmos metadados vão para `assistant_interactions` (migration 002). A duração do TTS é medida
no app e não é persistida.

## Variáveis

| Variável | Onde | Padrão |
| --- | --- | --- |
| `VOICE_ASSISTANT_ENABLED` | API | `true` (false → 404 no endpoint) |
| `INTENT_MIN_CONFIDENCE` | API | `0.6` |
| `APP_TIMEZONE` | API | `America/Sao_Paulo` ("hoje", "esta semana") |
| `EXPO_PUBLIC_VOICE_ASSISTANT_ENABLED`, `EXPO_PUBLIC_SPEECH_PROVIDER`, `EXPO_PUBLIC_SPEECH_LANGUAGE`, `EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY`, `EXPO_PUBLIC_TTS_ENABLED_DEFAULT`, `EXPO_PUBLIC_ASSISTANT_TIMEOUT_MS` | app | ver `src/Entrega 2/Frontend/.env.example` |

Nenhuma chave de provedor é necessária.

## Privacidade

- Áudio não é gravado (`recordingOptions.persist: false`) nem enviado à API.
- O reconhecimento usa o serviço de voz do sistema (Google/Apple) ou do navegador, que pode processar
  o áudio nos servidores do fabricante; `EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY=true` força reconhecimento
  local quando o aparelho suporta.
- A API não persiste nem loga o texto da pergunta ou da resposta.
- Permissão de microfone é pedida apenas quando o estudante toca em "Falar com o assistente ASA".

## Cenários

| Cenário | Onde é verificado |
| --- | --- |
| VOICE-001 fluxo completo com Agente real | `src/Entrega 2/Backend/api/test/e2e/voice.e2e.test.ts` + testes do hook no app |
| VOICE-002 pendências | E2E + `test/unit/assistant.test.ts` |
| VOICE-003 frequência (+ continuação) | E2E + unit |
| VOICE-004 pergunta ambígua | E2E + unit |
| VOICE-005 abstenção | E2E (Agente real) + unit |
| VOICE-006 pedido administrativo | E2E + unit + integração (registros não mudam) |
| VOICE-007 microfone negado | testes do app (`src/Entrega 2/Frontend/__tests__`) |
| VOICE-008/009 validação humana do Agente, outro aluno/injeção | E2E |

Evidência gerada: [`evidence/e2e/voice-last-run.md`](../evidence/e2e/voice-last-run.md).

## Limitações

- Regras cobrem o vocabulário testado; sinônimos novos precisam de regra e teste.
- Sem barge-in contínuo: o estudante toca em "Parar resposta" ou no microfone para interromper.
- "Esta semana" termina no domingo; datas do seed usam `current_date` do PostgreSQL (UTC), podendo
  diferir em um dia do fuso da API perto da meia-noite.

## Atualização 2026-09-17 — experiência global e "Hey Asa" (v1.2)

- O app passou a enviar `currentScreen` (contexto da tela) e a executar `navigation` devolvida pela
  intenção `open_screen` ("Abre minhas notas"). A allow-list de destinos ganhou `assistant` e `services`.
- Perguntas curtas em telas acadêmicas ("qual foi a menor?" em Avaliações) são desambiguadas pela tela;
  sem contexto continuam `unknown` (nada é inventado). Regras explícitas sempre prevalecem.
- No app, o assistente virou camada global (overlay), com ativação por "Hey Asa" em primeiro plano
  (development build/web), histórico local opcional e configurações de privacidade. Detalhes em
  [`assistant/`](../assistant/architecture.md) e [ADR-005](../adr/ADR-005-assistant-experience.md).
