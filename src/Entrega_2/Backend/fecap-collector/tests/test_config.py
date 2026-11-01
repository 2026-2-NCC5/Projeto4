import pytest

from fecap_collector.config import load_settings


def test_rejects_non_tls_remote_asa_endpoint(monkeypatch):
    monkeypatch.setenv("ASA_API_BASE_URL", "http://asa.example.test")
    with pytest.raises(ValueError, match="HTTPS"):
        load_settings()


def test_allows_loopback_http_for_local_development(monkeypatch):
    monkeypatch.setenv("ASA_API_BASE_URL", "http://127.0.0.1:3000")
    assert load_settings().asa_api_base_url == "http://127.0.0.1:3000"
