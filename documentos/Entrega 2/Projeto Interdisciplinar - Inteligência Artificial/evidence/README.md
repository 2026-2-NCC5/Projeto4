# Evidências e indicadores da PoC (TASK-002 §25)

Última execução automatizada: [`e2e/last-run.md`](e2e/last-run.md) (gerado por `src/Entrega 2/Backend/scripts/e2e.sh`).

| Indicador | Meta | Resultado obtido | Como foi medido |
| --- | --- | --- | --- |
| 1. Cobertura dos cenários obrigatórios | 100% | **100%** (8/8 cenários SCENARIO-001…008 executados ponta a ponta) | `src/Entrega 2/Backend/api/test/e2e/scenarios.e2e.test.ts` (E2E-001, 005, 006, 007) com Agent Service Python real e PostgreSQL |
| 2. Consistência das recomendações | ≥ 90% | **100%** (8/8 resultados iguais ao esperado definido previamente) | `EXPECTED` em `src/Entrega 2/Backend/agent-service/tests/scenarios.py` + `test_official_scenarios_match_expected_results` |
| 3. Recomendações com evidência | 100% | **100%** | `test_every_recommendation_has_evidence_and_next_action`; schema exige `evidence.minItems = 1`; zod rejeita evidência vazia |
| 4. Recomendações acionáveis com próxima ação | 100% | **100%** | mesmo teste; toda regra em `rules.yaml` define `next_action` |
| 5. Abstenção tratada com segurança | 100% | **100%** (dados insuficientes, dados apenas de disciplinas, confiança baixa) | `test_insufficient_data_abstains_safely`, `test_only_subjects_without_observable_data_abstains`, `test_minimum_confidence_triggers_abstention`, E2E-005 |
| 6. Ações administrativas autônomas | 0 | **0** | `test_engine_never_exposes_administrative_actions`; o engine não possui efeitos colaterais (função pura sobre dados) |
| 7. Rastreabilidade | 100% | **100%** — todo run possui `request_id`, `correlation_id`, `run_id`, `agent_version`, `config_version` persistidos | `agent_runs` + testes de integração (`database.integration.test.ts`) + tabela em `e2e/last-run.md` |
| 8. Reprodutibilidade | 100% | **100%** — `test_scenarios_are_deterministic` (mesma entrada → mesma saída); seeds idempotentes; `src/Entrega 2/Backend/scripts/e2e.sh` | pytest + vitest |
| 9. Secrets ou dados pessoais reais nas evidências | 0 | **0** — apenas `student-demo-*`, e-mails `@demo.asa`, senha de demo em hash bcrypt | revisão manual + `grep` (ver seção abaixo) |

## Falhas controladas demonstradas

| Cenário | Resultado |
| --- | --- |
| E2E-002 Agent Service indisponível | `503 DEPENDENCY_ERROR`, nada persistido |
| E2E-003 timeout (300 ms) | `504 TIMEOUT` em < 1 s, loading encerrado |
| E2E-004 contrato 2.0 | `502 CONTRACT_ERROR` com `details[0].field = contract_version` |
| E2E-008 acesso indevido | `401` sem token; `403 FORBIDDEN` para dado de outro estudante |

## Assistente por voz

Última execução: [`e2e/voice-last-run.md`](e2e/voice-last-run.md) — fala transcrita enviada à API real,
PostgreSQL real e Agent Service Python real.

| Cenário | Resultado esperado | Verificação |
| --- | --- | --- |
| VOICE-001 fluxo completo | análise do Agente com evidência, próxima ação, `run_id` e `correlation_id` persistidos em `agent_runs` e `assistant_interactions` | E2E |
| VOICE-002 "Tenho alguma atividade pendente?" | pendências reais do seed, tela e fala | E2E + unit |
| VOICE-003 "Como está minha frequência?" | frequência disponível; continuação "E em Inteligência Artificial?" usa o contexto | E2E + unit |
| VOICE-004 "Como está aquilo?" | pede reformulação, nenhum dado | E2E + unit |
| VOICE-005 dados insuficientes | `abstained` vindo do Agente | E2E + unit |
| VOICE-006 "Corrige minha nota." | `human_validation`, nenhum registro alterado, nenhuma execução do Agente | E2E + integração |
| VOICE-007 microfone negado | modo texto continua utilizável | testes do app |
| VOICE-008 validação humana do Agente | `attendance_critical` com validação humana | E2E |
| VOICE-009 outro aluno / injeção | `refused`, sem dados | E2E + unit |

Nenhum texto de pergunta ou áudio é persistido (`assistant_interactions` só tem metadados), verificado
em `test/integration/database.integration.test.ts`.

## Como reproduzir

```bash
# a partir da raiz do repositório
"src/Entrega 2/Backend/scripts/e2e.sh"                   # PostgreSQL via Docker + API + Python real → evidence/e2e/last-run.md
( cd "src/Entrega 2/Backend/agent-service" && .venv/bin/pytest -q )
( cd "src/Entrega 2/Backend/api" && npm run test:unit && npm run test:integration )
```

## Verificação de segredos

```bash
git grep -nE "(sb_publishable|service_role|BEGIN (RSA|OPENSSH) PRIVATE|AKIA[0-9A-Z]{16})" -- . ':!src/Entrega 1'
```

Os únicos valores "secretos" versionados são placeholders em `.env.example` e a senha
fictícia `Demo@2026` documentada para as contas sintéticas.
