from datetime import UTC, datetime

from fecap_collector.models import PortalInventory, PortalRoute
from fecap_collector.storage import LocalInventoryStore


def test_inventory_is_private_and_export_map_omits_page_text(tmp_path):
    inventory = PortalInventory(
        session_id="test-001",
        started_at=datetime.now(UTC),
        auth_status="authenticated",
        scrapling_version="0.4.15",
        routes=[
            PortalRoute(
                route_id="route-1",
                title="Notas",
                route="https://portal.fecap.br/#/notas",
                state_signature="sig",
                page_kind="academic",
                text="dado confidencial fixture",
            )
        ],
    )
    store = LocalInventoryStore(tmp_path / ".private")
    saved = store.save(inventory)
    assert (saved.stat().st_mode & 0o777) == 0o600
    export = store.export_map(tmp_path / "map.json")
    assert "dado confidencial" not in export.read_text()
    assert store.latest().session_id == "test-001"
