from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from app.agent.config import load_config
from app.agent.engine import StudentAgentEngine


@pytest.fixture
def config():
    return load_config()


@pytest.fixture
def engine(config):
    counter = itertools.count(1)
    return StudentAgentEngine(
        config,
        id_factory=lambda: f"test{next(counter):04d}",
        clock=lambda: datetime(2026, 9, 16, 12, 0, tzinfo=UTC),
    )
