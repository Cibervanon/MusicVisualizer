"""Subida de audio/vídeo e importación autorizada desde YouTube."""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile

from ..core.errors import ProcessingError, ValidationError
from ..core.ffmpeg import CREATE_NO_WINDOW, probe
from ..core.paths import project_layout
from ..models.schemas import YouTubeImport, YouTubePreflight
from ..project.manager import load_project, mutate_project
from .common import AUDIO_EXT, VIDEO_EXT, project_payload, rel, safe_source_name, save_upload

router = APIRouter(prefix="/api", tags=["upload"])


def _reset_audio(project: dict[str, Any]) -> None:
    project["fragment"] = None
    analysis = {**(project.get("analysis") or {})}
    analysis["audio"] = None
    analysis["audio_key"] = None
    project["analysis"] = analysis
    project["edits"] = []


def _reset_video(project: dict[str, Any]) -> None:
    analysis = {**(project.get("analysis") or {})}
    analysis["video"] = None
    analysis["video_key"] = None
    project["analysis"] = analysis
    project["edits"] = []


@router.post("/upload/audio")
async def upload_audio(
    project_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    project = load_project(project_id)
    layout = project_layout(project_id)
    destination = layout["source"] / safe_source_name(project_id, "audio", file.filename or "audio")
    path, size = await save_upload(file, destination, allowed_ext=AUDIO_EXT, kind="audio")
    try:
        info = await asyncio.to_thread(probe, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if not info.has_audio:
        path.unlink(missing_ok=True)
        raise ValidationError("El archivo no contiene una pista de audio válida.")
    if info.duration < 3:
        path.unlink(missing_ok=True)
        raise ValidationError("El audio debe durar al menos 3 segundos.")

    old = (project.get("audio") or {}).get("path")
    payload = {
        "filename": file.filename or path.name,
        "path": rel(path, layout["root"]),
        "size": size,
        "duration": round(info.duration, 3),
        "format": Path(file.filename or path.name).suffix.lower().lstrip(".") or "audio",
        "sample_rate": info.sample_rate,
        "channels": info.channels,
        "codec": info.audio_codec,
    }

    def mutate(data: dict[str, Any]) -> None:
        data["audio"] = payload
        _reset_audio(data)

    mutate_project(project_id, mutate)
    if old and old != payload["path"]:
        (layout["root"] / old).unlink(missing_ok=True)
    project = load_project(project_id)
    return {"audio": payload, "project": project_payload(project)}


@router.post("/upload/video")
async def upload_video(
    project_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    project = load_project(project_id)
    layout = project_layout(project_id)
    destination = layout["source"] / safe_source_name(project_id, "video", file.filename or "video")
    path, size = await save_upload(file, destination, allowed_ext=VIDEO_EXT, kind="vídeo")
    try:
        info = await asyncio.to_thread(probe, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if not info.has_video:
        path.unlink(missing_ok=True)
        raise ValidationError("El archivo no contiene una pista de vídeo válida.")
    if info.duration < 1:
        path.unlink(missing_ok=True)
        raise ValidationError("El vídeo es demasiado corto.")

    old = (project.get("video") or {}).get("path")
    payload = {
        "filename": file.filename or path.name,
        "path": rel(path, layout["root"]),
        "size": size,
        "duration": round(info.duration, 3),
        "width": info.width,
        "height": info.height,
        "fps": round(info.fps, 3),
        "source_width": info.width,
        "source_height": info.height,
        "source_fps": round(info.fps, 3),
        "codec": info.video_codec,
        "format": Path(file.filename or path.name).suffix.lower().lstrip(".") or "video",
        "source_kind": "upload",
        "attribution": None,
    }

    def mutate(data: dict[str, Any]) -> None:
        data["video"] = payload
        data["youtube"] = None
        _reset_video(data)

    mutate_project(project_id, mutate)
    if old and old != payload["path"]:
        (layout["root"] / old).unlink(missing_ok=True)
    project = load_project(project_id)
    return {"video": payload, "project": project_payload(project)}


def _ytdlp() -> list[str]:
    if shutil.which("yt-dlp"):
        return ["yt-dlp"]
    return [sys.executable, "-m", "yt_dlp"]


def _preflight_sync(url: str) -> dict[str, Any]:
    command = [
        *_ytdlp(),
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "--skip-download",
        url,
    ]
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError as exc:
        raise ProcessingError("yt-dlp no está instalado; usa la subida local de vídeo.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProcessingError("La consulta a YouTube excedió el tiempo máximo.") from exc
    if proc.returncode != 0:
        raise ProcessingError(
            "No se pudo leer el vídeo de YouTube. Puede ser privado, restringido o requerir otra vía.",
            detail=(proc.stderr or "")[-1500:],
        )
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ProcessingError("yt-dlp devolvió metadatos ilegibles.") from exc
    if data.get("is_live"):
        raise ValidationError("No se admiten directos en vivo.")
    return {
        "title": data.get("title"),
        "duration": data.get("duration"),
        "uploader": data.get("uploader") or data.get("channel"),
        "thumbnail": data.get("thumbnail"),
        "webpage_url": data.get("webpage_url") or url,
        "width": data.get("width"),
        "height": data.get("height"),
        "extractor": data.get("extractor"),
        "license": data.get("license"),
    }


@router.post("/source/youtube/preflight")
async def youtube_preflight(body: YouTubePreflight) -> dict[str, Any]:
    if not body.rights_confirmed:
        raise ValidationError(
            "Debes confirmar que tienes derechos sobre el material antes de importarlo."
        )
    metadata = await asyncio.to_thread(_preflight_sync, body.url)
    return {"metadata": metadata}


def _download_sync(url: str, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    before = {p.name for p in directory.glob("youtube_*")}
    command = [
        *_ytdlp(),
        "-f",
        "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4][height<=1080]/"
        "bv*[height<=1080]+ba/b[height<=1080]",
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "--no-warnings",
        "--restrict-filenames",
        "--no-cache-dir",
        "-o",
        str(directory / "youtube_%(id)s.%(ext)s"),
        url,
    ]
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=1800,
            creationflags=CREATE_NO_WINDOW,
        )
    except subprocess.TimeoutExpired as exc:
        raise ProcessingError("La descarga superó los 30 minutos.") from exc
    if proc.returncode != 0:
        raise ProcessingError(
            "La importación falló. Revisa que el vídeo sea público y que tengas derechos sobre él.",
            detail=(proc.stderr or "")[-2000:],
        )
    files = [p for p in directory.glob("youtube_*") if p.name not in before and p.is_file()]
    if not files:
        files = [p for p in directory.glob("youtube_*") if p.is_file()]
    if not files:
        raise ProcessingError("yt-dlp terminó sin generar un archivo de vídeo.")
    return max(files, key=lambda p: p.stat().st_mtime)


@router.post("/source/youtube/import")
async def youtube_import(body: YouTubeImport) -> dict[str, Any]:
    if not body.rights_confirmed:
        raise ValidationError(
            "Debes confirmar que tienes derechos sobre el material antes de importarlo."
        )
    project = load_project(body.project_id)
    layout = project_layout(body.project_id)
    metadata = await asyncio.to_thread(_preflight_sync, body.url)
    path = await asyncio.to_thread(_download_sync, body.url, layout["source"])
    info = await asyncio.to_thread(probe, path)
    if not info.has_video:
        path.unlink(missing_ok=True)
        raise ValidationError("La descarga no contiene vídeo válido.")

    old = (project.get("video") or {}).get("path")
    payload = {
        "filename": path.name,
        "path": rel(path, layout["root"]),
        "size": path.stat().st_size,
        "duration": round(info.duration, 3),
        "width": info.width,
        "height": info.height,
        "fps": round(info.fps, 3),
        "source_width": info.width,
        "source_height": info.height,
        "source_fps": round(info.fps, 3),
        "codec": info.video_codec,
        "format": path.suffix.lower().lstrip("."),
        "source_kind": "youtube",
        "attribution": {
            "title": metadata.get("title"),
            "uploader": metadata.get("uploader"),
            "url": metadata.get("webpage_url"),
            "note": "El usuario confirmó tener derechos para usar este material.",
        },
    }

    def mutate(data: dict[str, Any]) -> None:
        data["video"] = payload
        data["youtube"] = {
            **metadata,
            "imported_at": time.time(),
            "rights_confirmed": True,
        }
        _reset_video(data)

    mutate_project(body.project_id, mutate)
    if old and old != payload["path"]:
        (layout["root"] / old).unlink(missing_ok=True)
    project = load_project(body.project_id)
    return {"video": payload, "metadata": metadata, "project": project_payload(project)}
