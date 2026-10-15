"""ASA Conecta — Agent Service (FastAPI).

Responsabilidade: expor o endpoint interno do Agente para o Estudante e
adaptar HTTP → application layer → Agent Engine. Nenhuma regra de domínio
vive aqui.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.agent.config import load_config
from app.agent.engine import StudentAgentEngine
from app.api.routes import router
from app.logging_config import configure_logging
from app.services.evaluation_service import EvaluationService


def create_app(config_dir: str | None = None) -> FastAPI:
    logger = configure_logging()
    config = load_config(config_dir or os.environ.get("AGENT_CONFIG_DIR") or None)
    engine = StudentAgentEngine(config)

    app = FastAPI(
        title="ASA Conecta — Agent Service",
        version=config.agent_version,
        description="Serviço interno do Agente para o Estudante. Não deve ser exposto ao aplicativo mobile.",
        docs_url="/internal/docs",
        openapi_url="/internal/openapi.json",
        redoc_url=None,
    )
    app.state.engine = engine
    app.state.evaluation_service = EvaluationService(engine)
    app.include_router(router)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ())) or "body",
                "message": str(err.get("msg", "inválido")),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Requisição inválida.",
                    "request_id": request.headers.get("x-request-id"),
                    "correlation_id": request.headers.get("x-correlation-id"),
                    "details": details,
                }
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled error", exc_info=exc, extra={"path": request.url.path, "status": "error"})
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "AGENT_INTERNAL_ERROR",
                    "message": "Erro interno do serviço do agente.",
                    "request_id": request.headers.get("x-request-id"),
                    "correlation_id": request.headers.get("x-correlation-id"),
                }
            },
        )

    logger.info(
        "agent service ready",
        extra={"status": "ready", "code": f"{config.agent_name}@{config.agent_version}/config@{config.config_version}"},
    )
    return app


app = create_app()
