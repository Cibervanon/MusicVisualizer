"""Persistencia y resolución de letras."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ..core.errors import AppError, NotFoundError
from ..core.paths import project_layout
from ..core.util import read_json, write_json
from ..project.manager import load_project, mutate_project
from .ass_builder import write_ass
from .presets import default_style, merge_style
from .parser import normalize_lines


def empty_lyrics() -> dict[str, Any]:
    return {
        "enabled": False,
        "source": "manual",
        "style": default_style(),
        "lines": [],
        "updated_at": None,
        "note": "Las letras automáticas pueden contener errores. Revísalas antes de exportar.",
    }


def get_lyrics(project: dict[str, Any]) -> dict[str, Any]:
    lyrics = project.get("lyrics") or {}
    if not lyrics:
        return empty_lyrics()
    style = merge_style((lyrics.get("style") or {}).get("id"), lyrics.get("style"))
    return {
        "enabled": bool(lyrics.get("enabled")),
        "source": lyrics.get("source") or "manual",
        "style": style,
        "lines": lyrics.get("lines") or [],
        "updated_at": lyrics.get("updated_at"),
        "note": lyrics.get("note") or empty_lyrics()["note"],
    }


def save_lyrics(
    project_id: str,
    lines: list[dict[str, Any]],
    *,
    source: str = "manual",
    style: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    """Guarda las letras sin perder cambios concurrentes del proyecto.

    Antes se hacía load → modificar → save fuera del lock: un render que
    terminase en paralelo podía desaparecer del project.json. Ahora la lectura
    y la escritura ocurren dentro de `mutate_project` (lock reentrante).
    """
    layout = project_layout(project_id)
    merged_style = merge_style((style or {}).get("id"), style)
    result: dict[str, Any] = {}

    def mutate(project: dict[str, Any]) -> None:
        duration = float((project.get("fragment") or {}).get("duration") or 30.0)
        normalized = normalize_lines(lines, duration, source=source)
        payload = {
            "enabled": enabled,
            "source": source,
            "style": merged_style,
            "lines": normalized,
            "updated_at": time.time(),
            "note": "Las letras automáticas pueden contener errores. Revísalas antes de exportar.",
        }
        write_json(layout["lyrics"] / "lyrics.json", payload)
        project["lyrics"] = payload
        result.clear()
        result.update(payload)

    mutate_project(project_id, mutate)
    return result


def set_lyrics_payload(project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return save_lyrics(
        project_id,
        payload.get("lines") or [],
        source=payload.get("source") or "manual",
        style=payload.get("style"),
        enabled=bool(payload.get("enabled", True)),
    )


def resolve_ass_for_edit(
    project: dict[str, Any],
    edl: dict[str, Any],
    output_path: Path,
) -> Path | None:
    """Construye el ASS del EDL. Devuelve None si no hay letras activas."""
    lyrics = get_lyrics(project)
    edl_lyrics = edl.get("lyrics") or {}
    # El estado global del proyecto manda: si el usuario activa las letras y
    # vuelve a renderizar, deben quemarse aunque el EDL se generara sin ellas.
    enabled = bool(lyrics.get("enabled"))
    if not enabled:
        return None
    lines = lyrics.get("lines") or []
    if not lines:
        return None
    style = merge_style(
        (edl_lyrics.get("style") or {}).get("id") or (lyrics.get("style") or {}).get("id"),
        {**(lyrics.get("style") or {}), **(edl_lyrics.get("style") or {})},
    )
    return write_ass(
        output_path,
        lines,
        style,
        width=int(edl.get("width") or 1080),
        height=int(edl.get("height") or 1920),
        duration=float(edl.get("duration") or 30.0),
    )


def read_lyrics_file(project_id: str) -> dict[str, Any]:
    layout = project_layout(project_id)
    data = read_json(layout["lyrics"] / "lyrics.json")
    if not isinstance(data, dict):
        raise NotFoundError("El proyecto todavía no tiene letras guardadas.")
    return data


def transcribe_audio(project_id: str, language: str | None, model_size: str) -> list[dict[str, Any]]:
    """Transcripción opcional con faster-whisper. Si no está instalado, error claro."""
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:  # pragma: no cover - depende del extra
        raise AppError(
            "La transcripción automática requiere el extra 'faster-whisper'.",
            code="extra_not_installed",
            status_code=503,
            detail={
                "install": "backend\\.venv\\Scripts\\python.exe -m pip install faster-whisper",
                "docs": "requirements-optional.txt",
                "original": str(exc),
            },
        ) from exc

    project = load_project(project_id)
    layout = project_layout(project_id)
    fragment = read_json(layout["analysis"] / "audio" / "fragment.json")
    if not isinstance(fragment, dict) or not fragment.get("mono"):
        raise AppError("Primero analiza el fragmento de audio.", code="audio_not_analyzed")
    mono = layout["root"] / fragment["mono"]
    if not mono.exists():
        raise NotFoundError("No se encuentra el WAV de análisis.")

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(mono), language=language, vad_filter=True, beam_size=5)
    lines = []
    for segment in segments:
        text = (segment.text or "").strip()
        if not text:
            continue
        lines.append(
            {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": text,
            }
        )
    if not lines:
        raise AppError(
            "No se detectó voz en el fragmento.",
            code="no_speech",
            status_code=422,
        )
    return normalize_lines(lines, float((project.get("fragment") or {}).get("duration") or 30.0), source="whisper")
