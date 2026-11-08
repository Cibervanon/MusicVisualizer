#!/usr/bin/env python
"""Comprobacion local del entorno de Lumen Studio.

Uso:
    backend\\.venv\\Scripts\\python.exe scripts\\doctor.py

No modifica nada: solo comprueba que las piezas necesarias existen y que
FFmpeg tiene los filtros que usa el render. Devuelve codigo 1 si falta algo
imprescindible.
"""

from __future__ import annotations

import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_MODULES = {
    "fastapi": "FastAPI",
    "uvicorn": "Uvicorn",
    "pydantic": "Pydantic",
    "numpy": "NumPy",
    "scipy": "SciPy",
    "librosa": "librosa",
    "soundfile": "soundfile",
    "cv2": "OpenCV",
    "scenedetect": "PySceneDetect",
    "PIL": "Pillow",
    "yt_dlp": "yt-dlp",
}
OPTIONAL_MODULES = {
    "faster_whisper": "faster-whisper (transcripcion de letras)",
    "torch": "PyTorch (solo si usas modelos que lo requieren)",
}
REQUIRED_FILTERS = ("ass", "xfade", "zoompan", "loudnorm", "vignette")

results: list[tuple[str, bool, str, bool]] = []


def check(name: str, ok: bool, detail: str, required: bool = True) -> None:
    results.append((name, ok, detail, required))


def module_version(name: str) -> str | None:
    try:
        module = __import__(name)
    except Exception:
        return None
    return str(getattr(module, "__version__", "instalado"))


def ffmpeg_version() -> str | None:
    exe = shutil.which("ffmpeg")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "-version"],
            capture_output=True,
            text=True,
            timeout=20,
            encoding="utf-8",
            errors="replace",
        ).stdout
    except Exception:
        return None
    first = out.splitlines()[0] if out else ""
    return first or "ffmpeg"


def has_filter(name: str) -> bool:
    exe = shutil.which("ffmpeg")
    if not exe:
        return False
    try:
        out = subprocess.run(
            [exe, "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        ).stdout
    except Exception:
        return False
    return any(line.split()[1:2] == [name] for line in out.splitlines() if line.split())


def disk_free_gb() -> float:
    return round(shutil.disk_usage(ROOT).free / (1024**3), 2)


def main() -> int:
    print("Lumen Studio · doctor")
    print(f"Sistema: {platform.platform()}")
    print(f"Python:  {sys.version.split()[0]} ({sys.executable})")
    print(f"Raiz:    {ROOT}")
    print()

    check("Python >= 3.11", sys.version_info >= (3, 11), sys.version.split()[0])

    ffmpeg = ffmpeg_version()
    check("FFmpeg en PATH", ffmpeg is not None, ffmpeg or "no encontrado")
    ffprobe = shutil.which("ffprobe")
    check("FFprobe en PATH", ffprobe is not None, ffprobe or "no encontrado")

    for module, label in REQUIRED_MODULES.items():
        spec = importlib.util.find_spec(module)
        check(label, spec is not None, module_version(module) or "no instalado")

    if ffmpeg:
        for name in REQUIRED_FILTERS:
            check(f"Filtro FFmpeg {name}", has_filter(name), name)
        check(
            "Filtro subtitles/ass (letras)",
            has_filter("subtitles") or has_filter("ass"),
            "libass disponible" if has_filter("ass") else "sin libass",
            required=False,
        )

    free = disk_free_gb()
    check("Espacio libre > 8 GB", free > 8, f"{free} GB", required=False)

    for module, label in OPTIONAL_MODULES.items():
        spec = importlib.util.find_spec(module)
        check(label, spec is not None, "instalado" if spec else "opcional, no instalado", required=False)

    node = shutil.which("node")
    npm = shutil.which("npm")
    check("Node.js", node is not None, node or "no encontrado (solo necesario para desarrollo)", required=False)
    check("npm", npm is not None, npm or "no encontrado", required=False)
    check(
        "Frontend compilado",
        (ROOT / "frontend" / "dist" / "index.html").exists(),
        str(ROOT / "frontend" / "dist"),
        required=False,
    )

    print("Resultados")
    print("-" * 72)
    for name, ok, detail, required in results:
        if ok:
            mark = "OK  "
        elif required:
            mark = "FAIL"
        else:
            mark = "WARN"
        print(f"[{mark}] {name:<36} {detail}")

    failed = [item for item in results if not item[1] and item[3]]
    warnings = [item for item in results if not item[1] and not item[3]]
    print()
    if failed:
        print(f"{len(failed)} comprobacion(es) imprescindible(s) fallida(s).")
        print("Ejecuta setup.bat o revisa README.md (Requisitos).")
        return 1
    print(f"Entorno listo. {len(warnings)} aviso(s) opcional(es).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
