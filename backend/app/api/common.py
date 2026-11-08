"""Utilidades compartidas por los routers."""

from __future__ import annotations

import mimetypes
import re
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from ..core.errors import NotFoundError, ValidationError
from ..core.paths import PROJECTS_DIR, project_dir, project_layout
from ..core.util import read_json, safe_filename
from ..lyrics.service import get_lyrics
from ..project.manager import load_project

MAX_UPLOAD_BYTES = 600 * 1024 * 1024
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpeg", ".mpg", ".wmv"}


def rel(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace("\\", "/")


async def save_upload(
    file: UploadFile,
    destination: Path,
    *,
    allowed_ext: set[str],
    kind: str,
) -> tuple[Path, int]:
    original = file.filename or f"{kind}.bin"
    suffix = Path(original).suffix.lower()
    if suffix not in allowed_ext:
        raise ValidationError(
            f"Extensión no permitida para {kind}: {suffix or 'sin extensión'}.",
            detail={"allowed": sorted(allowed_ext)},
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        async with aiofiles.open(destination, "wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise ValidationError(
                        f"El archivo supera el máximo permitido ({MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."
                    )
                await output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    if size == 0:
        destination.unlink(missing_ok=True)
        raise ValidationError("El archivo está vacío.")
    return destination, size


def project_payload(project: dict[str, Any]) -> dict[str, Any]:
    layout = project_layout(project["id"])
    audio = read_json(layout["analysis"] / "audio_analysis.json")
    video = read_json(layout["analysis"] / "scene_library.json")
    audio_summary = None
    if isinstance(audio, dict):
        audio_summary = {
            "duration": audio.get("duration"),
            "bpm": (audio.get("tempo") or {}).get("bpm"),
            "confidence": (audio.get("tempo") or {}).get("confidence"),
            "beats": len(audio.get("beats") or []),
            "sections": audio.get("sections") or [],
            "events": len(audio.get("events") or []),
            "engine": audio.get("analysis_engine"),
        }
    video_summary = None
    if isinstance(video, dict):
        video_summary = {
            "scenes": len(video.get("scenes") or []),
            "duration": video.get("duration"),
            "width": video.get("width"),
            "height": video.get("height"),
            "fps": video.get("fps"),
            "thumb": video.get("thumb"),
            "engine": video.get("analysis_engine"),
        }
    return {
        **project,
        "lyrics": get_lyrics(project),
        "analysis_summary": {"audio": audio_summary, "video": video_summary},
        "analysis_ready": {
            "audio": isinstance(audio, dict),
            "video": isinstance(video, dict),
        },
    }


def find_render(render_id: str, project_id: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    if project_id:
        candidates = [load_project(project_id)]
    else:
        for entry in PROJECTS_DIR.iterdir():
            if not entry.is_dir() or entry.name.startswith("_"):
                continue
            data = read_json(entry / "project.json")
            if isinstance(data, dict):
                candidates.append(data)
    for project in candidates:
        for render in project.get("renders") or []:
            if render.get("id") == render_id:
                return project, render
    raise NotFoundError(f"Render no encontrado: {render_id}")


def render_abs_path(project: dict[str, Any], render: dict[str, Any]) -> Path:
    path = project_dir(project["id"]) / str(render.get("path") or "")
    if not path.exists():
        raise NotFoundError("El archivo del render ya no existe en disco.")
    return path


def media_response(path: Path, request: Request, download_name: str | None = None):
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    size = path.stat().st_size
    range_header = request.headers.get("range")
    headers: dict[str, str] = {"Accept-Ranges": "bytes"}
    if download_name:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
    if not range_header:
        return FileResponse(path, media_type=media_type, headers=headers, filename=download_name)

    match = re.match(r"bytes=(\d*)-(\d*)", range_header)
    if not match:
        return FileResponse(path, media_type=media_type, headers=headers)
    start_raw, end_raw = match.groups()
    start = int(start_raw) if start_raw else 0
    end = int(end_raw) if end_raw else size - 1
    start = max(0, min(start, size - 1))
    end = max(start, min(end, size - 1))
    length = end - start + 1

    async def iterator():
        async with aiofiles.open(path, "rb") as handle:
            await handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = await handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers.update(
        {
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
        }
    )
    return StreamingResponse(iterator(), status_code=206, media_type=media_type, headers=headers)


def safe_source_name(project_id: str, kind: str, original: str) -> str:
    return f"{kind}_{project_id}_{safe_filename(original, kind)}"
