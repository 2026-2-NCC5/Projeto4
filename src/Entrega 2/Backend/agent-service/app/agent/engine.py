"""Student Agent Engine — orquestra validação, regras, recomendações e abstenção.

Uso direto (sem FastAPI)::

    engine = StudentAgentEngine(load_config())
    result = engine.evaluate(evaluation_input)

O engine não conhece HTTP, headers, JWT ou banco de dados (TASK-001 §4).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.agent import abstention as abstention_policy
from app.agent.config import AgentConfig, load_config
from app.agent.evaluator import detect_findings, validate_context
from app.agent.models import AgentResult, EvaluationInput
from app.agent.recommendations import build_recommendations, build_summary, overall_confidence

# Ações administrativas que o agente NUNCA executa (TASK-004 §51). A lista é
# mantida aqui apenas para documentação e testes de segurança decisória.
FORBIDDEN_ACTIONS: tuple[str, ...] = (
    "change_enrollment",
    "cancel_enrollment",
    "fail_student",
    "change_grade",
    "change_attendance",
    "apply_penalty",
    "block_student",
    "restrict_rights",
    "modify_official_record",
)


def _default_id_factory() -> str:
    return uuid.uuid4().hex[:12]


class StudentAgentEngine:
    def __init__(
        self,
        config: AgentConfig | None = None,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config or load_config()
        self._id_factory = id_factory or _default_id_factory
        self._clock = clock or (lambda: datetime.now(UTC))

    @property
    def agent_version(self) -> str:
        return self.config.agent_version

    @property
    def config_version(self) -> str:
        return self.config.config_version

    def evaluate(self, evaluation: EvaluationInput) -> AgentResult:
        config = self.config
        run_id = f"run-{self._id_factory()}"
        evaluated_at = self._clock()

        def result(**kwargs: object) -> AgentResult:
            base = {
                "run_id": run_id,
                "agent": config.agent_name,
                "agent_version": config.agent_version,
                "config_version": config.config_version,
                "evaluated_at": evaluated_at,
            }
            base.update(kwargs)
            return AgentResult(**base)  # type: ignore[arg-type]

        # 1. Dados suficientes? (SCENARIO-006)
        sufficiency = abstention_policy.check_data_sufficiency(evaluation.academic_context, config)
        if sufficiency.abstained:
            return result(
                status="abstained",
                summary=config.summaries.abstained,
                recommendations=(),
                confidence=sufficiency.confidence,
                requires_human_validation=False,
                abstained=True,
                abstention_reason=sufficiency.reason,
            )

        # 2. Validação de consistência (SCENARIO-007) e regras determinísticas
        clean_context, inconsistencies = validate_context(evaluation.academic_context, evaluation.reference_date)
        findings = detect_findings(clean_context, inconsistencies, evaluation.reference_date, config)

        # 3. Política de confiança mínima
        retained, dropped = abstention_policy.split_by_confidence(findings, config)

        if not retained:
            decision = abstention_policy.decide_without_recommendations(clean_context, dropped, config)
            if decision.abstained:
                return result(
                    status="abstained",
                    summary=config.summaries.abstained,
                    recommendations=(),
                    confidence=decision.confidence,
                    requires_human_validation=False,
                    abstained=True,
                    abstention_reason=decision.reason,
                )
            return result(
                status="no_action",
                summary=config.summaries.no_action,
                recommendations=(),
                confidence=decision.confidence,
                requires_human_validation=False,
                abstained=False,
                abstention_reason=None,
            )

        # 4. Recomendações explicáveis com evidência e próxima ação
        recommendations = build_recommendations(retained, config, self._id_factory)
        return result(
            status="recommendation",
            summary=build_summary(recommendations, config),
            recommendations=recommendations,
            confidence=overall_confidence(recommendations),
            requires_human_validation=any(item.requires_human_validation for item in recommendations),
            abstained=False,
            abstention_reason=None,
        )
