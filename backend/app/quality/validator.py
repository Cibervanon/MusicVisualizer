"""Validador objetivo de los MP4 generados."""

from __future__ import annotations

import itertools
import json
import subprocess
from pathlib import Path
from typing import Any

from ..core.ffmpeg import CREATE_NO_WINDOW, FFMPEG, FFPROBE, probe


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

    # Duración: tolerancia de 1 frame
    frame_tolerance = 1.0 / max(1, fps) + 0.02
    if abs(info.duration - expected_duration) > frame_tolerance:
        issues.append(
            {
                "level": "warning",
                "message": f"Duración {info.duration:.3f}s frente a {expected_duration:.3f}s esperados (tol: {frame_tolerance:.3f}s).",
            }
        )
    # Frame count verification
    expected_frames = round(expected_duration * fps)
    actual_frames = round(info.duration * fps)
    if abs(actual_frames - expected_frames) > 2:
        issues.append(
            {
                "level": "warning",
                "message": f"Frames {actual_frames} frente a {expected_frames} esperados (@{fps}fps).",
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

    # Audio/Video sync check (PTS drift)
    try:
        sync_info = _check_av_sync(output)
        if sync_info["drift_seconds"] > 0.05:
            issues.append(
                {
                    "level": "warning",
                    "message": f"Desincronización A/V: {sync_info['drift_seconds']:.3f}s deriva.",
                }
            )
    except Exception as exc:
        issues.append({"level": "warning", "message": f"No se pudo verificar sync A/V: {exc}"})

    # Keyframe interval check
    try:
        keyframe_info = _check_keyframes(output, fps)
        if keyframe_info["max_interval_seconds"] > 5.0:
            issues.append(
                {
                    "level": "warning",
                    "message": f"Intervalo de keyframes máximo: {keyframe_info['max_interval_seconds']:.1f}s (recomendado < 5s).",
                }
            )
    except Exception as exc:
        issues.append({"level": "warning", "message": f"No se pudo verificar keyframes: {exc}"})

    # H.264 profile/level check
    try:
        codec_info = _check_h264_profile(output)
        if codec_info["profile"] != "High":
            issues.append(
                {
                    "level": "warning",
                    "message": f"Perfil H.264: {codec_info['profile']} (recomendado High).",
                }
            )
        required_level = _required_h264_level(info.width, info.height, fps)
        if codec_info["level"] and codec_info["level"] < required_level:
            issues.append(
                {
                    "level": "warning",
                    "message": (
                        f"Nivel H.264 {codec_info['level'] / 10:.1f} por debajo del "
                        f"necesario para {info.width}x{info.height}@{fps}fps "
                        f"({required_level / 10:.1f})."
                    ),
                }
            )
    except Exception as exc:
        issues.append({"level": "warning", "message": f"No se pudo verificar perfil H.264: {exc}"})

    # Color space check
    if info.color_space and info.color_space not in ("bt709", "bt470bg", "smpte170m"):
        issues.append(
            {
                "level": "warning",
                "message": f"Espacio de color inusual: {info.color_space}.",
            }
        )

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


# Niveles H.264 como (nivel x10, macrobloques/segundo, macrobloques/frame).
# Fuente: tabla A.1 de ITU-T H.264.
_H264_LEVELS: tuple[tuple[int, int, int], ...] = (
    (10, 1_485, 99),
    (11, 3_000, 396),
    (12, 6_000, 396),
    (13, 11_880, 396),
    (20, 11_880, 396),
    (21, 19_800, 792),
    (22, 20_250, 1_620),
    (30, 40_500, 1_620),
    (31, 108_000, 3_600),
    (32, 216_000, 5_120),
    (40, 245_760, 8_192),
    (41, 245_760, 8_192),
    (42, 522_240, 8_704),
    (50, 589_824, 22_080),
    (51, 983_040, 36_864),
    (52, 2_073_600, 36_864),
    (60, 4_177_920, 139_264),
)


def _required_h264_level(width: int, height: int, fps: int) -> int:
    """Nivel mínimo de H.264 para una resolución y fps dados."""
    frame_mbs = max(1, -(-width // 16)) * max(1, -(-height // 16))
    mbs_per_second = frame_mbs * max(1, fps)
    for level, max_mbps, max_fs in _H264_LEVELS:
        if mbs_per_second <= max_mbps and frame_mbs <= max_fs:
            return level
    return _H264_LEVELS[-1][0]


def _ffprobe_json(args: list[str], timeout: int) -> dict[str, Any]:
    """Ejecuta ffprobe y devuelve su JSON. Falla si el proceso o el JSON no son válidos."""
    proc = subprocess.run(
        [FFPROBE, "-v", "error", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip()[:300]
        raise RuntimeError(detail or f"ffprobe terminó con código {proc.returncode}")
    try:
        parsed = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe devolvió una respuesta ilegible") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("ffprobe devolvió un JSON que no es un objeto")
    return parsed


def _check_av_sync(path: Path) -> dict[str, Any]:
    """Check audio/video synchronization using ffprobe."""
    data = _ffprobe_json(
        ["-show_entries", "stream=codec_type,start_time", "-of", "json", str(path)],
        timeout=30,
    )
    streams = data.get("streams", [])
    video_stream: dict[str, Any] = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream: dict[str, Any] = next((s for s in streams if s.get("codec_type") == "audio"), {})

    v_start = float(video_stream.get("start_time", 0) or 0)
    a_start = float(audio_stream.get("start_time", 0) or 0)

    return {
        "video_start_pts": v_start,
        "audio_start_pts": a_start,
        "drift_seconds": abs(v_start - a_start),
    }


def _check_keyframes(path: Path, fps: int) -> dict[str, Any]:
    """Check keyframe interval using ffprobe."""
    data = _ffprobe_json(
        [
            "-select_streams",
            "v:0",
            "-show_frames",
            "-show_entries",
            "frame=key_frame,pts_time",
            "-of",
            "json",
            str(path),
        ],
        timeout=60,
    )
    frames = data.get("frames", [])
    keyframe_times = [
        float(f["pts_time"]) for f in frames if f.get("key_frame") == 1 and f.get("pts_time")
    ]
    if len(keyframe_times) < 2:
        return {"max_interval_seconds": 0.0, "keyframe_count": len(keyframe_times)}
    intervals = [b - a for a, b in itertools.pairwise(keyframe_times)]
    return {
        "max_interval_seconds": max(intervals) if intervals else 0.0,
        "keyframe_count": len(keyframe_times),
        "avg_interval_seconds": sum(intervals) / len(intervals) if intervals else 0.0,
    }


def _check_h264_profile(path: Path) -> dict[str, Any]:
    """Check H.264 profile and level."""
    data = _ffprobe_json(
        [
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=profile,level",
            "-of",
            "json",
            str(path),
        ],
        timeout=30,
    )
    streams = data.get("streams", [])
    if not streams:
        return {"profile": "unknown", "level": None}
    stream = streams[0]
    profile = stream.get("profile", "unknown")
    level = stream.get("level")
    level_text = str(level) if level is not None else ""
    level_num = int(level_text) if level_text.isdigit() else None
    return {"profile": profile, "level": level_num}
