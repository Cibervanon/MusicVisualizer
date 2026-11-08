"""Servido seguro de archivos del proyecto con soporte de Range."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request

from ..core.errors import NotFoundError
from ..core.paths import project_dir, safe_join
from .common import media_response

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{project_id}/{file_path:path}")
async def serve_file(project_id: str, file_path: str, request: Request):
    base = project_dir(project_id)
    try:
        path = safe_join(base, *file_path.split("/"))
    except ValueError as exc:
        raise NotFoundError("Ruta no permitida.") from exc
    if not path.exists() or not path.is_file():
        raise NotFoundError("Archivo no encontrado.")
    return media_response(path, request)
