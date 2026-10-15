"""Política de abstenção do Agente para o Estudante (TASK-001 §10, TASK-004 §48-49).

A abstenção é um resultado válido, nunca um erro técnico.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.agent.config import AgentConfig
from app.agent.models import AcademicContext, Finding


@dataclass(frozen=True)
class AbstentionDecision:
    abstained: bool
    reason: str | None = None
    confidence: float | None = None


def check_data_sufficiency(context: AcademicContext, config: AgentConfig) -> AbstentionDecision:
    """SCENARIO-006: nenhuma coleção com dados → abstenção por dados insuficientes."""

    if not config.abstention.enabled:
        return AbstentionDecision(False)
    if config.thresholds.require_any_collection and context.is_empty():
        return AbstentionDecision(True, config.abstention.insufficient_data_reason, None)
    return AbstentionDecision(False)


def split_by_confidence(findings: list[Finding], config: AgentConfig) -> tuple[list[Finding], list[Finding]]:
    """Separa situações que atingem o limiar mínimo de confiança das que não atingem."""

    minimum = config.thresholds.minimum_confidence
    retained = [item for item in findings if item.confidence >= minimum]
    dropped = [item for item in findings if item.confidence < minimum]
    return retained, dropped


def decide_without_recommendations(
    context: AcademicContext, dropped: list[Finding], config: AgentConfig
) -> AbstentionDecision:
    """Decide entre no_action e abstenção quando nenhuma recomendação foi retida."""

    abstention = config.abstention
    if dropped:
        best = max(item.confidence for item in dropped)
        if abstention.enabled:
            return AbstentionDecision(True, abstention.low_confidence_reason, best)
        return AbstentionDecision(False, None, best)

    # Sem nenhuma situação detectada: a confiança em "nenhuma ação" depende de
    # existirem dados observáveis (frequência, avaliações ou pendências).
    has_observable_data = bool(context.attendance or context.assessments or context.pending_items)
    confidence = (
        abstention.no_action_base_confidence if has_observable_data else abstention.no_action_thin_data_confidence
    )
    if abstention.enabled and confidence < config.thresholds.minimum_confidence:
        return AbstentionDecision(True, abstention.insufficient_data_reason, confidence)
    return AbstentionDecision(False, None, confidence)
