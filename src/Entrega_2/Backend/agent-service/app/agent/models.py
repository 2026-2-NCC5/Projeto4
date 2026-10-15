"""Modelos de domínio do Agente para o Estudante.

Este módulo NÃO depende de FastAPI, HTTP, Pydantic ou banco de dados.
Ele define exclusivamente as estruturas de entrada e saída do Agent Engine
(TASK-001 §4, TASK-004 §16).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

RunStatus = Literal["recommendation", "no_action", "abstained"]

AGENT_NAME = "student_agent"


@dataclass(frozen=True)
class Subject:
    id: str
    code: str
    name: str
    enrollment_status: str = "active"


@dataclass(frozen=True)
class PendingItem:
    id: str
    type: str
    status: str
    subject_id: str | None = None
    description: str | None = None
    due_date: date | None = None


@dataclass(frozen=True)
class AttendanceRecord:
    """Frequência agregada por disciplina."""

    subject_id: str
    total_classes: int
    attended_classes: int

    @property
    def rate(self) -> float | None:
        if self.total_classes <= 0:
            return None
        return self.attended_classes / self.total_classes


@dataclass(frozen=True)
class Assessment:
    id: str
    subject_id: str
    title: str
    max_score: float
    type: str = "other"
    score: float | None = None
    applied_at: date | None = None


@dataclass(frozen=True)
class AcademicContext:
    subjects: tuple[Subject, ...] = ()
    pending_items: tuple[PendingItem, ...] = ()
    attendance: tuple[AttendanceRecord, ...] = ()
    assessments: tuple[Assessment, ...] = ()

    def is_empty(self) -> bool:
        return not (self.subjects or self.pending_items or self.attendance or self.assessments)


@dataclass(frozen=True)
class EvaluationInput:
    student_id: str
    academic_context: AcademicContext
    reference_date: date
    request_id: str = ""
    correlation_id: str = ""


@dataclass(frozen=True)
class Evidence:
    type: str
    description: str
    source_reference: str | None = None


@dataclass(frozen=True)
class Inconsistency:
    """Registro inconsistente detectado na validação de dados."""

    kind: str
    description: str
    source_reference: str
    subject_id: str | None = None


@dataclass(frozen=True)
class Finding:
    """Situação detectada por uma regra, antes de virar recomendação."""

    type: str
    subject_id: str | None
    subject_name: str | None
    evidence: tuple[Evidence, ...]
    confidence: float
    priority: int
    message_params: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class Recommendation:
    id: str
    type: str
    message: str
    evidence: tuple[Evidence, ...]
    next_action: str | None
    confidence: float | None
    requires_human_validation: bool
    priority: int
    subject_id: str | None


@dataclass(frozen=True)
class AgentResult:
    run_id: str
    agent: str
    agent_version: str
    config_version: str
    status: RunStatus
    summary: str
    recommendations: tuple[Recommendation, ...]
    confidence: float | None
    requires_human_validation: bool
    abstained: bool
    abstention_reason: str | None
    evaluated_at: datetime
