"""Application layer: adapta o contrato HTTP para o Agent Engine e vice-versa."""

from __future__ import annotations

from datetime import date

from app.agent.engine import StudentAgentEngine
from app.agent.models import (
    AcademicContext,
    AgentResult,
    Assessment,
    AttendanceRecord,
    EvaluationInput,
    PendingItem,
    Subject,
)
from app.contracts.schemas import (
    EvidenceSchema,
    RecommendationSchema,
    StudentAgentRequest,
    StudentAgentResponse,
)


def to_evaluation_input(request: StudentAgentRequest, today: date | None = None) -> EvaluationInput:
    ctx = request.academic_context
    context = AcademicContext(
        subjects=tuple(Subject(s.id, s.code, s.name, s.enrollment_status) for s in ctx.subjects),
        pending_items=tuple(
            PendingItem(p.id, p.type, p.status, p.subject_id, p.description, p.due_date) for p in ctx.pending_items
        ),
        attendance=tuple(AttendanceRecord(a.subject_id, a.total_classes, a.attended_classes) for a in ctx.attendance),
        assessments=tuple(
            Assessment(a.id, a.subject_id, a.title, a.max_score, a.type, a.score, a.applied_at) for a in ctx.assessments
        ),
    )
    return EvaluationInput(
        student_id=request.student_id,
        academic_context=context,
        reference_date=request.reference_date or today or date.today(),
        request_id=request.request_id,
        correlation_id=request.correlation_id,
    )


def to_response(result: AgentResult, request: StudentAgentRequest, contract_version: str) -> StudentAgentResponse:
    return StudentAgentResponse(
        contract_version=contract_version,
        request_id=request.request_id,
        correlation_id=request.correlation_id,
        run_id=result.run_id,
        agent="student_agent",
        agent_version=result.agent_version,
        config_version=result.config_version,
        status=result.status,
        summary=result.summary,
        recommendations=[
            RecommendationSchema(
                id=rec.id,
                type=rec.type,
                message=rec.message,
                evidence=[
                    EvidenceSchema(type=e.type, description=e.description, source_reference=e.source_reference)
                    for e in rec.evidence
                ],
                next_action=rec.next_action,
                confidence=rec.confidence,
                requires_human_validation=rec.requires_human_validation,
                priority=rec.priority,
                subject_id=rec.subject_id,
            )
            for rec in result.recommendations
        ],
        confidence=result.confidence,
        requires_human_validation=result.requires_human_validation,
        abstained=result.abstained,
        abstention_reason=result.abstention_reason,
        evaluated_at=result.evaluated_at,
    )


class EvaluationService:
    def __init__(self, engine: StudentAgentEngine) -> None:
        self.engine = engine

    def evaluate(self, request: StudentAgentRequest) -> StudentAgentResponse:
        evaluation = to_evaluation_input(request)
        result = self.engine.evaluate(evaluation)
        return to_response(result, request, self.engine.config.contract_version)
