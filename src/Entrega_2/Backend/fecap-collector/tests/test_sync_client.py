from datetime import UTC, datetime

from fecap_collector import sync_client
from fecap_collector.config import load_settings
from fecap_collector.models import PortalInventory, PortalRoute


def test_sync_payload_uses_api_contract_and_utc_timestamps(monkeypatch, tmp_path):
    monkeypatch.setenv("FECAP_SYNC_ENABLED", "true")
    monkeypatch.setenv("ASA_API_BASE_URL", "https://asa.example.test")
    monkeypatch.setenv("ASA_INTERNAL_SYNC_TOKEN", "personal-test-token")
    monkeypatch.setenv("FECAP_DATA_DIR", str(tmp_path))
    route = PortalRoute(
        route_id="abc123",
        title="Página fictícia",
        route="https://portal.fecap.br/#/home",
        state_signature="state-signature",
        page_kind="unclassified",
        visited_at=datetime(2026, 10, 31, tzinfo=UTC),
        text="fixture",
    )
    inventory = PortalInventory(
        session_id="session-fake",
        started_at=datetime(2026, 10, 31, tzinfo=UTC),
        finished_at=datetime(2026, 10, 31, 0, 1, tzinfo=UTC),
        auth_status="authenticated",
        scrapling_version="0.4.15",
        routes=[route],
    )
    captured = {}

    class Response:
        status_code = 202

        @staticmethod
        def json():
            return {"data": {"status": "completed"}}

    class Client:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def post(self, _url, *, json, headers):
            captured["body"] = json
            captured["headers"] = headers
            return Response()

    monkeypatch.setattr(sync_client.httpx, "Client", Client)
    result = sync_client.push_inventory(load_settings(), inventory)
    body = captured["body"]
    assert result["data"]["status"] == "completed"
    assert body["startedAt"].endswith("Z")
    assert body["routes"][0]["stateSignature"] == "state-signature"
    assert body["routes"][0]["contentHash"]
    assert "state_signature" not in body["routes"][0]
    assert captured["headers"]["Authorization"] == "Bearer personal-test-token"
