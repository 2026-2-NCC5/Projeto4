"""Student Agent Engine — lógica de domínio independente de HTTP."""

from app.agent.config import AgentConfig, ConfigError, load_config
from app.agent.engine import FORBIDDEN_ACTIONS, StudentAgentEngine
from app.agent.models import (
    AcademicContext,
    AgentResult,
    Assessment,
    AttendanceRecord,
    EvaluationInput,
    Evidence,
    PendingItem,
    Recommendation,
    Subject,
)

__all__ = [
    "FORBIDDEN_ACTIONS",
    "AcademicContext",
    "AgentConfig",
    "AgentResult",
    "Assessment",
    "AttendanceRecord",
    "ConfigError",
    "EvaluationInput",
    "Evidence",
    "PendingItem",
    "Recommendation",
    "StudentAgentEngine",
    "Subject",
    "load_config",
]
