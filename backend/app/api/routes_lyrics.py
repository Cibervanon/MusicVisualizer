"""Letras: consulta, edición, importación y transcripción opcional."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..core.errors import ValidationError
from ..jobs.manager import jobs
from ..jobs.runners import run_transcribe
from ..lyrics.parser import parse_import
from ..lyrics.presets import ANIMATIONS, FONT_CHOICES, preset_catalog
from ..lyrics.service import get_lyrics, save_lyrics
from ..models.schemas import LyricsImport, LyricsUpdate, TranscribeRequest
from ..project.manager import load_project

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.get("/presets")
async def lyrics_presets() -> dict[str, Any]:
    return {"presets": preset_catalog(), "animations": ANIMATIONS, "fonts": FONT_CHOICES}


@router.get("/{project_id}")
async def lyrics_get(project_id: str) -> dict[str, Any]:
    project = load_project(project_id)
    return {"lyrics": get_lyrics(project)}


@router.post("/update")
async def lyrics_update(body: LyricsUpdate) -> dict[str, Any]:
    payload = save_lyrics(
        body.project_id,
        [line.model_dump() for line in body.lines],
        source=body.source,
        style=body.style,
        enabled=body.enabled,
    )
    return {"lyrics": payload}


@router.post("/import")
async def lyrics_import(body: LyricsImport) -> dict[str, Any]:
    project = load_project(body.project_id)
    duration = float((project.get("fragment") or {}).get("duration") or 30.0)
    lines = parse_import(body.content, body.kind, duration)
    if not lines:
        raise ValidationError("No se pudo extraer ninguna línea del archivo.")
    payload = save_lyrics(body.project_id, lines, source=body.kind, enabled=True)
    return {"lyrics": payload, "count": len(lines)}


@router.post("/transcribe")
async def lyrics_transcribe(body: TranscribeRequest) -> dict[str, Any]:
    project = load_project(body.project_id)
    if not (project.get("analysis") or {}).get("audio"):
        raise ValidationError("Analiza primero el fragmento de audio.")
    job = await jobs.create("transcribe", body.project_id)
    await jobs.start(
        job["id"],
        lambda: run_transcribe(job["id"], body.project_id, body.language, body.model),
    )
    return {"job": job}
