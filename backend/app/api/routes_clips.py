"""Generación de N clips."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..jobs.manager import jobs
from ..jobs.runners import run_generate
from ..models.schemas import GenerateRequest

router = APIRouter(prefix="/api", tags=["clips"])


@router.post("/clips/generate")
async def generate_clips(body: GenerateRequest) -> dict[str, Any]:
    payload = body.model_dump()
    clips = [
        {
            "index": index,
            "edit_id": None,
            "style": None,
            "style_name": None,
            "status": "queued",
            "progress": 0.0,
            "render_id": None,
            "error": None,
        }
        for index in range(body.count)
    ]
    job = await jobs.create("generate", body.project_id, clips=clips)
    await jobs.start(job["id"], lambda: run_generate(job["id"], body.project_id, payload))
    return {"job": job}
