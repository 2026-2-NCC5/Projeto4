"""Logs estruturados (JSON por linha) sem dados sensíveis (TASK-004 §62-63)."""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime

SERVICE_NAME = "agent-service"
SAFE_EXTRA_KEYS = ("request_id", "correlation_id", "run_id", "status", "duration_ms", "http_status", "path", "code")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "service": SERVICE_NAME,
            "level": record.levelname.lower(),
            "message": record.getMessage(),
        }
        for key in SAFE_EXTRA_KEYS:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info and record.levelno >= logging.ERROR:
            payload["exception_type"] = record.exc_info[0].__name__ if record.exc_info[0] else "Exception"
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> logging.Logger:
    level = os.environ.get("AGENT_LOG_LEVEL", "INFO").upper()
    logger = logging.getLogger("asa.agent_service")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
    return logger
