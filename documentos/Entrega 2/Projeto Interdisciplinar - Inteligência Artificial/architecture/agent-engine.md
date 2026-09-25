# Agente para o Estudante — regras, confiança e abstenção

Implementação: `src/Entrega 2/Backend/agent-service/app/agent/`. Configuração: `src/Entrega 2/Backend/agent-service/app/config/`.

| Arquivo | Conteúdo |
| --- | --- |
| `agent.yaml` | `agent.name`, `agent.version` (1.0.0), `config_version` (1.0.0), `contracts.version` (1.0) |
| `thresholds.yaml` | limiares de confiança, frequência, desempenho, pendências e suficiência de dados |
| `rules.yaml` | textos, prioridade, confiança-base e próxima ação de cada regra; resumos; motivos de abstenção |

Alterar um limiar exige incrementar `config_version`; a versão usada fica gravada em `agent_runs.config_version`.

## Pipeline determinístico (`engine.py`)

1. **Suficiência** (`abstention.check_data_sufficiency`): todas as coleções vazias → `abstained`, motivo "Dados insuficientes para realizar uma análise confiável.", `requires_human_validation = false`.
2. **Validação de consistência** (`evaluator.validate_context`): registros inconsistentes são isolados (não alimentam as demais regras) e viram evidência de `institutional_validation`:
   - presenças > aulas; valores negativos; nota fora de `[0, max_score]`; `max_score <= 0`;
   - nota registrada em avaliação com data futura;
   - pendência/frequência/avaliação referenciando disciplina sem matrícula ativa;
   - IDs duplicados.
3. **Regras** (`evaluator.detect_findings`):

| Tipo | Condição | Próxima ação | Validação humana |
| --- | --- | --- | --- |
| `pending_activity` | ≥ 1 pendência `pending`/`overdue` (agrupadas em uma recomendação; prioridade 1 se vencida ou em ≤ `due_soon_days`) | "Consultar os detalhes da atividade." | não |
| `attendance_attention` | frequência < `attention_rate` (80%) e ≥ `critical_rate` (75%) | confirmar registros com o professor e evitar faltas | não |
| `attendance_critical` | frequência < `critical_rate` (75%) — pode afetar direitos acadêmicos | "Procure a coordenação para validar sua situação de frequência." | **sim** |
| `performance_attention` | média (Σscore/Σmax) < `attention_ratio` (0,60) com ≥ `minimum_assessments` | consultar avaliação e procurar o professor | não |
| `institutional_validation` | qualquer inconsistência | "Entre em contato com a coordenação para validação." | **sim** |

4. **Confiança** (`recommendations.py` + penalidades em `evaluator.py`) — metodologia simples e reproduzível, não uma probabilidade estatística:
   - cada regra parte de `base_confidence` (`rules.yaml`);
   - frequência com menos de `minimum_classes_for_full_confidence` aulas: `- small_sample_penalty` (0,20);
   - desempenho com menos de `assessments_for_full_confidence` avaliações: `- single_assessment_penalty` (0,15);
   - a confiança da execução é a média das recomendações retidas (2 casas);
   - `no_action` usa `no_action_base_confidence` (0,80) quando há dados observáveis; com apenas disciplinas cadastradas usa `no_action_thin_data_confidence` (0,60) → abaixo de `confidence.minimum` (0,70) → abstenção.
5. **Abstenção por confiança**: recomendações abaixo de `confidence.minimum` não são emitidas; se todas as situações detectadas ficarem abaixo, `abstained` com "As situações identificadas não atingiram o nível mínimo de confiança configurado." e `confidence` = maior valor observado.
6. **Validação humana**: `requires_human_validation` da execução é `true` se qualquer recomendação exigir. Nenhuma ação administrativa é executada — o engine apenas descreve a situação e aponta a coordenação como próxima ação.

## Cenários oficiais (TASK-002 §26) e resultado esperado

| Cenário | Seed | Esperado | Verificado em |
| --- | --- | --- | --- |
| SCENARIO-001 sem alertas | student-demo-002 | `no_action` | `tests/test_engine.py`, E2E-007 |
| SCENARIO-002 atividade pendente | student-demo-001 | `recommendation` · `pending_activity` | `test_engine.py`, `test_api.py`, E2E-001 |
| SCENARIO-003 frequência | student-demo-003 | `attendance_attention` | `test_engine.py`, E2E-007 |
| SCENARIO-004 desempenho | student-demo-004 | `performance_attention` | `test_engine.py`, E2E-007 |
| SCENARIO-005 múltiplos fatores | student-demo-005 | 3 recomendações ordenadas por prioridade | `test_engine.py`, E2E-007 |
| SCENARIO-006 dados insuficientes | student-demo-006 | `abstained` | `test_engine.py`, E2E-005 |
| SCENARIO-007 dados inconsistentes | student-demo-007 | `institutional_validation` + validação humana | `test_engine.py`, E2E-007 |
| SCENARIO-008 validação humana | student-demo-008 | `attendance_critical` + validação humana | `test_engine.py`, E2E-006 |

Os cenários são definidos **antes** da execução em `src/Entrega 2/Backend/agent-service/tests/scenarios.py` (`EXPECTED`).

## Limitações conhecidas

- Regras determinísticas; sem ML/LLM (decisão TASK-004 §55-56). Pandas/NumPy/scikit-learn não são necessários nesta versão.
- A confiança é heurística documentada, não calibrada estatisticamente.
- Não há feedback do estudante (`agent_feedback` existe no schema, sem endpoint).
