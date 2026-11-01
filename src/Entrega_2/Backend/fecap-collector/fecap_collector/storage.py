from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .models import PortalInventory
from .security import ensure_private_directory


class LocalInventoryStore:
    def __init__(self, root: Path):
        self.root = root
        ensure_private_directory(root)

    def save(self, inventory: PortalInventory) -> Path:
        target = self.root / f"sync-{inventory.session_id}.json"
        body = json.dumps(inventory.model_dump(mode="json"), ensure_ascii=False, indent=2).encode("utf-8")
        fd, temp_name = tempfile.mkstemp(prefix=".inventory-", suffix=".tmp", dir=self.root)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as file:
                file.write(body)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temp_name, target)
            target.chmod(0o600)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
        return target

    def latest(self) -> PortalInventory | None:
        files = sorted(self.root.glob("sync-*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not files:
            return None
        return PortalInventory.model_validate_json(files[0].read_text(encoding="utf-8"))

    def export_map(self, target: Path) -> Path:
        inventory = self.latest()
        if not inventory:
            raise FileNotFoundError("Nenhum inventário local foi criado. Execute discover primeiro.")
        export: dict[str, Any] = {
            "generated_at": datetime.now(UTC).isoformat(),
            "session_id": inventory.session_id,
            "auth_status": inventory.auth_status,
            "pages_discovered": inventory.pages_discovered,
            "pages_visited": inventory.pages_visited,
            "routes": [
                {
                    "route_id": route.route_id,
                    "title": route.title,
                    "route": route.route,
                    "parent_route": route.parent_route,
                    "breadcrumbs": route.breadcrumbs,
                    "page_kind": route.page_kind,
                    "result": route.result,
                    "access_status": route.access_status,
                    "tabs": route.tabs,
                    "documents": [item.model_dump(mode="json") for item in route.documents],
                    "forms": [form.model_dump(mode="json") for form in route.forms],
                    "warnings": route.warnings,
                }
                for route in inventory.routes
            ],
            "errors": inventory.errors,
        }
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            target.chmod(0o600)
        except OSError:
            pass
        return target
