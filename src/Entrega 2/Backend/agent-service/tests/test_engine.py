"""Testes unitários do Agent Engine — sem FastAPI (TASK-004 §72)."""

from __future__ import annotations

import dataclasses
from datetime import date
from pathlib import Path

import pytest

from app.agent.engine import FORBIDDEN_ACTIONS, StudentAgentEngine
from app.agent.models import AcademicContext, AttendanceRecord, EvaluationInput, PendingItem, Subject
from tests.scenarios import (
    EXPECTED,
    REFERENCE_DATE,
    SCENARIOS,
    scenario_002_pending_activity,
    scenario_006_insufficient_data,
)


@pytest.mark.parametrize("scenario_id", sorted(SCENARIOS))
def test_official_scenarios_match_expected_results(engine, scenario_id):
    """Indicadores 1 e 2: cobertura e consistência dos cenários obrigatórios."""

    result = engine.evaluate(SCENARIOS[scenario_id]())
    expected = EXPECTED[scenario_id]

    assert result.status == expected["status"]
    assert result.abstained is expected["abstained"]
    assert result.requires_human_validation is expected["human"]
    assert sorted(rec.type for rec in result.recommendations) == sorted(expected["types"])
    assert result.run_id.startswith("run-")
    assert result.agent == "student_agent"
    assert result.agent_version == engine.agent_version
    assert result.config_version == engine.config_version


@pytest.mark.parametrize("scenario_id", sorted(SCENARIOS))
def test_every_recommendation_has_evidence_and_next_action(engine, scenario_id):
    """Indicadores 3 e 4: 100% das recomendações com evidência e próxima ação."""

    result = engine.evaluate(SCENARIOS[scenario_id]())
    for rec in result.recommendations:
        assert len(rec.evidence) >= 1, rec.type
        assert all(item.description.strip() for item in rec.evidence)
        assert rec.next_action, rec.type
        assert rec.id.startswith("rec-")
        assert rec.confidence is not None and 0 <= rec.confidence <= 1


@pytest.mark.parametrize("scenario_id", sorted(SCENARIOS))
def test_scenarios_are_deterministic(config, scenario_id):
    """Indicador 8: reprodutibilidade — mesma entrada, mesma saída (exceto IDs/tempo)."""

    def run():
        engine = StudentAgentEngine(
            config, id_factory=lambda: "fixed", clock=lambda: __import__("datetime").datetime(2026, 9, 16)
        )
        return engine.evaluate(SCENARIOS[scenario_id]())

    assert run() == run()


def test_pending_activity_uses_official_evidence_and_next_action(engine):
    result = engine.evaluate(scenario_002_pending_activity())
    rec = result.recommendations[0]
    assert rec.type == "pending_activity"
    assert rec.evidence[0].description == "Foi identificada uma atividade pendente."
    assert rec.next_action == "Consultar os detalhes da atividade."
    assert rec.subject_id == "subject-demo-002"
    assert rec.requires_human_validation is False
    assert result.summary == "Foi identificada uma situação que merece atenção."
    assert result.confidence == 0.9


def test_insufficient_data_abstains_safely(engine):
    result = engine.evaluate(scenario_006_insufficient_data())
    assert result.status == "abstained"
    assert result.abstained is True
    assert result.recommendations == ()
    assert result.abstention_reason == "Dados insuficientes para realizar uma análise confiável."
    assert result.requires_human_validation is False


def test_only_subjects_without_observable_data_abstains(engine):
    context = AcademicContext(subjects=(Subject("s1", "X1", "Disciplina X"),))
    result = engine.evaluate(EvaluationInput("student-x", context, REFERENCE_DATE))
    assert result.status == "abstained"
    assert result.confidence == engine.config.abstention.no_action_thin_data_confidence


def test_inconsistent_attendance_is_isolated_and_requires_validation(engine):
    context = AcademicContext(
        subjects=(Subject("s1", "X1", "Disciplina X"),),
        attendance=(AttendanceRecord("s1", 10, 14),),  # mais presenças do que aulas
    )
    result = engine.evaluate(EvaluationInput("student-x", context, REFERENCE_DATE))
    assert result.status == "recommendation"
    assert [rec.type for rec in result.recommendations] == ["institutional_validation"]
    rec = result.recommendations[0]
    assert rec.requires_human_validation is True
    assert rec.next_action == "Entre em contato com a coordenação para validação."
    assert any("mais presenças" in item.description for item in rec.evidence)
    assert result.requires_human_validation is True


def test_human_validation_recommendation_has_safe_next_action(engine):
    result = engine.evaluate(SCENARIOS["SCENARIO-008"]())
    rec = result.recommendations[0]
    assert rec.type == "attendance_critical"
    assert rec.requires_human_validation is True
    assert "coordenação" in rec.next_action.lower()
    assert result.summary == "Foi identificada uma situação que precisa de confirmação por uma pessoa responsável."


def test_multiple_factors_are_ordered_by_priority(engine):
    result = engine.evaluate(SCENARIOS["SCENARIO-005"]())
    priorities = [rec.priority for rec in result.recommendations]
    assert priorities == sorted(priorities)
    assert result.recommendations[0].type == "pending_activity"  # pendência vencida/próxima → prioridade 1
    assert "3 situações" in result.summary


def test_thresholds_are_configurable(config):
    """Alterar o limiar de frequência muda o resultado sem alterar código."""

    scenario = SCENARIOS["SCENARIO-003"]()
    engine_default = StudentAgentEngine(config)
    assert engine_default.evaluate(scenario).status == "recommendation"

    relaxed_attendance = dataclasses.replace(config.thresholds.attendance, attention_rate=0.70)
    relaxed = dataclasses.replace(
        config, thresholds=dataclasses.replace(config.thresholds, attendance=relaxed_attendance)
    )
    assert StudentAgentEngine(relaxed).evaluate(scenario).status == "no_action"


def test_minimum_confidence_triggers_abstention(config):
    """Amostra pequena reduz a confiança abaixo do mínimo → abstenção com motivo."""

    context = AcademicContext(
        subjects=(Subject("s1", "X1", "Disciplina X"),),
        attendance=(AttendanceRecord("s1", 4, 3),),  # 75%: atenção, porém apenas 4 aulas
    )
    strict = dataclasses.replace(config, thresholds=dataclasses.replace(config.thresholds, minimum_confidence=0.70))
    result = StudentAgentEngine(strict).evaluate(EvaluationInput("student-x", context, REFERENCE_DATE))
    assert result.status == "abstained"
    assert result.abstention_reason == config.abstention.low_confidence_reason
    assert result.confidence == 0.65


def test_completed_pending_items_do_not_generate_recommendations(engine):
    context = AcademicContext(
        subjects=(Subject("s1", "X1", "Disciplina X"),),
        pending_items=(PendingItem("p1", "assignment", "completed", "s1", "Lista", date(2026, 9, 1)),),
        attendance=(AttendanceRecord("s1", 10, 10),),
    )
    result = engine.evaluate(EvaluationInput("student-x", context, REFERENCE_DATE))
    assert result.status == "no_action"


def test_engine_never_exposes_administrative_actions(engine):
    """Indicador 6: zero ações administrativas autônomas."""

    for scenario in SCENARIOS.values():
        result = engine.evaluate(scenario())
        for rec in result.recommendations:
            assert rec.type not in FORBIDDEN_ACTIONS
            assert not any(word in (rec.next_action or "").lower() for word in ("reprov", "cancelar matr", "bloque"))


def test_engine_modules_have_no_http_dependencies():
    """O Agent Engine não importa FastAPI, Starlette, Pydantic ou HTTP (TASK-001 §4)."""

    import ast
    import pkgutil

    import app.agent as agent_package

    forbidden = {"fastapi", "starlette", "pydantic", "httpx", "requests", "psycopg", "psycopg2", "sqlalchemy"}
    for module_info in pkgutil.iter_modules(agent_package.__path__):
        source = (Path(agent_package.__path__[0]) / f"{module_info.name}.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                assert name.split(".")[0] not in forbidden, f"{module_info.name} importa {name}"
