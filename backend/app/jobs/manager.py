"""Store de trabajos en memoria con progreso, cancelación y SSE."""

from __future__ import annotations

import asyncio
import json
import time
import traceback
import uuid
from typing import Any, Awaitable, Callable

from ..core.errors import AppError, ProcessingError
from ..core.logging import get_logger, log_job_transition, set_job_id

TERMINAL = {"done", "error", "cancelled"}

_logger = get_logger("music-clip-studio.jobs")


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._events: dict[str, asyncio.Event] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        kind: str,
        project_id: str,
        *,
        meta: dict[str, Any] | None = None,
        clips: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = {
            "id": job_id,
            "kind": kind,
            "project_id": project_id,
            "status": "queued",
            "stage": "queued",
            "progress": 0.0,
            "message": "En cola",
            "clips": clips or [],
            "result": None,
            "error": None,
            "warnings": [],
            "logs": [],
            "cancel_requested": False,
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
            "meta": meta or {},
        }
        async with self._lock:
            self._jobs[job_id] = job
            self._events[job_id] = asyncio.Event()
            self._prune_locked()
        return dict(job)

    async def get(self, job_id: str) -> dict[str, Any]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise AppError("Trabajo no encontrado.", code="job_not_found", status_code=404)
            return json.loads(json.dumps(job))

    async def update(self, job_id: str, **fields: Any) -> dict[str, Any]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise AppError("Trabajo no encontrado.", code="job_not_found", status_code=404)
            old_status = job.get("status")
            for key, value in fields.items():
                if key == "status":
                    current = job.get("status")
                    # `cancelled` es definitivo.
                    if current == "cancelled":
                        continue
                    # Un trabajo en cancelación no puede volver a running/queued/done:
                    # el usuario ya pidió parar y el runner debe confirmar cancelled.
                    if current == "cancelling" and value in {"queued", "running", "done"}:
                        continue
                    if current != value:
                        log_job_transition(_logger, job_id, current, value)
                job[key] = value
            if fields.get("message"):
                job.setdefault("logs", []).append(
                    {"t": time.time(), "message": str(fields["message"])}
                )
                if len(job["logs"]) > 80:
                    del job["logs"][: len(job["logs"]) - 80]
            return json.loads(json.dumps(job))

    async def event(self, job_id: str) -> asyncio.Event:
        async with self._lock:
            event = self._events.get(job_id)
            if event is None:
                raise AppError("Trabajo no encontrado.", code="job_not_found", status_code=404)
            return event

    async def cancel(self, job_id: str) -> dict[str, Any]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise AppError("Trabajo no encontrado.", code="job_not_found", status_code=404)
            job["cancel_requested"] = True
            if job["status"] in TERMINAL:
                return json.loads(json.dumps(job))
            job["status"] = "cancelling"
            job["message"] = "Cancelando…"
            event = self._events.get(job_id)
            if event is not None:
                event.set()
            return json.loads(json.dumps(job))

    async def start(
        self,
        job_id: str,
        runner: Callable[[], Awaitable[None]],
    ) -> None:
        async def execute() -> None:
            set_job_id(job_id)
            await self.update(
                job_id,
                status="running",
                started_at=time.time(),
                stage="starting",
                message="Iniciando",
            )
            try:
                await runner()
            except ProcessingError as exc:
                if exc.code == "cancelled":
                    await self.update(
                        job_id,
                        status="cancelled",
                        message="Cancelado por el usuario",
                        finished_at=time.time(),
                    )
                else:
                    await self.update(
                        job_id,
                        status="error",
                        error=exc.message,
                        message=exc.message,
                        finished_at=time.time(),
                    )
            except AppError as exc:
                await self.update(
                    job_id,
                    status="error",
                    error=exc.message,
                    message=exc.message,
                    finished_at=time.time(),
                )
            except asyncio.CancelledError:
                await self.update(
                    job_id,
                    status="cancelled",
                    message="Cancelado",
                    finished_at=time.time(),
                )
                raise
            except Exception as exc:  # pragma: no cover - salvaguarda
                await self.update(
                    job_id,
                    status="error",
                    error=str(exc),
                    message=str(exc),
                    finished_at=time.time(),
                    logs=[
                        *((await self.get(job_id)).get("logs") or []),
                        {"t": time.time(), "message": traceback.format_exc()[-3000:]},
                    ],
                )
            finally:
                job = await self.get(job_id)
                if job.get("status") == "cancelling":
                    await self.update(
                        job_id,
                        status="cancelled",
                        message="Cancelado por el usuario",
                        finished_at=time.time(),
                    )
                elif job.get("status") not in TERMINAL:
                    await self.update(
                        job_id,
                        status="done",
                        progress=1.0,
                        stage="done",
                        message="Completado",
                        finished_at=time.time(),
                    )
                elif job.get("status") == "done" and not job.get("finished_at"):
                    await self.update(job_id, finished_at=time.time())
                set_job_id(None)

        task = asyncio.create_task(execute())
        async with self._lock:
            self._tasks[job_id] = task

    async def list(self, project_id: str | None = None) -> list[dict[str, Any]]:
        async with self._lock:
            items = [
                json.loads(json.dumps(job))
                for job in self._jobs.values()
                if project_id is None or job.get("project_id") == project_id
            ]
        items.sort(key=lambda item: item.get("created_at") or 0, reverse=True)
        return items

    def _prune_locked(self) -> None:
        if len(self._jobs) <= 60:
            return
        finished = [
            (job_id, job)
            for job_id, job in self._jobs.items()
            if job.get("status") in TERMINAL
        ]
        finished.sort(key=lambda item: item[1].get("finished_at") or 0)
        for job_id, _ in finished[: max(0, len(self._jobs) - 50)]:
            self._jobs.pop(job_id, None)
            self._events.pop(job_id, None)
            self._tasks.pop(job_id, None)

    async def stream(self, job_id: str):
        """Generador SSE con el estado del trabajo."""
        last = None
        idle = 0
        while True:
            job = await self.get(job_id)
            payload = json.dumps(job, ensure_ascii=False, separators=(",", ":"))
            if payload != last:
                yield f"event: update\ndata: {payload}\n\n"
                last = payload
                idle = 0
            else:
                idle += 1
                if idle % 20 == 0:
                    yield ": keep-alive\n\n"
            if job.get("status") in TERMINAL:
                yield f"event: end\ndata: {payload}\n\n"
                break
            await asyncio.sleep(0.5)


jobs = JobStore()
