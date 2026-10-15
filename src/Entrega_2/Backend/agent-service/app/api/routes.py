"""Rotas HTTP do Agent Service. Apenas adaptação HTTP → application layer."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.contracts.schemas import (
    ErrorResponse,
    HealthResponse,
    StudentAgentRequest,
    StudentAgentResponse,
    parse_major,
)
from app.logging_config import configure_logging

router = APIRouter()
logger = configure_logging()
BODY = Body(...)


def _error(
    status: int,
    code: str,
    message: str,
    request_id: str | None,
    correlation_id: str | None,
    details: list[dict[str, str]] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "code": code,
        "message": message,
        "request_id": request_id,
        "correlation_id": correlation_id,
    }
    if details:
        body["details"] = details
    headers = {}
    if correlation_id:
        headers["X-Correlation-Id"] = correlation_id
    if request_id:
        headers["X-Request-Id"] = request_id
    return JSONResponse(status_code=status, content={"error": body}, headers=headers)


@router.get("/health", response_model=HealthResponse, tags=["internal"])
def health(request: Request) -> HealthResponse:
    engine = request.app.state.engine
    return HealthResponse(
        status="ok",
        service="agent-service",
        agent=engine.config.agent_name,
        agent_version=engine.agent_version,
        config_version=engine.config_version,
        contract_version=engine.config.contract_version,
    )


@router.post(
    "/internal/v1/student-agent/evaluate",
    response_model=StudentAgentResponse,
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    tags=["internal"],
    summary="Avalia o contexto acadêmico de um estudante (contrato v1)",
)
def evaluate(request: Request, payload: dict[str, Any] = BODY) -> Any:
    """Endpoint interno consumido apenas pela API Node.js (TASK-004 §15)."""

    started = time.perf_counter()
    engine = request.app.state.engine
    service = request.app.state.evaluation_service

    request_id = payload.get("request_id") if isinstance(payload, dict) else None
    correlation_id = payload.get("correlation_id") if isinstance(payload, dict) else None
    if not isinstance(request_id, str):
        request_id = request.headers.get("x-request-id")
    if not isinstance(correlation_id, str):
        correlation_id = request.headers.get("x-correlation-id")

    # 1. Versão do contrato: rejeita explicitamente majors incompatíveis (TASK-004 §25, §46-47)
    raw_version = payload.get("contract_version") if isinstance(payload, dict) else None
    major = parse_major(raw_version) if isinstance(raw_version, str) else None
    if major is None or major != engine.config.contract_supported_major:
        logger.warning(
            "contract version rejected",
            extra={
                "request_id": request_id,
                "correlation_id": correlation_id,
                "status": "contract_rejected",
                "code": "CONTRACT_VERSION_UNSUPPORTED",
            },
        )
        return _error(
            422,
            "CONTRACT_VERSION_UNSUPPORTED",
            "Versão de contrato não suportada. "
            f"Esperado {engine.config.contract_supported_major}.x, recebido {raw_version!r}.",
            request_id,
            correlation_id,
        )

    # 2. Validação estrutural com Pydantic (TASK-004 §26)
    try:
        validated = StudentAgentRequest.model_validate(payload)
    except ValidationError as exc:
        details = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ())) or "body",
                "message": str(err.get("msg", "inválido")),
            }
            for err in exc.errors()
        ]
        logger.warning(
            "invalid request payload",
            extra={
                "request_id": request_id,
                "correlation_id": correlation_id,
                "status": "validation_error",
                "code": "VALIDATION_ERROR",
            },
        )
        return _error(
            422, "VALIDATION_ERROR", "Payload inválido para o contrato v1.", request_id, correlation_id, details
        )

    # 3. Application layer → Agent Engine
    try:
        response = service.evaluate(validated)
    except Exception as exc:  # noqa: BLE001 - erro interno sanitizado
        logger.error(
            "agent evaluation failed",
            exc_info=exc,
            extra={
                "request_id": request_id,
                "correlation_id": correlation_id,
                "status": "error",
                "code": "AGENT_INTERNAL_ERROR",
            },
        )
        return _error(
            500, "AGENT_INTERNAL_ERROR", "Falha interna ao avaliar o contexto acadêmico.", request_id, correlation_id
        )

    duration_ms = round((time.perf_counter() - started) * 1000)
    logger.info(
        "agent evaluation completed",
        extra={
            "request_id": validated.request_id,
            "correlation_id": validated.correlation_id,
            "run_id": response.run_id,
            "status": response.status,
            "duration_ms": duration_ms,
        },
    )
    return JSONResponse(
        status_code=200,
        content=response.model_dump(mode="json"),
        headers={"X-Correlation-Id": validated.correlation_id, "X-Request-Id": validated.request_id},
    )


@router.get(
    "/internal/v1/student-agent/config", tags=["internal"], summary="Versões e limiares ativos (somente leitura)"
)
def config_info(request: Request) -> dict[str, Any]:
    engine = request.app.state.engine
    cfg = engine.config
    return {
        "agent": cfg.agent_name,
        "agent_version": cfg.agent_version,
        "config_version": cfg.config_version,
        "contract_version": cfg.contract_version,
        "thresholds": {
            "minimum_confidence": cfg.thresholds.minimum_confidence,
            "attendance": cfg.thresholds.attendance.__dict__,
            "performance": cfg.thresholds.performance.__dict__,
            "pending": cfg.thresholds.pending.__dict__,
        },
        "rules": sorted(rule for rule, value in cfg.rules.items() if value.enabled),
    }


def raise_not_found() -> None:  # pragma: no cover - utilitário
    raise HTTPException(status_code=404)
