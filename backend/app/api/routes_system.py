"""Estado del sistema: salud, capacidades reales, estilos y presets."""

from __future__ import annotations

import importlib.util
import os
import platform
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from ..core.config import APP_NAME, APP_VERSION, settings
from ..core.ffmpeg import available_encoders, ffmpeg_version, has_filter
from ..core.paths import ROOT_DIR
from ..editing.styles import style_catalog
from ..lyrics.presets import ANIMATIONS, FONT_CHOICES, preset_catalog

router = APIRouter(prefix="/api", tags=["system"])


def _extras() -> dict[str, bool]:
    def exists(name: str) -> bool:
        try:
            return importlib.util.find_spec(name) is not None
        except (ImportError, ValueError):
            return False

    return {
        "faster_whisper": exists("faster_whisper"),
        "torch": exists("torch"),
        "beat_this": exists("beat_this"),
        "demucs": exists("demucs"),
        "whisperx": exists("whisperx"),
    }


def capabilities() -> dict[str, Any]:
    usage = shutil.disk_usage(ROOT_DIR)
    try:
        import cv2

        saliency = hasattr(cv2, "saliency")
        cv_version = cv2.__version__
    except Exception:
        saliency = False
        cv_version = None
    return {
        "app": {"name": APP_NAME, "version": APP_VERSION},
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "ffmpeg": ffmpeg_version(),
        "encoders": available_encoders(),
        "filters": {
            "ass": has_filter("ass"),
            "subtitles": has_filter("subtitles"),
            "xfade": has_filter("xfade"),
            "zoompan": has_filter("zoompan"),
            "rgbashift": has_filter("rgbashift"),
            "vignette": has_filter("vignette"),
            "loudnorm": has_filter("loudnorm"),
        },
        "opencv": {"version": cv_version, "saliency": saliency},
        "extras": _extras(),
        "cpu_count": os.cpu_count(),
        "max_parallel_renders": settings.max_parallel_renders,
        "disk": {
            "total_gb": round(usage.total / (1024**3), 2),
            "free_gb": round(usage.free / (1024**3), 2),
            "used_percent": round(usage.used / usage.total * 100, 1) if usage.total else 0,
        },
        "youtube_available": shutil.which("yt-dlp") is not None
        or importlib.util.find_spec("yt_dlp") is not None,
        "root": str(ROOT_DIR),
    }


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "app": APP_NAME,
        "version": APP_VERSION,
        "time": time.time(),
        "ffmpeg": ffmpeg_version(),
    }


@router.get("/system/capabilities")
async def system_capabilities() -> dict[str, Any]:
    return capabilities()


@router.get("/system/doctor")
async def system_doctor() -> dict[str, Any]:
    data = capabilities()
    checks = [
        {"name": "FFmpeg", "ok": data["ffmpeg"] != "no disponible", "value": data["ffmpeg"]},
        {"name": "Filtro ASS (libass)", "ok": data["filters"]["ass"], "value": data["filters"]["ass"]},
        {"name": "Filtro xfade", "ok": data["filters"]["xfade"], "value": data["filters"]["xfade"]},
        {"name": "Filtro loudnorm", "ok": data["filters"]["loudnorm"], "value": data["filters"]["loudnorm"]},
        {"name": "OpenCV saliency", "ok": data["opencv"]["saliency"], "value": data["opencv"]["version"]},
        {
            "name": "Espacio libre > 8 GB",
            "ok": data["disk"]["free_gb"] > 8,
            "value": f"{data['disk']['free_gb']} GB",
        },
    ]
    return {**data, "checks": checks, "ok": all(item["ok"] for item in checks)}


@router.get("/styles")
async def styles() -> dict[str, Any]:
    return {"styles": style_catalog()}


@router.get("/fonts")
async def fonts() -> dict[str, Any]:
    return {"fonts": FONT_CHOICES}


@router.get("/text-presets")
async def text_presets() -> dict[str, Any]:
    return {"presets": preset_catalog(), "animations": ANIMATIONS, "fonts": FONT_CHOICES}
