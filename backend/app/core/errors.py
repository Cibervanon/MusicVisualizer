"""Errores de aplicación con formato de respuesta único.

Todas las respuestas de error de la API tienen la forma:
    {"error": {"code": "...", "message": "...", "detail": ...}}
Nunca se devuelve un 200 con un fallo dentro.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Error controlado que se traduce a una respuesta HTTP coherente."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "app_error",
        status_code: int = 400,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.detail = detail


class NotFoundError(AppError):
    def __init__(self, message: str, detail: Any = None) -> None:
        super().__init__(message, code="not_found", status_code=404, detail=detail)


class ValidationError(AppError):
    def __init__(self, message: str, detail: Any = None) -> None:
        super().__init__(message, code="validation_error", status_code=422, detail=detail)


class ProcessingError(AppError):
    def __init__(self, message: str, detail: Any = None) -> None:
        super().__init__(message, code="processing_error", status_code=500, detail=detail)


def error_payload(code: str, message: str, detail: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "detail": detail}}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.code, exc.message, exc.detail),
    )


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == 404 else "http_error"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code, str(exc.detail), None),
    )


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_payload("validation_error", "Datos de entrada inválidos", exc.errors()),
    )


async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_payload("internal_error", "Error interno del servidor", str(exc)),
    )
