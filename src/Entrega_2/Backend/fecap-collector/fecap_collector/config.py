from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "sim"}


@dataclass(frozen=True)
class Settings:
    portal_url: str
    username: str | None
    password: str | None
    auth_mode: str
    browser_headless: bool
    session_persist: bool
    session_storage_path: Path
    crawl_mode: str
    max_concurrent_pages: int
    request_delay_ms: int
    max_retries: int
    timeout_ms: int
    download_documents: bool
    sync_enabled: bool
    sync_interval_minutes: int
    capture_screenshots: bool
    data_dir: Path
    log_level: str
    asa_api_base_url: str | None
    asa_internal_sync_token: str | None

    @property
    def portal_origin(self) -> str:
        parsed = urlparse(self.portal_url)
        return f"{parsed.scheme}://{parsed.netloc}"


def load_settings() -> Settings:
    portal_url = os.getenv(
        "FECAP_PORTAL_URL",
        "https://portal.fecap.br/framehtml/web/app/edu/PortalEducacional/#/",
    ).strip()
    parsed = urlparse(portal_url)
    if parsed.scheme != "https" or parsed.hostname != "portal.fecap.br":
        raise ValueError("FECAP_PORTAL_URL deve usar HTTPS no host portal.fecap.br.")
    crawl_mode = os.getenv("FECAP_CRAWL_MODE", "read_only").strip().lower()
    if crawl_mode != "read_only":
        raise ValueError("Este conector só aceita FECAP_CRAWL_MODE=read_only.")
    auth_mode = os.getenv("FECAP_AUTH_MODE", "auto").strip().lower()
    if auth_mode not in {"auto", "manual"}:
        raise ValueError("FECAP_AUTH_MODE deve ser auto ou manual.")
    max_pages = int(os.getenv("FECAP_MAX_CONCURRENT_PAGES", "1"))
    if max_pages != 1:
        raise ValueError("A navegação é serial e aceita FECAP_MAX_CONCURRENT_PAGES=1.")
    data_dir = Path(os.getenv("FECAP_DATA_DIR", ".private/fecap-data"))
    session_path = Path(os.getenv("FECAP_SESSION_STORAGE_PATH", ".private/fecap-session.enc"))
    if not data_dir.is_absolute():
        data_dir = ROOT / data_dir
    if not session_path.is_absolute():
        session_path = ROOT / session_path
    asa_api_base_url = os.getenv("ASA_API_BASE_URL") or None
    if asa_api_base_url:
        asa_api = urlparse(asa_api_base_url)
        local_http = asa_api.scheme == "http" and asa_api.hostname in {"localhost", "127.0.0.1", "::1"}
        if asa_api.scheme != "https" and not local_http:
            raise ValueError("ASA_API_BASE_URL deve usar HTTPS, exceto para desenvolvimento em localhost.")
        if not asa_api.hostname or asa_api.username or asa_api.password:
            raise ValueError("ASA_API_BASE_URL inválida.")
    return Settings(
        portal_url=portal_url,
        username=os.getenv("FECAP_USERNAME") or None,
        password=os.getenv("FECAP_PASSWORD") or None,
        auth_mode=auth_mode,
        browser_headless=_bool("FECAP_BROWSER_HEADLESS", False),
        session_persist=_bool("FECAP_SESSION_PERSIST", False),
        session_storage_path=session_path,
        crawl_mode=crawl_mode,
        max_concurrent_pages=max_pages,
        request_delay_ms=max(0, int(os.getenv("FECAP_REQUEST_DELAY_MS", "1500"))),
        max_retries=max(0, min(int(os.getenv("FECAP_MAX_RETRIES", "3")), 5)),
        timeout_ms=max(1000, int(os.getenv("FECAP_TIMEOUT_MS", "30000"))),
        download_documents=_bool("FECAP_DOWNLOAD_DOCUMENTS", False),
        sync_enabled=_bool("FECAP_SYNC_ENABLED", False),
        sync_interval_minutes=max(1, int(os.getenv("FECAP_SYNC_INTERVAL_MINUTES", "60"))),
        capture_screenshots=_bool("FECAP_CAPTURE_SCREENSHOTS", False),
        data_dir=data_dir,
        log_level=os.getenv("FECAP_LOG_LEVEL", "INFO").upper(),
        asa_api_base_url=asa_api_base_url,
        asa_internal_sync_token=os.getenv("ASA_INTERNAL_SYNC_TOKEN") or None,
    )
