"""Consulta, cancelación y streaming SSE de trabajos."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from ..jobs.manager import jobs

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(project_id: str | None = Query(default=None)) -> dict[str, Any]:
    return {"jobs": await jobs.list(project_id)}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict[str, Any]:
    return {"job": await jobs.get(job_id)}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict[str, Any]:
    job = await jobs.cancel(job_id)
    return {"ok": True, "job": job}


@router.get("/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        jobs.stream(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
