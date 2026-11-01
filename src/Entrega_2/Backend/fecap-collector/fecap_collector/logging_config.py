import logging


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # Não instalar handlers que serializem URL query strings, HTML, cookies ou payloads de formulário.
    # O fetcher pode registrar URLs com chaves de sessão em query strings; a aplicação emite apenas logs sanitizados.
    for name in ("scrapling", "playwright", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.CRITICAL + 1)
