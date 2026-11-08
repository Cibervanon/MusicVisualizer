"""Proyectos, configuración, EDLs y análisis persistidos."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Body

from ..core.errors import NotFoundError, ValidationError
from ..core.paths import project_layout
from ..core.util import read_json, write_json
from ..editing.generator import edit_summary
from ..models.schemas import EditPatch, ProjectConfigure, ProjectCreate
from ..project.manager import (
    create_project,
    edit_path,
    list_projects,
    load_project,
    mutate_project,
    save_project,
)
from .common import project_payload

router = APIRouter(prefix="/api", tags=["project"])


@router.post("/project/create")
async def project_create(body: ProjectCreate) -> dict[str, Any]:
    project = create_project(body.name)
    return {"project": project_payload(project)}


@router.get("/projects")
async def projects() -> dict[str, Any]:
    return {"projects": list_projects()}


@router.get("/project/{project_id}")
async def project_get(project_id: str) -> dict[str, Any]:
    project = load_project(project_id)
    return {"project": project_payload(project)}


@router.post("/project/configure")
async def project_configure(body: ProjectConfigure) -> dict[str, Any]:
    if not body.project_id:
        raise ValidationError("Falta project_id.")
    changes = body.model_dump(exclude_none=True, exclude={"project_id"})

    def mutate(project: dict[str, Any]) -> None:
        config = {**(project.get("config") or {})}
        config.update(changes)
        project["config"] = config

    project = mutate_project(body.project_id, mutate)
    return {"project": project_payload(project)}


@router.post("/project/{project_id}/configure")
async def project_configure_path(project_id: str, body: ProjectConfigure) -> dict[str, Any]:
    changes = body.model_dump(exclude_none=True, exclude={"project_id"})

    def mutate(project: dict[str, Any]) -> None:
        config = {**(project.get("config") or {})}
        config.update(changes)
        project["config"] = config

    project = mutate_project(project_id, mutate)
    return {"project": project_payload(project)}


@router.get("/project/{project_id}/analysis/audio")
async def audio_analysis(project_id: str) -> dict[str, Any]:
    layout = project_layout(project_id)
    data = read_json(layout["analysis"] / "audio_analysis.json")
    if not isinstance(data, dict):
        raise NotFoundError("El audio todavía no está analizado.")
    return {"analysis": data}


@router.get("/project/{project_id}/analysis/video")
async def video_analysis(project_id: str) -> dict[str, Any]:
    layout = project_layout(project_id)
    data = read_json(layout["analysis"] / "scene_library.json")
    if not isinstance(data, dict):
        raise NotFoundError("El vídeo todavía no está analizado.")
    return {"analysis": data}


@router.get("/project/{project_id}/edits/{edit_id}")
async def edit_get(project_id: str, edit_id: str) -> dict[str, Any]:
    data = read_json(edit_path(project_id, edit_id))
    if not isinstance(data, dict):
        raise NotFoundError("Edición no encontrada.")
    return {"edit": data}


@router.patch("/project/{project_id}/edits/{edit_id}")
async def edit_patch(project_id: str, edit_id: str, body: EditPatch) -> dict[str, Any]:
    project = load_project(project_id)
    layout = project_layout(project_id)
    path = edit_path(project_id, edit_id)
    edl = read_json(path)
    if not isinstance(edl, dict):
        raise NotFoundError("Edición no encontrada.")

    scene_library = read_json(layout["analysis"] / "scene_library.json")
    master_duration = float((scene_library or {}).get("duration") or edl.get("duration") or 0)

    if body.segments is not None:
        segments = [dict(segment) for segment in body.segments]
        if not segments:
            raise ValidationError("El montaje debe tener al menos un segmento.")
        transition = edl.get("transition") or {}
        extra = float(transition.get("duration") or 0) if transition.get("type") == "crossfade" else 0.0
        cursor = 0.0
        for index, segment in enumerate(segments):
            try:
                duration = float(segment.get("duration") or 0)
            except (TypeError, ValueError):
                raise ValidationError(f"Segmento {index} sin duración válida.")
            if duration < 0.12:
                raise ValidationError(f"El segmento {index} es demasiado corto.")
            source_start = float(segment.get("source_start") or 0)
            source_end = float(segment.get("source_end") or source_start + duration)
            need = duration + (extra if index > 0 else 0.0)
            if source_end - source_start < need:
                source_end = source_start + need
            if master_duration and source_end > master_duration:
                source_end = master_duration
                source_start = max(0.0, source_end - need)
            if source_end - source_start < 0.1:
                raise ValidationError(f"El segmento {index} no cabe en el vídeo fuente.")
            segment["index"] = index
            segment["timeline_start"] = round(cursor, 4)
            segment["duration"] = round(duration, 4)
            segment["timeline_end"] = round(cursor + duration, 4)
            segment["source_start"] = round(source_start, 4)
            segment["source_end"] = round(source_end, 4)
            segment["source_duration"] = round(source_end - source_start, 4)
            segment["transition"] = "cut" if index == 0 else (transition.get("type") or "cut")
            cursor += duration
        target = float(edl.get("duration") or cursor)
        delta = target - cursor
        if abs(delta) > 0.02:
            last = segments[-1]
            new_duration = float(last["duration"]) + delta
            if new_duration < 0.12:
                raise ValidationError("El montaje no puede terminar antes del último segmento.")
            last["duration"] = round(new_duration, 4)
            last["timeline_end"] = round(float(last["timeline_start"]) + new_duration, 4)
        edl["segments"] = segments
        edl["stats"] = {
            **(edl.get("stats") or {}),
            "segments": len(segments),
            "cuts_per_second": round(len(segments) / max(0.1, float(edl.get("duration") or 1)), 3),
            "avg_shot": round(float(edl.get("duration") or 0) / len(segments), 3),
            "unique_scenes": len({str(s.get("scene_id")) for s in segments}),
        }

    if body.grade is not None:
        edl["grade"] = {**(edl.get("grade") or {}), **body.grade}
    if body.effects is not None:
        edl["effects"] = {**(edl.get("effects") or {}), **body.effects}
    if body.weights is not None:
        edl["weights"] = {**(edl.get("weights") or {}), **body.weights}
    if body.lyrics_style is not None:
        lyrics = edl.get("lyrics") or {}
        lyrics["style"] = {**(lyrics.get("style") or {}), **body.lyrics_style}
        edl["lyrics"] = lyrics
    if body.volume is not None:
        edl["volume"] = float(body.volume)
    edl["edited_at"] = time.time()

    write_json(path, edl)

    def mutate(project_data: dict[str, Any]) -> None:
        existing = next((e for e in project_data.get("edits", []) if e.get("id") == edit_id), None)
        summary = edit_summary(edl, (existing or {}).get("render"))
        project_data["edits"] = [e for e in project_data.get("edits", []) if e.get("id") != edit_id]
        project_data["edits"].insert(0, summary)

    mutate_project(project_id, mutate)
    return {"edit": edl}


@router.delete("/project/{project_id}/edits/{edit_id}")
async def edit_delete(project_id: str, edit_id: str) -> dict[str, Any]:
    path = edit_path(project_id, edit_id)
    path.unlink(missing_ok=True)

    def mutate(project: dict[str, Any]) -> None:
        project["edits"] = [e for e in project.get("edits", []) if e.get("id") != edit_id]

    mutate_project(project_id, mutate)
    return {"ok": True, "edit_id": edit_id}


@router.get("/project/{project_id}/renders")
async def project_renders(project_id: str) -> dict[str, Any]:
    project = load_project(project_id)
    return {"renders": project.get("renders") or []}
