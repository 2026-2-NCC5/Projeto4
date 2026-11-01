import logging

from fecap_collector.logging_config import configure_logging


def test_external_client_logs_are_suppressed_to_prevent_query_secret_leaks():
    configure_logging("INFO")
    for name in ("scrapling", "playwright", "httpx", "httpcore"):
        assert logging.getLogger(name).level > logging.CRITICAL
