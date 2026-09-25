"""Testes do serviço FastAPI (TASK-004 §26, §46-47) — contrato válido, inválido, incompatível e erro sanitizado."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "agent" / "examples"


@pytest.fixture
def client():
    return TestClient(create_app(), raise_server_exceptions=False)


def _request_payload(**overrides):
    payload = json.loads((EXAMPLES / "request.scenario-002.json").read_text(encoding="utf-8"))
    payload.update(overrides)
    return payload


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "agent-service"
    assert body["agent"] == "student_agent"
    assert body["contract_version"] == "1.0"


def test_valid_contract_returns_structured_response(client):
    response = client.post("/internal/v1/student-agent/evaluate", json=_request_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["contract_version"] == "1.0"
    assert body["request_id"] == "req-demo-001"
    assert body["correlation_id"] == "corr-demo-001"
    assert body["run_id"].startswith("run-")
    assert body["status"] == "recommendation"
    assert body["abstained"] is False
    assert body["recommendations"][0]["type"] == "pending_activity"
    assert body["recommendations"][0]["evidence"][0]["description"] == "Foi identificada uma atividade pendente."
    assert body["recommendations"][0]["next_action"] == "Consultar os detalhes da atividade."
    assert response.headers["x-correlation-id"] == "corr-demo-001"


def test_invalid_payload_is_rejected_with_sanitized_details(client):
    payload = _request_payload()
    payload["academic_context"]["attendance"] = [{"subject_id": "s1", "total_classes": -1, "attended_classes": 2}]
    payload.pop("student_id")
    response = client.post("/internal/v1/student-agent/evaluate", json=payload)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["correlation_id"] == "corr-demo-001"
    fields = {detail["field"] for detail in error["details"]}
    assert "student_id" in fields
    assert any(field.startswith("academic_context.attendance") for field in fields)
    assert "Traceback" not in response.text


def test_incompatible_contract_version_is_rejected(client):
    payload = _request_payload(contract_version="2.0")
    response = client.post("/internal/v1/student-agent/evaluate", json=payload)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "CONTRACT_VERSION_UNSUPPORTED"
    assert "2.0" in error["message"]


def test_unknown_fields_are_not_silently_accepted(client):
    payload = _request_payload(unexpected_field=True)
    response = client.post("/internal/v1/student-agent/evaluate", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_internal_error_is_sanitized(client, monkeypatch):
    def boom(_request):
        raise RuntimeError("segredo interno: DATABASE_URL=postgres://x")

    monkeypatch.setattr(client.app.state.evaluation_service, "evaluate", boom)
    response = client.post("/internal/v1/student-agent/evaluate", json=_request_payload())
    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "AGENT_INTERNAL_ERROR"
    assert "DATABASE_URL" not in response.text
    assert "Traceback" not in response.text
    assert error["request_id"] == "req-demo-001"


def test_abstention_is_not_an_error(client):
    payload = _request_payload(student_id="student-demo-006")
    payload["academic_context"] = {"subjects": [], "pending_items": [], "attendance": [], "assessments": []}
    response = client.post("/internal/v1/student-agent/evaluate", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "abstained"
    assert body["abstained"] is True
    assert body["abstention_reason"] == "Dados insuficientes para realizar uma análise confiável."
    assert body["recommendations"] == []


def test_config_endpoint_exposes_versions(client):
    response = client.get("/internal/v1/student-agent/config")
    assert response.status_code == 200
    body = response.json()
    assert body["agent_version"] == "1.0.0"
    assert body["thresholds"]["minimum_confidence"] == 0.7
