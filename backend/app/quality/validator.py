"""Validador objetivo de los MP4 generados."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from ..core.ffmpeg import CREATE_NO_WINDOW, FFMPEG, probe


def validate_render(
    path: str | Path,
    *,
    expected_duration: float,
    width: int,
    height: int,
    fps: int,
) -> dict[str, Any]:
    output = Path(path)
    issues: list[dict[str, str]] = []
    if not output.exists():
        return {
            "ok": False,
            "issues": [{"level": "error", "message": "El archivo de salida no existe."}],
            "info": None,
        }
    try:
        info = probe(output)
    except Exception as exc:
        return {
            "ok": False,
            "issues": [{"level": "error", "message": f"No se pudo leer el MP4: {exc}"}],
            "info": None,
        }

    if abs(info.duration - expected_duration) > 0.4:
        issues.append(
            {
                "level": "warning",
                "message": f"Duración {info.duration:.2f}s frente a {expected_duration:.2f}s esperados.",
            }
        )
    if info.width != width or info.height != height:
        issues.append(
            {
                "level": "warning",
                "message": f"Resolución {info.width}x{info.height} frente a {width}x{height}.",
            }
        )
    if not info.has_audio:
        issues.append({"level": "error", "message": "El MP4 no tiene pista de audio."})
    if not info.has_video:
        issues.append({"level": "error", "message": "El MP4 no tiene pista de vídeo."})
    if info.size < 20_000:
        issues.append({"level": "error", "message": "El archivo es sospechosamente pequeño."})

    # Integridad real: decodifica todo el archivo sin escribir salida.
    try:
        proc = subprocess.run(
            [FFMPEG, "-v", "error", "-nostdin", "-i", str(output), "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=180,
            creationflags=CREATE_NO_WINDOW,
        )
        if proc.returncode != 0 or (proc.stderr or "").strip():
            issues.append(
                {
                    "level": "warning",
                    "message": "FFmpeg reportó errores al decodificar el resultado.",
                }
            )
    except Exception as exc:
        issues.append({"level": "warning", "message": f"No se pudo verificar la integridad: {exc}"})

    has_error = any(item["level"] == "error" for item in issues)
    return {
        "ok": not has_error,
        "issues": issues,
        "info": info.to_dict(),
    }
