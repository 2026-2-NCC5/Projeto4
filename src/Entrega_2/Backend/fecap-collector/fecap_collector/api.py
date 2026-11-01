from __future__ import annotations

import secrets
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from . import __version__
from .config import load_settings
from .storage import LocalInventoryStore

app = FastAPI(title="ASA FECAP Portal Collector", version=__version__, docs_url=None, redoc_url=None)


def _authorize(authorization: str | None = Header(default=None)) -> None:
    expected = load_settings().asa_internal_sync_token
    if not expected:
        raise HTTPException(status_code=503, detail="Token de acesso local não configurado.")
    actual = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(actual, expected):
        raise HTTPException(status_code=401, detail="Não autenticado.")


@app.get("/health")
def health() -> dict[str, str]:
    settings = load_settings()
    return {"status": "ok", "service": "fecap-portal-collector", "mode": settings.crawl_mode}


@app.get("/api/v1/portal/status", dependencies=[Depends(_authorize)])
def status() -> dict[str, Any]:
    settings = load_settings()
    latest = LocalInventoryStore(settings.data_dir).latest()
    if latest is None:
        return {"status": "not_scanned", "pagesVisited": 0, "lastSyncAt": None}
    return {
        "status": "ready",
        "sessionId": latest.session_id,
        "authStatus": latest.auth_status,
        "pagesDiscovered": latest.pages_discovered,
        "pagesVisited": latest.pages_visited,
        "lastSyncAt": latest.finished_at.isoformat() if latest.finished_at else None,
        "errors": len(latest.errors),
    }


@app.get("/api/v1/portal/navigation", dependencies=[Depends(_authorize)])
def navigation() -> dict[str, Any]:
    settings = load_settings()
    latest = LocalInventoryStore(settings.data_dir).latest()
    if latest is None:
        raise HTTPException(status_code=404, detail="Inventário local ausente.")
    return {
        "sessionId": latest.session_id,
        "routes": [
            {
                "routeId": route.route_id,
                "title": route.title,
                "route": route.route,
                "parentRoute": route.parent_route,
                "breadcrumbs": route.breadcrumbs,
                "kind": route.page_kind,
                "result": route.result,
                "documentCount": len(route.documents),
                "warnings": route.warnings,
            }
            for route in latest.routes
        ],
    }
