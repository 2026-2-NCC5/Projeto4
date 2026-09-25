# Agent Service — ASA Conecta (Python + FastAPI)

Serviço interno que expõe o **Agente para o Estudante**. Consumido apenas pela API Node.js.

```text
app/
├── main.py                 create_app(): FastAPI + handlers de erro sanitizados
├── api/routes.py           POST /internal/v1/student-agent/evaluate · GET /health · GET /internal/v1/student-agent/config
├── contracts/schemas.py    Pydantic v2 (espelha contracts/agent/*.v1.json)
├── services/evaluation_service.py   contrato ↔ engine
├── agent/                  ENGINE (sem FastAPI/HTTP): models, config, evaluator, recommendations, abstention, engine
├── config/                 agent.yaml · thresholds.yaml · rules.yaml
└── logging_config.py       logs JSON com request_id/correlation_id/run_id/duration_ms
tests/                      test_engine.py (unitário, sem HTTP) · test_api.py · test_contract.py · scenarios.py
```

## Execução

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/internal/docs
```

## Testes e qualidade

```bash
pytest -q
ruff check . && ruff format --check .
```

## Uso direto do engine (sem HTTP)

```python
from datetime import date
from app.agent import AcademicContext, EvaluationInput, PendingItem, StudentAgentEngine, load_config

engine = StudentAgentEngine(load_config())
context = AcademicContext(
    pending_items=(PendingItem("p1", "assignment", "pending", "subject-demo-002", "Trabalho", date(2026, 9, 21)),)
)
result = engine.evaluate(EvaluationInput("student-demo-001", context, date(2026, 9, 16)))
print(result.status, result.recommendations[0].next_action)
```

Regras, limiares e metodologia de confiança: [`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/agent-engine.md`](<../../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/agent-engine.md>).

## Comportamento de contrato

- `contract_version` com major ≠ 1 → `422 CONTRACT_VERSION_UNSUPPORTED`.
- Payload fora do schema (campos extras, tipos errados, ausentes) → `422 VALIDATION_ERROR` com `details` por campo.
- Erro interno → `500 AGENT_INTERNAL_ERROR` sem stack trace.
- Abstenção → `200` com `status = abstained` (não é erro).
