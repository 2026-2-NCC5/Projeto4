from datetime import UTC, datetime

from fastapi.testclient import TestClient

from fecap_collector.api import app
from fecap_collector.config import load_settings
from fecap_collector.models import PortalInventory, PortalRoute, PortalTable
from fecap_collector.storage import LocalInventoryStore


def test_academic_data_requires_local_agent_token(monkeypatch, tmp_path):
    monkeypatch.setenv("ASA_INTERNAL_SYNC_TOKEN", "local-test-token")
    monkeypatch.setenv("FECAP_DATA_DIR", str(tmp_path))
    response = TestClient(app).get("/api/v1/portal/data")
    assert response.status_code == 401


def test_academic_data_is_read_from_authenticated_local_inventory(monkeypatch, tmp_path):
    monkeypatch.setenv("ASA_INTERNAL_SYNC_TOKEN", "local-test-token")
    monkeypatch.setenv("FECAP_DATA_DIR", str(tmp_path))
    now = datetime.now(UTC)
    inventory = PortalInventory(
        session_id="test-session",
        started_at=now,
        finished_at=now,
        auth_status="authenticated",
        scrapling_version="test",
        pages_visited=1,
        pages_discovered=1,
        routes=[
            PortalRoute(
                route_id="academic-page",
                title="Notas do período",
                route="https://portal.fecap.br/#/grades",
                state_signature="test-signature",
                page_kind="academic",
                text="Registro sintético de avaliação usado somente no teste.",
                tables=[PortalTable(headers=["Disciplina", "Nota"], rows=[["Registro sintético", "8,0"]])],
            )
        ],
    )
    settings = load_settings()
    LocalInventoryStore(settings.data_dir, settings.data_retention_minutes).save(inventory)

    response = TestClient(app).get(
        "/api/v1/portal/data?q=NOTAS&category=academic",
        headers={"Authorization": "Bearer local-test-token"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["source"].startswith("Portal Educacional FECAP")
    assert payload["returned"] == 1
    assert payload["records"][0]["tables"][0]["rows"][0] == ["Registro sintético", "8,0"]
    assert "route" not in payload["records"][0]


def test_local_agent_allows_configured_frontend_origin(monkeypatch):
    response = TestClient(app).options(
        "/api/v1/portal/data",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
