from __future__ import annotations

import secrets
import threading
import unicodedata
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import load_settings
from .crawler import ReadOnlyPortalCrawler
from .storage import LocalInventoryStore

app = FastAPI(title="ASA FECAP Portal Collector", version=__version__, docs_url=None, redoc_url=None)
_scan_lock = threading.Lock()
_scan_state: dict[str, Any] = {"status": "idle", "startedAt": None, "finishedAt": None, "error": None}


def _allowed_origins() -> list[str]:
    return list(load_settings().local_allowed_origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=300,
)


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


def _latest_store() -> LocalInventoryStore:
    settings = load_settings()
    return LocalInventoryStore(settings.data_dir, settings.data_retention_minutes)


def _run_scan() -> None:
    with _scan_lock:
        _scan_state.update(status="running", startedAt=None, finishedAt=None, error=None)
    try:
        settings = load_settings()
        inventory = ReadOnlyPortalCrawler(settings).scan()
        with _scan_lock:
            _scan_state.update(
                status="completed" if inventory.auth_status == "authenticated" else "not_authenticated",
                startedAt=inventory.started_at.isoformat(),
                finishedAt=inventory.finished_at.isoformat() if inventory.finished_at else None,
                pagesVisited=inventory.pages_visited,
                errors=len(inventory.errors),
                error=None,
            )
    except Exception as error:
        # Nunca devolve mensagens que possam conter URLs, conteúdo da página ou valores de formulário.
        with _scan_lock:
            _scan_state.update(status="failed", finishedAt=None, error=type(error).__name__)


@app.post("/api/v1/portal/scan", status_code=202, dependencies=[Depends(_authorize)])
def start_scan(background_tasks: BackgroundTasks) -> dict[str, str]:
    with _scan_lock:
        if _scan_state["status"] in {"queued", "running"}:
            raise HTTPException(status_code=409, detail="Já existe uma leitura em andamento.")
        _scan_state.update(status="queued", error=None)
    background_tasks.add_task(_run_scan)
    return {
        "status": "queued",
        "message": "A leitura local foi iniciada. Conclua a autenticação na janela do Portal, se solicitada.",
    }


@app.get("/api/v1/portal/scan", dependencies=[Depends(_authorize)])
def scan_status(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    with _scan_lock:
        result = dict(_scan_state)
    if result["status"] == "idle":
        result["status"] = "not_started"
    return result


@app.get("/api/v1/portal/status", dependencies=[Depends(_authorize)])
def status() -> dict[str, Any]:
    settings = load_settings()
    latest = LocalInventoryStore(settings.data_dir, settings.data_retention_minutes).latest()
    if latest is None:
        with _scan_lock:
            scan = dict(_scan_state)
        return {"status": "not_scanned", "authenticated": False, "pagesVisited": 0, "lastSyncAt": None, "scan": scan}
    with _scan_lock:
        scan = dict(_scan_state)
    if scan["status"] in {"idle", "not_started"} and latest.auth_status == "authenticated":
        scan.update(
            status="completed",
            startedAt=latest.started_at.isoformat(),
            finishedAt=latest.finished_at.isoformat() if latest.finished_at else None,
            pagesVisited=latest.pages_visited,
            errors=len(latest.errors),
        )
    return {
        "status": "ready" if latest.auth_status == "authenticated" else "not_authenticated",
        "authenticated": latest.auth_status == "authenticated",
        "pagesDiscovered": latest.pages_discovered,
        "pagesVisited": latest.pages_visited,
        "lastSyncAt": latest.finished_at.isoformat() if latest.finished_at else None,
        "errors": len(latest.errors),
        "scan": scan,
    }


@app.get("/api/v1/portal/navigation", dependencies=[Depends(_authorize)])
def navigation() -> dict[str, Any]:
    settings = load_settings()
    latest = LocalInventoryStore(settings.data_dir, settings.data_retention_minutes).latest()
    if latest is None:
        raise HTTPException(status_code=404, detail="Inventário local ausente.")
    return {
        "generatedAt": latest.finished_at.isoformat() if latest.finished_at else None,
        "routes": [
            {
                "routeId": route.route_id,
                "title": route.title,
                "kind": route.page_kind,
                "result": route.result,
                "documentCount": len(route.documents),
            }
            for route in latest.routes
        ],
    }


@app.get("/api/v1/portal/data", dependencies=[Depends(_authorize)])
def academic_data(
    response: Response,
    q: str = "",
    category: str = "",
    limit: int = 30,
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    latest = _latest_store().latest()
    if latest is None:
        raise HTTPException(status_code=404, detail="Nenhuma leitura local disponível ou a leitura expirou.")
    if latest.auth_status != "authenticated":
        raise HTTPException(
            status_code=409,
            detail="A sessão do Portal não foi confirmada. Faça a autenticação no site oficial.",
        )
    normalized_query = " ".join(unicodedata.normalize("NFKD", q).casefold().split())
    normalized_query = "".join(char for char in normalized_query if not unicodedata.combining(char))[:120]
    normalized_category = category.strip().casefold()[:40]
    bounded_limit = max(1, min(limit, 50))
    records: list[dict[str, Any]] = []
    for route in latest.routes:
        haystack = unicodedata.normalize("NFKD", f"{route.title} {route.page_kind} {route.text}").casefold()
        haystack = "".join(char for char in haystack if not unicodedata.combining(char))
        if normalized_category and route.page_kind.casefold() != normalized_category:
            continue
        if normalized_query and normalized_query not in haystack:
            continue
        records.append({
            "id": route.route_id,
            "title": route.title[:300],
            "category": route.page_kind,
            "capturedAt": route.visited_at.isoformat(),
            "text": route.text[:6000],
            "tables": [
                {
                    "headers": [header[:200] for header in table.headers[:20]],
                    "rows": [[cell[:500] for cell in row[:20]] for row in table.rows[:50]],
                }
                for table in route.tables[:5]
            ],
        })
        if len(records) >= bounded_limit:
            break
    return {
        "source": "Portal Educacional FECAP — leitura local do navegador do estudante",
        "authenticatedAt": latest.finished_at.isoformat() if latest.finished_at else None,
        "totalAvailable": len(latest.routes),
        "returned": len(records),
        "records": records,
    }
