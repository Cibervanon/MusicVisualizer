"""Envoltorio de FFmpeg/FFprobe.

Reglas del proyecto:
- El progreso SIEMPRE procede de `-progress pipe:1` de FFmpeg, nunca se simula.
- Los procesos se pueden cancelar de verdad (terminate + kill de respaldo).
- En Windows no se abren ventanas de consola.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import ProcessingError

IS_WINDOWS = os.name == "nt"
CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

ProgressCallback = Callable[[float, dict[str, Any]], Awaitable[None] | None]


@dataclass(slots=True)
class MediaInfo:
    path: str
    duration: float
    size: int
    width: int = 0
    height: int = 0
    fps: float = 0.0
    video_codec: str | None = None
    audio_codec: str | None = None
    sample_rate: int = 0
    channels: int = 0
    has_video: bool = False
    has_audio: bool = False
    format_name: str = ""
    color_space: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "duration": round(self.duration, 4),
            "size": self.size,
            "width": self.width,
            "height": self.height,
            "fps": round(self.fps, 3),
            "video_codec": self.video_codec,
            "audio_codec": self.audio_codec,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "has_video": self.has_video,
            "has_audio": self.has_audio,
            "format_name": self.format_name,
        }


def _parse_rate(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        if "/" in value:
            num, den = value.split("/", 1)
            den_f = float(den)
            return float(num) / den_f if den_f else 0.0
        return float(value)
    except (ValueError, ZeroDivisionError):
        return 0.0


def probe(path: str | Path, timeout: int = 90) -> MediaInfo:
    """Lee metadatos reales con ffprobe. Lanza ProcessingError si el archivo no es válido."""
    file_path = Path(path)
    if not file_path.exists():
        raise ProcessingError(f"El archivo no existe: {file_path.name}")
    cmd = [
        FFPROBE,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError as exc:
        raise ProcessingError("FFprobe no está instalado o no está en el PATH.") from exc
    if proc.returncode != 0:
        raise ProcessingError(
            f"FFprobe no pudo leer el archivo: {proc.stderr.strip()[:500]}",
            detail={"file": file_path.name},
        )
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ProcessingError("FFprobe devolvió una respuesta ilegible.") from exc

    fmt = data.get("format", {}) or {}
    streams = data.get("streams", []) or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    duration = 0.0
    for candidate in (fmt.get("duration"), (video or {}).get("duration"), (audio or {}).get("duration")):
        try:
            duration = float(candidate)
            if duration > 0:
                break
        except (TypeError, ValueError):
            continue

    return MediaInfo(
        path=str(file_path),
        duration=duration,
        size=file_path.stat().st_size,
        width=int((video or {}).get("width") or 0),
        height=int((video or {}).get("height") or 0),
        fps=_parse_rate((video or {}).get("avg_frame_rate") or (video or {}).get("r_frame_rate")),
        video_codec=(video or {}).get("codec_name"),
        audio_codec=(audio or {}).get("codec_name"),
        sample_rate=int((audio or {}).get("sample_rate") or 0),
        channels=int((audio or {}).get("channels") or 0),
        has_video=video is not None,
        has_audio=audio is not None,
        format_name=fmt.get("format_name", ""),
    )


def escape_filter_path(path: str | Path) -> str:
    """Escapa una ruta para usarla dentro de un filtro FFmpeg (subtitles/ass)."""
    value = str(path).replace("\\", "/")
    # En Windows el ':' de la unidad debe escaparse dentro del filtergraph.
    value = value.replace(":", r"\:")
    value = value.replace("'", r"\'")
    return value


def ass_filter(path: str | Path) -> str:
    return f"ass='{escape_filter_path(path)}'"


_FILTER_FILE_MODE: str | None = None


def filter_graph_input(path: str | Path) -> list[str]:
    """Devuelve los argumentos para cargar un filtergraph desde un archivo.

    FFmpeg 8+ eliminó ``-filter_complex_script``. La forma genérica
    ``-/filter_complex <archivo>`` existe desde FFmpeg 7.1. Se detecta la
    capacidad real del binario una sola vez y se cachea.
    """
    global _FILTER_FILE_MODE
    if _FILTER_FILE_MODE is None:
        try:
            proc = subprocess.run(
                [FFMPEG, "-hide_banner", "-h", "full"],
                capture_output=True,
                text=True,
                timeout=30,
                creationflags=CREATE_NO_WINDOW,
            )
            text = proc.stdout or ""
        except Exception:
            text = ""
        _FILTER_FILE_MODE = "script" if "-filter_complex_script" in text else "file"
    if _FILTER_FILE_MODE == "script":
        return ["-filter_complex_script", str(path)]
    return ["-/filter_complex", str(path)]


async def _drain_stderr(stream: asyncio.StreamReader, sink: list[str]) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode("utf-8", errors="replace").rstrip()
        if text:
            sink.append(text)
            if len(sink) > 300:
                del sink[0 : len(sink) - 300]


async def _read_progress(
    stream: asyncio.StreamReader,
    duration: float | None,
    callback: ProgressCallback | None,
) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        key, _, value = text.partition("=")
        if key in {"out_time_us", "out_time_ms"} and duration and duration > 0:
            try:
                seconds = int(value) / 1_000_000
            except ValueError:
                continue
            if seconds >= 0 and callback is not None:
                result = callback(min(1.0, seconds / duration), {"out_time": round(seconds, 3)})
                if asyncio.iscoroutine(result):
                    await result
        elif key == "progress" and value == "end" and callback is not None:
            result = callback(1.0, {"out_time": duration})
            if asyncio.iscoroutine(result):
                await result


async def run_ffmpeg(
    args: list[str],
    *,
    duration: float | None = None,
    on_progress: ProgressCallback | None = None,
    cancel_event: asyncio.Event | None = None,
    timeout: float | None = None,
) -> str:
    """Ejecuta FFmpeg y devuelve la salida de error (vacía si todo fue bien).

    `args` debe contener todas las opciones, incluyendo el archivo de salida.
    """
    cmd = [FFMPEG, "-hide_banner", "-y", "-nostdin", "-progress", "pipe:1", "-nostats", *args]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError as exc:
        raise ProcessingError("FFmpeg no está instalado o no está en el PATH.") from exc

    stderr_lines: list[str] = []
    tasks = [
        asyncio.create_task(_drain_stderr(proc.stderr, stderr_lines)),
        asyncio.create_task(_read_progress(proc.stdout, duration, on_progress)),
    ]

    cancelled = False

    async def watch_cancel() -> None:
        nonlocal cancelled
        assert cancel_event is not None
        await cancel_event.wait()
        if proc.returncode is None:
            cancelled = True
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=4)
            except TimeoutError:
                proc.kill()

    cancel_task = asyncio.create_task(watch_cancel()) if cancel_event is not None else None
    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout) if timeout else await proc.wait()
    except TimeoutError as exc:
        proc.kill()
        raise ProcessingError("FFmpeg excedió el tiempo máximo permitido.") from exc
    finally:
        if cancel_task is not None:
            cancel_task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    if cancelled:
        raise ProcessingError("Proceso cancelado por el usuario.", code="cancelled")

    stderr = "\n".join(stderr_lines)
    if proc.returncode != 0:
        raise ProcessingError(
            "FFmpeg terminó con error.",
            detail={"exit_code": proc.returncode, "stderr": stderr[-4000:]},
        )
    return stderr


def run_ffmpeg_sync(args: list[str], *, timeout: float | None = None) -> str:
    """Variante síncrona para utilidades pequeñas (miniaturas, sondeos)."""
    cmd = [FFMPEG, "-hide_banner", "-y", "-nostdin", "-loglevel", "error", *args]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        raise ProcessingError(
            "FFmpeg terminó con error.",
            detail={"exit_code": proc.returncode, "stderr": (proc.stderr or "")[-4000:]},
        )
    return proc.stderr or ""


def ffmpeg_version() -> str:
    try:
        proc = subprocess.run(
            [FFMPEG, "-version"],
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=CREATE_NO_WINDOW,
        )
        return (proc.stdout or "").splitlines()[0] if proc.stdout else "desconocida"
    except Exception:
        return "no disponible"


def available_encoders() -> dict[str, bool]:
    """Comprueba codificadores de vídeo por hardware de forma real."""
    try:
        proc = subprocess.run(
            [FFMPEG, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=CREATE_NO_WINDOW,
        )
        text = proc.stdout or ""
    except Exception:
        return {"libx264": False, "h264_qsv": False, "h264_nvenc": False, "h264_amf": False}
    return {
        name: name in text for name in ("libx264", "h264_qsv", "h264_nvenc", "h264_amf", "libx265")
    }


def has_filter(name: str) -> bool:
    try:
        proc = subprocess.run(
            [FFMPEG, "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=CREATE_NO_WINDOW,
        )
        return name in (proc.stdout or "")
    except Exception:
        return False
