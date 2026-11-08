"""Normalización del vídeo fuente a un máster reutilizable.

Se decodifica el vídeo completo UNA vez. Todas las versiones se montan después
contra este máster con búsquedas rápidas (keyframe cada 0,5 s).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..core.ffmpeg import probe, run_ffmpeg
from ..core.paths import project_layout
from ..core.util import file_fingerprint, read_json, sha1_of, write_json

MASTER_VERSION = "master-v2"

FORMAT_ASPECTS: dict[str, tuple[int, int]] = {
    "9:16": (9, 16),
    "1:1": (1, 1),
    "16:9": (16, 9),
    "4:5": (4, 5),
}

RESOLUTION_HEIGHTS = {"720p": 720, "1080p": 1080, "1440p": 1440}


def target_dims(fmt: str, resolution: str) -> tuple[int, int]:
    """Devuelve (ancho, alto) pares para que x264 no reciba dimensiones impares."""
    height = RESOLUTION_HEIGHTS.get(resolution, 1080)
    aspect_w, aspect_h = FORMAT_ASPECTS.get(fmt, (9, 16))
    if aspect_w >= aspect_h:
        width = height
        out_h = int(round(width * aspect_h / aspect_w))
    else:
        out_h = height
        width = int(round(out_h * aspect_w / aspect_h))
    # Múltiplos de 2 obligatorios para yuv420p.
    width = max(2, int(round(width / 2)) * 2)
    out_h = max(2, int(round(out_h / 2)) * 2)
    return width, out_h


MasterProgress = Callable[[float], Awaitable[None] | None]


async def ensure_master(
    project_id: str,
    source_path: str | Path,
    fmt: str,
    resolution: str,
    fps: int,
    *,
    cancel_event: asyncio.Event | None = None,
    on_progress: MasterProgress | None = None,
) -> dict[str, Any]:
    layout = project_layout(project_id)
    master_dir = layout["master"]
    master_dir.mkdir(parents=True, exist_ok=True)
    width, height = target_dims(fmt, resolution)
    name = f"master_{width}x{height}_{fps}.mp4"
    master_path = master_dir / name
    meta_path = master_dir / f"{name}.json"

    source_info = probe(source_path)
    key = sha1_of(
        {
            "source": file_fingerprint(source_path),
            "fmt": fmt,
            "resolution": resolution,
            "fps": fps,
            "version": MASTER_VERSION,
        }
    )
    cached = read_json(meta_path)
    if isinstance(cached, dict) and cached.get("key") == key and master_path.exists():
        return cached

    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,fps={fps},format=yuv420p"
    )
    args = [
        "-i",
        str(source_path),
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "16",
        "-g",
        str(max(2, int(fps / 2))),
        "-keyint_min",
        str(max(2, int(fps / 2))),
        "-sc_threshold",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(master_path),
    ]

    async def progress(value: float, _meta: dict[str, Any]) -> None:
        if on_progress is not None:
            result = on_progress(value)
            if asyncio.iscoroutine(result):
                await result

    await run_ffmpeg(
        args,
        duration=source_info.duration,
        on_progress=progress,
        cancel_event=cancel_event,
        timeout=None,
    )

    info = probe(master_path)
    meta = {
        "key": key,
        "path": str(master_path.relative_to(layout["root"])).replace("\\", "/"),
        "abs_path": str(master_path),
        "format": fmt,
        "resolution": resolution,
        "fps": fps,
        "width": width,
        "height": height,
        "duration": round(info.duration, 4),
        "size": info.size,
        "source": file_fingerprint(source_path),
    }
    write_json(meta_path, meta)
    return meta
