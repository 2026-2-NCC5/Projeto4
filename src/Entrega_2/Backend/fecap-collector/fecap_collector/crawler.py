from __future__ import annotations

import logging
import time
from collections import deque
from datetime import UTC, datetime
from hashlib import sha256
from importlib.metadata import version
from typing import Any
from uuid import uuid4

from .browser import PortalBrowser
from .config import Settings
from .models import PortalInventory
from .parser import parse_page, route_in_scope, safe_route_url
from .storage import LocalInventoryStore

logger = logging.getLogger(__name__)
MAX_DISCOVERED_ROUTES = 300
MAX_DEPTH = 8


class ReadOnlyPortalCrawler:
    def __init__(self, settings: Settings, *, max_routes: int = MAX_DISCOVERED_ROUTES, max_depth: int = MAX_DEPTH):
        self.settings = settings
        self.max_routes = max(1, min(max_routes, MAX_DISCOVERED_ROUTES))
        self.max_depth = max(0, min(max_depth, MAX_DEPTH))
        self.store = LocalInventoryStore(settings.data_dir)

    def scan(self, *, resume: bool = False) -> PortalInventory:
        previous = self.store.latest() if resume else None
        if previous and previous.finished_at is None:
            inventory = previous
            inventory.errors.append({"route": "", "code": "resume", "message": "Varredura retomada após interrupção."})
            seen_states = {route.state_signature for route in inventory.routes}
            seen_urls = {route.route for route in inventory.routes}
            pending = [
                (link.url, route.route, route.depth + 1)
                for route in inventory.routes
                for link in route.links
                if (
                    link.in_scope
                    and link.read_only_candidate
                    and link.relation != "document"
                    and link.url not in seen_urls
                )
            ]
            queue: deque[tuple[str, str | None, int]] = deque(pending[: self.max_routes])
        else:
            inventory = PortalInventory(
                session_id=uuid4().hex,
                started_at=datetime.now(UTC),
                auth_status="pending",
                scrapling_version=version("scrapling"),
            )
            seen_states = set()
            seen_urls = set()
            queue = deque([(self.settings.portal_url, None, 0)])
        with PortalBrowser(self.settings) as browser:
            inventory.auth_status = browser.authenticate()
            while queue and len(seen_states) < self.max_routes:
                url, parent_route, depth = queue.popleft()
                if depth > self.max_depth or not route_in_scope(url, self.settings.portal_origin):
                    continue
                sanitized = safe_route_url(url)
                if sanitized in seen_urls:
                    continue
                seen_urls.add(sanitized)
                if inventory.pages_visited:
                    time.sleep(self.settings.request_delay_ms / 1000)
                snapshots: list[tuple[str, str, str | None]] = []

                def inspect(
                    page: Any, snapshots: list[tuple[str, str, str | None]] = snapshots, sanitized: str = sanitized
                ) -> None:
                    browser.wait_for_page_ready(page, timeout_ms=min(20_000, self.settings.timeout_ms))
                    self._expand_navigation(page)
                    snapshots.append((page.content(), page.url, None))
                    tablist = page.locator('[role="tab"]')
                    count = min(tablist.count(), 30)
                    for index in range(count):
                        tab = tablist.nth(index)
                        label = (
                            tab.get_attribute("aria-label") or tab.inner_text() or tab.get_attribute("title") or ""
                        ).strip()[:200]
                        if not label:
                            continue
                        try:
                            tab.click(timeout=1000)
                            page.wait_for_timeout(self.settings.request_delay_ms)
                            snapshots.append((page.content(), page.url, label))
                        except Exception:
                            continue
                    # Só navegação explícita ocorre; formulários e botões ambíguos não são submetidos.
                    if self.settings.capture_screenshots:
                        screenshot_dir = self.settings.data_dir / "screenshots"
                        screenshot_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
                        page.screenshot(
                            path=str(screenshot_dir / f"{sha256(sanitized.encode()).hexdigest()[:16]}.png"),
                            full_page=True,
                        )

                try:
                    response = browser.fetch(url, page_action=inspect)
                    if not snapshots:
                        snapshots.append((response.body, str(getattr(response, "url", url)), None))
                    response_url = str(getattr(response, "url", url))
                    if not route_in_scope(response_url, self.settings.portal_origin):
                        inventory.errors.append(
                            {
                                "route": sanitized,
                                "code": "external_redirect",
                                "message": "Redirecionamento fora do escopo do portal.",
                            }
                        )
                        continue
                    for html, state_url, state_label in snapshots:
                        if not route_in_scope(state_url, self.settings.portal_origin):
                            continue
                        route, discovered = parse_page(
                            html,
                            state_url,
                            self.settings.portal_origin,
                            parent_route,
                            depth,
                            state_label=state_label,
                        )
                        if route.state_signature in seen_states:
                            continue
                        seen_states.add(route.state_signature)
                        inventory.routes.append(route)
                        inventory.pages_visited += 1
                        if depth < self.max_depth:
                            for target in discovered:
                                if len(queue) + len(seen_states) >= self.max_routes:
                                    break
                                if target not in seen_urls:
                                    queue.append((target, route.route, depth + 1))
                    inventory.pages_discovered = len(seen_urls) + len(queue)
                    self.store.save(inventory)
                except Exception as error:
                    # Erros não guardam HTML, headers, query values ou texto da página.
                    inventory.errors.append(
                        {
                            "route": sanitized,
                            "code": type(error).__name__,
                            "message": "Falha de navegação/extrator; verifique o layout e a sessão.",
                        }
                    )
                    self.store.save(inventory)
                    logger.warning(
                        "route_failed route_hash=%s error_type=%s",
                        sha256(sanitized.encode()).hexdigest()[:12],
                        type(error).__name__,
                    )
        inventory.finished_at = datetime.now(UTC)
        inventory.pages_discovered = max(inventory.pages_discovered, len(inventory.routes))
        self.store.save(inventory)
        return inventory

    @staticmethod
    def _expand_navigation(page: Any) -> None:
        selectors = (
            'nav [aria-expanded="false"]',
            'aside [aria-expanded="false"]',
            '[role="navigation"] [aria-expanded="false"]',
        )
        expanded: set[str] = set()
        for selector in selectors:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 40)):
                item = locator.nth(index)
                label = (
                    item.get_attribute("aria-label") or item.inner_text() or item.get_attribute("title") or ""
                ).strip()
                fingerprint = f"{selector}:{label}"
                if fingerprint in expanded:
                    continue
                expanded.add(fingerprint)
                try:
                    item.click(timeout=800)
                    page.wait_for_timeout(100)
                except Exception:
                    pass
