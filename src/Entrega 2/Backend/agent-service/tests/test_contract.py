"""Testes de contrato: exemplos versionados x JSON Schema x Pydantic (TASK-004 §73)."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.contracts.schemas import StudentAgentRequest, StudentAgentResponse
from app.main import create_app

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts" / "agent"


def _load(name: str):
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def request_schema():
    return _load("student-agent-request.v1.json")


@pytest.fixture(scope="module")
def response_schema():
    return _load("student-agent-response.v1.json")


def test_request_example_matches_json_schema_and_pydantic(request_schema):
    example = _load("examples/request.scenario-002.json")
    jsonschema.validate(example, request_schema)
    StudentAgentRequest.model_validate(example)


def test_response_example_matches_json_schema_and_pydantic(response_schema):
    example = _load("examples/response.scenario-002.json")
    jsonschema.validate(example, response_schema)
    StudentAgentResponse.model_validate(example)


def test_incompatible_example_fails_both_validators(response_schema):
    example = _load("examples/response.incompatible-v2.json")
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(example, response_schema)
    with pytest.raises(ValidationError):
        StudentAgentResponse.model_validate(example)


def test_live_service_response_conforms_to_json_schema(response_schema):
    client = TestClient(create_app())
    example = _load("examples/request.scenario-002.json")
    body = client.post("/internal/v1/student-agent/evaluate", json=example).json()
    jsonschema.validate(body, response_schema)
    assert body["contract_version"].startswith("1.")
