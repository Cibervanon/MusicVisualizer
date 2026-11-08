"""Análisis de audio y vídeo como trabajos con progreso."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter

from ..core.errors import ValidationError
from ..core.ffmpeg import probe
from ..jobs.manager import jobs
from ..jobs.runners import run_audio_analysis, run_video_analysis
from ..models.schemas import AnalyzeAudioRequest, AnalyzeVideoRequest
from ..project.manager import load_project, validate_audio_source, validate_video_source

router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/audio/analyze")
async def analyze_audio(body: AnalyzeAudioRequest) -> dict[str, Any]:
    project = load_project(body.project_id)
    source = validate_audio_source(project)
    info = await asyncio.to_thread(probe, source)
    if body.end > info.duration + 0.5:
        raise ValidationError(
            f"El final ({body.end:.2f}s) supera la duración del audio ({info.duration:.2f}s)."
        )
    if body.end - body.start < 1.0:
        raise ValidationError("El fragmento debe durar al menos 1 segundo.")
    job = await jobs.create("audio_analysis", body.project_id)
    await jobs.start(
        job["id"],
        lambda: run_audio_analysis(job["id"], body.project_id, body.start, body.end, body.force),
    )
    return {"job": job}


@router.post("/video/analyze")
async def analyze_video(body: AnalyzeVideoRequest) -> dict[str, Any]:
    project = load_project(body.project_id)
    validate_video_source(project)
    job = await jobs.create("video_analysis", body.project_id)
    await jobs.start(
        job["id"],
        lambda: run_video_analysis(
            job["id"],
            body.project_id,
            body.format,
            body.resolution,
            body.fps,
            body.force,
        ),
    )
    return {"job": job}
