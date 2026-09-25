"""Conversão de situações detectadas (Finding) em recomendações explicáveis."""

from __future__ import annotations

from collections.abc import Callable

from app.agent.config import AgentConfig
from app.agent.models import Finding, Recommendation


def _format(template: str, params: dict[str, object]) -> str:
    try:
        return template.format(**params)
    except (KeyError, IndexError):
        return template


def build_recommendation(finding: Finding, config: AgentConfig, id_factory: Callable[[], str]) -> Recommendation:
    rule = config.rule(finding.type)
    message = rule.message
    count = finding.message_params.get("count")
    if rule.message_plural and isinstance(count, int) and count > 1:
        message = rule.message_plural
    return Recommendation(
        id=f"rec-{id_factory()}",
        type=finding.type,
        message=_format(message, finding.message_params),
        evidence=finding.evidence,
        next_action=rule.next_action,
        confidence=finding.confidence,
        requires_human_validation=rule.requires_human_validation,
        priority=finding.priority,
        subject_id=finding.subject_id,
    )


def build_recommendations(
    findings: list[Finding], config: AgentConfig, id_factory: Callable[[], str]
) -> tuple[Recommendation, ...]:
    return tuple(build_recommendation(finding, config, id_factory) for finding in findings)


def overall_confidence(recommendations: tuple[Recommendation, ...]) -> float | None:
    values = [item.confidence for item in recommendations if item.confidence is not None]
    if not values:
        return None
    return round(sum(values) / len(values) + 1e-9, 2)


def build_summary(recommendations: tuple[Recommendation, ...], config: AgentConfig) -> str:
    summaries = config.summaries
    requires_validation = any(item.requires_human_validation for item in recommendations)
    if len(recommendations) == 1:
        return summaries.human_validation if requires_validation else summaries.recommendation_single
    text = _format(summaries.recommendation_multiple, {"count": len(recommendations)})
    if requires_validation:
        text += " Pelo menos uma delas precisa de confirmação por uma pessoa responsável."
    return text
