"""Contrato interno v1 Node.js ↔ Agent Service (Pydantic).

Espelha contracts/agent/student-agent-request.v1.json e
student-agent-response.v1.json. Qualquer alteração aqui exige atualizar os
JSON Schemas e os exemplos usados nos testes de contrato.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CONTRACT_MAJOR_PATTERN = r"^\d+\.\d+$"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SubjectSchema(StrictModel):
    id: str = Field(min_length=1)
    code: str
    name: str
    enrollment_status: Literal["active", "completed", "cancelled"] = "active"


class PendingItemSchema(StrictModel):
    id: str = Field(min_length=1)
    subject_id: str | None = None
    type: str
    description: str | None = None
    due_date: date | None = None
    status: Literal["pending", "completed", "overdue"]


class AttendanceSchema(StrictModel):
    subject_id: str = Field(min_length=1)
    total_classes: int = Field(ge=0)
    attended_classes: int = Field(ge=0)


class AssessmentSchema(StrictModel):
    id: str = Field(min_length=1)
    subject_id: str = Field(min_length=1)
    title: str
    type: Literal["exam", "assignment", "project", "other"] = "other"
    score: float | None = None
    max_score: float = Field(gt=0)
    applied_at: date | None = None


class AcademicContextSchema(StrictModel):
    subjects: list[SubjectSchema] = Field(default_factory=list)
    pending_items: list[PendingItemSchema] = Field(default_factory=list)
    attendance: list[AttendanceSchema] = Field(default_factory=list)
    assessments: list[AssessmentSchema] = Field(default_factory=list)


class StudentAgentRequest(StrictModel):
    contract_version: str = Field(pattern=CONTRACT_MAJOR_PATTERN)
    request_id: str = Field(min_length=1)
    correlation_id: str = Field(min_length=1)
    student_id: str = Field(min_length=1)
    reference_date: date | None = None
    academic_context: AcademicContextSchema

    @field_validator("contract_version")
    @classmethod
    def _major_must_be_supported(cls, value: str) -> str:
        # A verificação do major acontece antes da validação completa (ver routes.py);
        # aqui apenas garantimos o formato.
        return value


class EvidenceSchema(StrictModel):
    type: str
    description: str
    source_reference: str | None = None


class RecommendationSchema(StrictModel):
    id: str
    type: str
    message: str
    evidence: list[EvidenceSchema] = Field(min_length=1)
    next_action: str | None
    confidence: float | None = Field(default=None, ge=0, le=1)
    requires_human_validation: bool
    priority: int = Field(ge=1)
    subject_id: str | None


class StudentAgentResponse(StrictModel):
    contract_version: str
    request_id: str
    correlation_id: str
    run_id: str
    agent: Literal["student_agent"]
    agent_version: str
    config_version: str
    status: Literal["recommendation", "no_action", "abstained"]
    summary: str
    recommendations: list[RecommendationSchema]
    confidence: float | None = Field(default=None, ge=0, le=1)
    requires_human_validation: bool
    abstained: bool
    abstention_reason: str | None
    evaluated_at: datetime


class ErrorDetail(StrictModel):
    field: str
    message: str


class ErrorBody(StrictModel):
    code: str
    message: str
    request_id: str | None = None
    correlation_id: str | None = None
    details: list[ErrorDetail] | None = None


class ErrorResponse(StrictModel):
    error: ErrorBody


class HealthResponse(StrictModel):
    status: Literal["ok"]
    service: Literal["agent-service"]
    agent: str
    agent_version: str
    config_version: str
    contract_version: str


def parse_major(contract_version: str) -> int | None:
    head, _, _ = contract_version.partition(".")
    return int(head) if head.isdigit() else None
