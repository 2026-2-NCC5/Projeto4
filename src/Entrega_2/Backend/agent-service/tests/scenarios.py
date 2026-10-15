"""Cenários oficiais controlados (TASK-002 §26) expressos como entradas do engine.

Os dados são sintéticos. Cada função devolve um EvaluationInput determinístico.
"""

from __future__ import annotations

from datetime import date

from app.agent.models import (
    AcademicContext,
    Assessment,
    AttendanceRecord,
    EvaluationInput,
    PendingItem,
    Subject,
)

REFERENCE_DATE = date(2026, 9, 16)

IA = Subject("subject-demo-001", "CC501", "Inteligência Artificial")
BD = Subject("subject-demo-002", "CC502", "Banco de Dados")
ES = Subject("subject-demo-003", "CC503", "Engenharia de Software")
NUVEM = Subject("subject-demo-004", "CC504", "Computação em Nuvem")
ED = Subject("subject-demo-005", "CC505", "Estruturas de Dados")


def _input(student_id: str, context: AcademicContext) -> EvaluationInput:
    return EvaluationInput(
        student_id=student_id,
        academic_context=context,
        reference_date=REFERENCE_DATE,
        request_id=f"req-{student_id}",
        correlation_id=f"corr-{student_id}",
    )


def scenario_001_no_alerts() -> EvaluationInput:
    return _input(
        "student-demo-002",
        AcademicContext(
            subjects=(IA, ES),
            pending_items=(PendingItem("pending-done", "assignment", "completed", ES.id, "Lista 1", date(2026, 9, 6)),),
            attendance=(AttendanceRecord(IA.id, 10, 10), AttendanceRecord(ES.id, 10, 9)),
            assessments=(
                Assessment("a1", IA.id, "Prova 1", 10.0, "exam", 9.0, date(2026, 8, 27)),
                Assessment("a2", ES.id, "Prova 1", 10.0, "exam", 8.5, date(2026, 9, 1)),
            ),
        ),
    )


def scenario_002_pending_activity() -> EvaluationInput:
    """Entrada oficial do cenário de sucesso (TASK-004 §41): apenas pendência."""

    return _input(
        "student-demo-001",
        AcademicContext(
            subjects=(),
            pending_items=(
                PendingItem(
                    "pending-demo-001", "assignment", "pending", BD.id, "Entrega do trabalho prático", date(2026, 9, 21)
                ),
            ),
            attendance=(),
            assessments=(),
        ),
    )


def scenario_003_attendance_attention() -> EvaluationInput:
    return _input(
        "student-demo-003",
        AcademicContext(
            subjects=(NUVEM, IA),
            attendance=(AttendanceRecord(NUVEM.id, 18, 14), AttendanceRecord(IA.id, 10, 10)),
            assessments=(Assessment("a1", NUVEM.id, "Prova 1", 10.0, "exam", 7.5, date(2026, 8, 27)),),
        ),
    )


def scenario_004_performance_attention() -> EvaluationInput:
    return _input(
        "student-demo-004",
        AcademicContext(
            subjects=(ED, ES),
            attendance=(AttendanceRecord(ED.id, 10, 10), AttendanceRecord(ES.id, 10, 10)),
            assessments=(
                Assessment("a1", ED.id, "Prova 1", 10.0, "exam", 4.0, date(2026, 8, 22)),
                Assessment("a2", ED.id, "Lista avaliativa", 10.0, "assignment", 5.0, date(2026, 9, 6)),
                Assessment("a3", ES.id, "Prova 1", 10.0, "exam", 8.0, date(2026, 9, 1)),
            ),
        ),
    )


def scenario_005_multiple_factors() -> EvaluationInput:
    return _input(
        "student-demo-005",
        AcademicContext(
            subjects=(BD, NUVEM),
            pending_items=(
                PendingItem("p1", "assignment", "pending", BD.id, "Entrega do projeto de modelagem", date(2026, 9, 18)),
                PendingItem(
                    "p2", "assessment", "overdue", NUVEM.id, "Questionário sobre containers", date(2026, 9, 15)
                ),
            ),
            attendance=(AttendanceRecord(BD.id, 10, 10), AttendanceRecord(NUVEM.id, 18, 14)),
            assessments=(
                Assessment("a1", BD.id, "Prova 1", 10.0, "exam", 4.5, date(2026, 8, 27)),
                Assessment("a2", BD.id, "Trabalho", 10.0, "assignment", 5.5, date(2026, 9, 8)),
                Assessment("a3", NUVEM.id, "Prova 1", 10.0, "exam", 7.0, date(2026, 9, 1)),
            ),
        ),
    )


def scenario_006_insufficient_data() -> EvaluationInput:
    return _input("student-demo-006", AcademicContext())


def scenario_007_inconsistent_data() -> EvaluationInput:
    return _input(
        "student-demo-007",
        AcademicContext(
            subjects=(IA,),
            pending_items=(
                PendingItem("p1", "document", "pending", ED.id, "Documento de matrícula pendente", date(2026, 9, 19)),
            ),
            attendance=(AttendanceRecord(IA.id, 10, 10),),
            assessments=(
                Assessment("a1", IA.id, "Prova 1", 10.0, "exam", 8.0, date(2026, 8, 27)),
                Assessment("a2", IA.id, "Prova 2", 10.0, "exam", 9.0, date(2026, 10, 16)),
            ),
        ),
    )


def scenario_008_human_validation() -> EvaluationInput:
    return _input(
        "student-demo-008",
        AcademicContext(
            subjects=(BD, ES),
            attendance=(AttendanceRecord(BD.id, 20, 13), AttendanceRecord(ES.id, 10, 10)),
            assessments=(
                Assessment("a1", BD.id, "Prova 1", 10.0, "exam", 7.5, date(2026, 8, 27)),
                Assessment("a2", ES.id, "Prova 1", 10.0, "exam", 8.0, date(2026, 9, 4)),
            ),
        ),
    )


SCENARIOS = {
    "SCENARIO-001": scenario_001_no_alerts,
    "SCENARIO-002": scenario_002_pending_activity,
    "SCENARIO-003": scenario_003_attendance_attention,
    "SCENARIO-004": scenario_004_performance_attention,
    "SCENARIO-005": scenario_005_multiple_factors,
    "SCENARIO-006": scenario_006_insufficient_data,
    "SCENARIO-007": scenario_007_inconsistent_data,
    "SCENARIO-008": scenario_008_human_validation,
}

# Resultado esperado definido ANTES da execução (TASK-002 §17).
EXPECTED = {
    "SCENARIO-001": {"status": "no_action", "types": [], "abstained": False, "human": False},
    "SCENARIO-002": {"status": "recommendation", "types": ["pending_activity"], "abstained": False, "human": False},
    "SCENARIO-003": {"status": "recommendation", "types": ["attendance_attention"], "abstained": False, "human": False},
    "SCENARIO-004": {
        "status": "recommendation",
        "types": ["performance_attention"],
        "abstained": False,
        "human": False,
    },
    "SCENARIO-005": {
        "status": "recommendation",
        "types": ["pending_activity", "attendance_attention", "performance_attention"],
        "abstained": False,
        "human": False,
    },
    "SCENARIO-006": {"status": "abstained", "types": [], "abstained": True, "human": False},
    "SCENARIO-007": {
        "status": "recommendation",
        "types": ["institutional_validation"],
        "abstained": False,
        "human": True,
    },
    "SCENARIO-008": {"status": "recommendation", "types": ["attendance_critical"], "abstained": False, "human": True},
}
