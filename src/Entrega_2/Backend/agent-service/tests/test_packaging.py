"""Empacotamento: a Vercel lê pyproject.toml; Docker e CI leem requirements.txt — as dependências são as mesmas."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pyproject_and_requirements_list_the_same_dependencies():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    requirements = [
        line.strip()
        for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    assert sorted(pyproject["project"]["dependencies"]) == sorted(requirements)


def test_vercel_entrypoint_points_to_the_fastapi_app():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    module, attribute = pyproject["tool"]["vercel"]["entrypoint"].split(":")
    assert (ROOT / Path(*module.split("."))).with_suffix(".py").is_file()
    assert attribute == "app"
