"""Render, validación, descarga individual y ZIP."""

from __future__ import annotations

import time
import zipfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ..core.errors import NotFoundError, ValidationError
from ..core.paths import WORK_DIR
from ..jobs.manager import jobs
from ..jobs.runners import run_render
from ..models.schemas import RenderRequest, ZipRequest
from ..project.manager import load_project
from .common import find_render, media_response, render_abs_path

router = APIRouter(prefix="/api", tags=["render"])


@router.post("/render")
async def render(body: RenderRequest) -> dict[str, Any]:
    job = await jobs.create(
        "render",
        body.project_id,
        meta={"edit_id": body.edit_id, "preview": body.preview},
    )
    payload = {
        "preview": body.preview,
        "quality": body.quality,
        "encoder": body.encoder,
    }
    await jobs.start(
        job["id"],
        lambda: run_render(job["id"], body.project_id, body.edit_id, payload),
    )
    return {"job": job}


@router.post("/render/preview")
async def render_preview(body: RenderRequest) -> dict[str, Any]:
    body.preview = True
    return await render(body)


@router.get("/renders/{render_id}")
async def render_get(render_id: str, project_id: str | None = Query(default=None)) -> dict[str, Any]:
    project, render = find_render(render_id, project_id)
    return {"render": render, "project_id": project["id"]}


@router.get("/renders/{render_id}/validate")
async def render_validate(render_id: str, project_id: str | None = Query(default=None)) -> dict[str, Any]:
    _project, render = find_render(render_id, project_id)
    return {"validation": render.get("validation")}


@router.get("/download/{render_id}")
async def download(render_id: str, request: Request, project_id: str | None = Query(default=None)):
    project, render = find_render(render_id, project_id)
    path = render_abs_path(project, render)
    return media_response(path, request, download_name=render.get("filename") or path.name)


@router.post("/download/zip")
async def download_zip(body: ZipRequest):
    project = load_project(body.project_id)
    renders = project.get("renders") or []
    if body.render_ids:
        selected = [r for r in renders if r.get("id") in set(body.render_ids)]
    else:
        selected = [r for r in renders if r.get("type") != "preview"]
    if not selected:
        raise NotFoundError("No hay renders finales para descargar.")
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = WORK_DIR / f"clips_{body.project_id}_{int(time.time())}.zip"
    added = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for render in selected:
            try:
                path = render_abs_path(project, render)
            except NotFoundError:
                continue
            archive.write(path, arcname=render.get("filename") or path.name)
            added += 1
    if added == 0:
        zip_path.unlink(missing_ok=True)
        raise NotFoundError("Los archivos de los renders ya no existen en disco.")
    name = f"{(project.get('name') or 'music-clips')}_{int(time.time())}.zip".replace(" ", "_")
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=name,
        background=BackgroundTask(lambda: zip_path.unlink(missing_ok=True)),
    )


@router.delete("/renders/{render_id}")
async def render_delete(render_id: str, project_id: str | None = Query(default=None)) -> dict[str, Any]:
    project, render = find_render(render_id, project_id)
    try:
        path = render_abs_path(project, render)
        path.unlink(missing_ok=True)
    except NotFoundError:
        pass
    from ..project.manager import mutate_project

    def mutate(data: dict[str, Any]) -> None:
        data["renders"] = [r for r in data.get("renders", []) if r.get("id") != render_id]

    mutate_project(project["id"], mutate)
    return {"ok": True, "render_id": render_id}
