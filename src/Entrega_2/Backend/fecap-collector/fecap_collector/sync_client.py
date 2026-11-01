from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime

import httpx

from .config import Settings
from .models import PortalInventory

logger = logging.getLogger(__name__)


def iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def push_inventory(settings: Settings, inventory: PortalInventory) -> dict[str, object]:
    if not settings.sync_enabled:
        raise RuntimeError("Sincronização remota está desligada. Defina FECAP_SYNC_ENABLED=true para habilitá-la.")
    if not settings.asa_api_base_url or not settings.asa_internal_sync_token:
        raise RuntimeError("Configure a URL da API e o token pessoal revogável emitido pelo ASA Conecta.")
    # O conteúdo acadêmico permanece no dispositivo do estudante. A API remota
    # recebe apenas métricas da execução; nenhum título, URL, texto ou tabela.
    safe_errors = [
        {"route": "", "code": "local_scan_issue", "message": "A leitura local encontrou uma falha."}
        for _ in inventory.errors[:500]
    ]
    known_auth_states = {"authenticated", "pending", "unauthenticated", "manual_required"}
    auth_status = inventory.auth_status if inventory.auth_status in known_auth_states else "unknown"
    body = {
        "sessionId": hashlib.sha256(inventory.session_id.encode("utf-8")).hexdigest(),
        "startedAt": iso_utc(inventory.started_at),
        "finishedAt": iso_utc(inventory.finished_at or inventory.started_at),
        "authStatus": auth_status,
        "scraplingVersion": inventory.scrapling_version,
        "parserVersion": inventory.parser_version,
        "recordsExtracted": sum(len(table.rows) for route in inventory.routes for table in route.tables),
        "routes": [],
        "errors": safe_errors,
    }
    url = settings.asa_api_base_url.rstrip("/") + "/api/v1/portal/sync"
    with httpx.Client(timeout=settings.timeout_ms / 1000, follow_redirects=False) as client:
        response = client.post(url, json=body, headers={"Authorization": f"Bearer {settings.asa_internal_sync_token}"})
    if response.status_code == 401:
        raise RuntimeError("O token do ASA Conecta expirou ou foi revogado. Gere um novo token na sua conta.")
    if response.status_code >= 400:
        logger.error("asa_sync_failed http_status=%d", response.status_code)
        raise RuntimeError(f"A API do ASA Conecta recusou a sincronização (HTTP {response.status_code}).")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("A API do ASA Conecta retornou uma resposta incompatível.")
    return result
