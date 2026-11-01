from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import __version__
from .browser import PortalBrowser
from .config import ROOT, load_settings
from .crawler import ReadOnlyPortalCrawler
from .logging_config import configure_logging
from .storage import LocalInventoryStore
from .sync_client import push_inventory

logger = logging.getLogger(__name__)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fecap-portal", description="Conector local e somente leitura do Portal Educacional FECAP."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("login", help="Abrir login e confirmar a sessão autenticada")
    subparsers.add_parser("discover", help="Descobrir navegação e produzir inventário local")
    scan = subparsers.add_parser("scan", help="Percorrer páginas consultivas em modo somente leitura")
    scan.add_argument(
        "--read-only", action="store_true", default=True, help="Obrigatório: nunca executa ações de escrita"
    )
    scan.add_argument("--resume", action="store_true", help="Retomar último checkpoint incompleto, se existir")
    subparsers.add_parser("sync", help="Varre e sincroniza ao ASA Conecta se habilitado e configurado")
    export = subparsers.add_parser("export-map", help="Exportar mapa sem texto/tabelas acadêmicas")
    export.add_argument("--output", default=".private/fecap-navigation-map.json")
    subparsers.add_parser("healthcheck", help="Validar dependências e configuração sem abrir o portal")
    subparsers.add_parser("serve", help="Servir status/mapa local em localhost")
    return parser


def _scan(*, resume: bool = False):
    settings = load_settings()
    inventory = ReadOnlyPortalCrawler(settings).scan(resume=resume)
    store = LocalInventoryStore(settings.data_dir, settings.data_retention_minutes)
    saved = store.save(inventory)
    print(f"Varredura concluída: {inventory.pages_visited} estados acessíveis; arquivo privado: {saved}")
    print("A descoberta reflete somente o que esta conta autenticada apresentou nesta execução.")
    return inventory


def _healthcheck() -> int:
    from importlib.metadata import version

    from scrapling.fetchers import DynamicSession

    settings = load_settings()
    print(
        json.dumps(
            {
                "collector": __version__,
                "scrapling": version("scrapling"),
                "dynamic_session": DynamicSession.__name__,
                "portal_host": "portal.fecap.br",
                "crawl_mode": settings.crawl_mode,
                "concurrency": settings.max_concurrent_pages,
                "persist_session": settings.session_persist,
                "sync_configured": bool(settings.asa_api_base_url and settings.asa_internal_sync_token),
                "browser_launch": "not checked; run `scrapling install` if Chromium is missing",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def _serve() -> int:
    import uvicorn

    uvicorn.run("fecap_collector.api:app", host="127.0.0.1", port=8765, log_level="warning")
    return 0


def main() -> None:
    args = _parser().parse_args()
    try:
        settings = load_settings()
        configure_logging(settings.log_level)
        if args.command == "healthcheck":
            raise SystemExit(_healthcheck())
        if args.command == "login":
            with PortalBrowser(settings) as browser:
                print(f"Sessão: {browser.authenticate()}. O navegador será encerrado ao terminar.")
            return
        if args.command in {"discover", "scan"}:
            _scan(resume=getattr(args, "resume", False))
            return
        if args.command == "sync":
            if not settings.sync_enabled:
                raise RuntimeError(
                    "Sincronização remota está desligada; defina FECAP_SYNC_ENABLED=true após conectar o ASA Conecta."
                )
            inventory = _scan()
            response = push_inventory(settings, inventory)  # type: ignore[arg-type]
            print(f"Sincronização ASA concluída: {json.dumps(response, ensure_ascii=False)}")
            return
        if args.command == "export-map":
            output = Path(args.output)
            if not output.is_absolute():
                output = ROOT / output
            result = LocalInventoryStore(settings.data_dir, settings.data_retention_minutes).export_map(output)
            print(f"Mapa de navegação exportado sem texto das páginas: {result}")
            return
        if args.command == "serve":
            raise SystemExit(_serve())
    except SystemExit:
        raise
    except KeyboardInterrupt:
        print("Operação interrompida; a sessão será encerrada.")
        raise SystemExit(130) from None
    except Exception as error:
        # Mensagem de exceção de navegador não é impressa: pode incluir URL query ou valores do DOM.
        logger.error("operation_failed error_type=%s", type(error).__name__)
        print(f"Falha: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
