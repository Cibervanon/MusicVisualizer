"""Structured JSON logging for the backend."""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

from ..core.config import settings

_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
_job_id_var: ContextVar[str | None] = ContextVar("job_id", default=None)


class JSONFormatter(logging.Formatter):
    """JSON log formatter with request/job context."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": time.time(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = _request_id_var.get()
        if request_id:
            log_data["request_id"] = request_id

        job_id = _job_id_var.get()
        if job_id:
            log_data["job_id"] = job_id

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        extra = {k: v for k, v in record.__dict__.items() if k not in {
            "name", "msg", "args", "created", "filename", "funcName",
            "levelname", "levelno", "lineno", "module", "msecs",
            "message", "pathname", "process",
            "processName", "relativeCreated", "thread", "threadName",
            "exc_info", "exc_text", "stack_info",
        }}
        if extra:
            log_data["extra"] = extra

        return json.dumps(log_data, ensure_ascii=False)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with JSON formatting."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        logger.setLevel(settings.log_level)
        logger.propagate = False
    return logger


def set_request_id(request_id: str | None = None) -> str:
    """Set request ID in context var, generate if not provided."""
    rid = request_id or uuid.uuid4().hex[:12]
    _request_id_var.set(rid)
    return rid


def get_request_id() -> str | None:
    """Get current request ID from context."""
    return _request_id_var.get()


def set_job_id(job_id: str | None) -> None:
    """Set job ID in context var."""
    _job_id_var.set(job_id)


def get_job_id() -> str | None:
    """Get current job ID from context."""
    return _job_id_var.get()


class RequestIdMiddleware:
    """ASGI middleware to set request ID for each request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = None
        for header_name, header_value in scope.get("headers", []):
            if header_name.decode() == "x-request-id":
                request_id = header_value.decode()
                break

        set_request_id(request_id)
        try:
            await self.app(scope, receive, send)
        finally:
            set_request_id(None)


def log_request(logger: logging.Logger, method: str, path: str, status_code: int, duration_ms: float, **extra: Any) -> None:
    """Log an HTTP request with standard fields."""
    logger.info(
        "HTTP request",
        extra={
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            **extra,
        },
    )


def log_job_transition(logger: logging.Logger, job_id: str, from_status: str, to_status: str, **extra: Any) -> None:
    """Log a job status transition."""
    logger.info(
        "Job status transition",
        extra={
            "job_id": job_id,
            "from_status": from_status,
            "to_status": to_status,
            **extra,
        },
    )


def log_render_progress(logger: logging.Logger, render_id: str, progress: float, stage: str, **extra: Any) -> None:
    """Log render progress."""
    logger.info(
        "Render progress",
        extra={
            "render_id": render_id,
            "progress": round(progress, 4),
            "stage": stage,
            **extra,
        },
    )
