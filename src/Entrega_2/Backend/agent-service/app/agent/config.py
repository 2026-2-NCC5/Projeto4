"""Carregamento e validação da configuração externa do agente (YAML).

Regras, limiares e versões ficam em app/config/*.yaml (TASK-001 §14,
TASK-004 §57-59). Nenhum valor crítico é hardcoded nos módulos do engine.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


class ConfigError(ValueError):
    """Configuração ausente ou inválida."""


@dataclass(frozen=True)
class AttendanceThresholds:
    attention_rate: float
    critical_rate: float
    minimum_classes_for_full_confidence: int


@dataclass(frozen=True)
class PerformanceThresholds:
    attention_ratio: float
    minimum_assessments: int
    assessments_for_full_confidence: int


@dataclass(frozen=True)
class PendingThresholds:
    due_soon_days: int


@dataclass(frozen=True)
class Thresholds:
    minimum_confidence: float
    attendance: AttendanceThresholds
    performance: PerformanceThresholds
    pending: PendingThresholds
    require_any_collection: bool


@dataclass(frozen=True)
class RuleConfig:
    type: str
    enabled: bool
    base_confidence: float
    priority: int
    message: str
    next_action: str | None
    requires_human_validation: bool
    message_plural: str | None = None
    small_sample_penalty: float = 0.0
    single_assessment_penalty: float = 0.0


@dataclass(frozen=True)
class Summaries:
    recommendation_single: str
    recommendation_multiple: str
    human_validation: str
    no_action: str
    abstained: str


@dataclass(frozen=True)
class AbstentionConfig:
    enabled: bool
    insufficient_data_reason: str
    low_confidence_reason: str
    no_action_base_confidence: float
    no_action_thin_data_confidence: float


@dataclass(frozen=True)
class AgentConfig:
    agent_name: str
    agent_version: str
    config_version: str
    contract_version: str
    contract_supported_major: int
    thresholds: Thresholds
    rules: dict[str, RuleConfig]
    summaries: Summaries
    abstention: AbstentionConfig

    def rule(self, rule_type: str) -> RuleConfig:
        try:
            return self.rules[rule_type]
        except KeyError as exc:  # pragma: no cover - configuração incompleta
            raise ConfigError(f"Regra '{rule_type}' não configurada em rules.yaml") from exc


def _require(mapping: dict[str, Any], key: str, file_name: str) -> Any:
    if key not in mapping:
        raise ConfigError(f"Chave obrigatória '{key}' ausente em {file_name}")
    return mapping[key]


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Arquivo de configuração não encontrado: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ConfigError(f"Conteúdo inválido em {path}")
    return data


def _ratio(value: Any, name: str) -> float:
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise ConfigError(f"'{name}' deve estar entre 0 e 1 (recebido {value})")
    return number


def load_config(config_dir: str | os.PathLike[str] | None = None) -> AgentConfig:
    """Lê agent.yaml, thresholds.yaml e rules.yaml e devolve um AgentConfig imutável."""

    base = Path(config_dir or os.environ.get("AGENT_CONFIG_DIR") or DEFAULT_CONFIG_DIR)

    agent_yaml = _load_yaml(base / "agent.yaml")
    thresholds_yaml = _load_yaml(base / "thresholds.yaml")
    rules_yaml = _load_yaml(base / "rules.yaml")

    agent = _require(agent_yaml, "agent", "agent.yaml")
    contracts = _require(agent_yaml, "contracts", "agent.yaml")

    confidence = _require(thresholds_yaml, "confidence", "thresholds.yaml")
    attendance = _require(thresholds_yaml, "attendance", "thresholds.yaml")
    performance = _require(thresholds_yaml, "performance", "thresholds.yaml")
    pending = _require(thresholds_yaml, "pending", "thresholds.yaml")
    sufficiency = _require(thresholds_yaml, "data_sufficiency", "thresholds.yaml")

    attendance_thresholds = AttendanceThresholds(
        attention_rate=_ratio(_require(attendance, "attention_rate", "thresholds.yaml"), "attention_rate"),
        critical_rate=_ratio(_require(attendance, "critical_rate", "thresholds.yaml"), "critical_rate"),
        minimum_classes_for_full_confidence=int(
            _require(attendance, "minimum_classes_for_full_confidence", "thresholds.yaml")
        ),
    )
    if attendance_thresholds.critical_rate > attendance_thresholds.attention_rate:
        raise ConfigError("attendance.critical_rate deve ser <= attendance.attention_rate")

    thresholds = Thresholds(
        minimum_confidence=_ratio(_require(confidence, "minimum", "thresholds.yaml"), "confidence.minimum"),
        attendance=attendance_thresholds,
        performance=PerformanceThresholds(
            attention_ratio=_ratio(_require(performance, "attention_ratio", "thresholds.yaml"), "attention_ratio"),
            minimum_assessments=int(_require(performance, "minimum_assessments", "thresholds.yaml")),
            assessments_for_full_confidence=int(
                _require(performance, "assessments_for_full_confidence", "thresholds.yaml")
            ),
        ),
        pending=PendingThresholds(due_soon_days=int(_require(pending, "due_soon_days", "thresholds.yaml"))),
        require_any_collection=bool(_require(sufficiency, "require_any_collection", "thresholds.yaml")),
    )

    rules: dict[str, RuleConfig] = {}
    for rule_type, raw in _require(rules_yaml, "rules", "rules.yaml").items():
        rules[rule_type] = RuleConfig(
            type=rule_type,
            enabled=bool(raw.get("enabled", True)),
            base_confidence=_ratio(_require(raw, "base_confidence", "rules.yaml"), f"{rule_type}.base_confidence"),
            priority=int(raw.get("priority", 1)),
            message=str(_require(raw, "message", "rules.yaml")),
            next_action=raw.get("next_action"),
            requires_human_validation=bool(raw.get("requires_human_validation", False)),
            message_plural=raw.get("message_plural"),
            small_sample_penalty=float(raw.get("small_sample_penalty", 0.0)),
            single_assessment_penalty=float(raw.get("single_assessment_penalty", 0.0)),
        )

    summaries_raw = _require(rules_yaml, "summaries", "rules.yaml")
    summaries = Summaries(
        recommendation_single=str(_require(summaries_raw, "recommendation_single", "rules.yaml")),
        recommendation_multiple=str(_require(summaries_raw, "recommendation_multiple", "rules.yaml")),
        human_validation=str(_require(summaries_raw, "human_validation", "rules.yaml")),
        no_action=str(_require(summaries_raw, "no_action", "rules.yaml")),
        abstained=str(_require(summaries_raw, "abstained", "rules.yaml")),
    )

    abstention_raw = _require(rules_yaml, "abstention", "rules.yaml")
    abstention = AbstentionConfig(
        enabled=bool(abstention_raw.get("enabled", True)),
        insufficient_data_reason=str(_require(abstention_raw, "insufficient_data_reason", "rules.yaml")),
        low_confidence_reason=str(_require(abstention_raw, "low_confidence_reason", "rules.yaml")),
        no_action_base_confidence=_ratio(
            _require(abstention_raw, "no_action_base_confidence", "rules.yaml"), "no_action_base_confidence"
        ),
        no_action_thin_data_confidence=_ratio(
            _require(abstention_raw, "no_action_thin_data_confidence", "rules.yaml"),
            "no_action_thin_data_confidence",
        ),
    )

    return AgentConfig(
        agent_name=str(_require(agent, "name", "agent.yaml")),
        agent_version=str(_require(agent, "version", "agent.yaml")),
        config_version=str(_require(agent_yaml, "config_version", "agent.yaml")),
        contract_version=str(_require(contracts, "version", "agent.yaml")),
        contract_supported_major=int(_require(contracts, "supported_major", "agent.yaml")),
        thresholds=thresholds,
        rules=rules,
        summaries=summaries,
        abstention=abstention,
    )
