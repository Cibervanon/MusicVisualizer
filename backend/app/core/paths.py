"""Rutas del proyecto.

Todo el almacenamiento es sistema de archivos local: no hay base de datos,
no hay servicios remotos. Un proyecto = una carpeta dentro de `projects/`.
"""

from __future__ import annotations

from pathlib import Path

# backend/app/core/paths.py -> backend/app/core -> backend/app -> backend -> raíz
ROOT_DIR = Path(__file__).resolve().parents[3]

BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
DOCS_DIR = ROOT_DIR / "docs"
SCRIPTS_DIR = ROOT_DIR / "scripts"
ASSETS_DIR = ROOT_DIR / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"

PROJECTS_DIR = ROOT_DIR / "projects"
LOGS_DIR = ROOT_DIR / "logs"
# Temporales de trabajo: masters desechables, proxies, segmentos intermedios.
# Se limpia automáticamente al terminar cada trabajo (disco pequeño: ver docs).
WORK_DIR = ROOT_DIR / "temp" / "work"

FRONTEND_DIST = FRONTEND_DIR / "dist"


def ensure_dirs() -> None:
    """Crea las carpetas de trabajo si no existen. Idempotente."""
    for folder in (PROJECTS_DIR, LOGS_DIR, WORK_DIR, PROJECTS_DIR / "_tmp"):
        folder.mkdir(parents=True, exist_ok=True)


def project_dir(project_id: str) -> Path:
    """Devuelve la carpeta de un proyecto validando el identificador.

    Evita cualquier intento de salir del directorio de proyectos.
    """
    if not project_id or not project_id.isalnum() and not all(
        c.isalnum() or c in "-_" for c in project_id
    ):
        raise ValueError(f"project_id inválido: {project_id!r}")
    path = (PROJECTS_DIR / project_id).resolve()
    if PROJECTS_DIR.resolve() not in path.parents:
        raise ValueError(f"project_id fuera de projects/: {project_id!r}")
    return path


def safe_join(base: Path, *parts: str) -> Path:
    """Une rutas garantizando que el resultado no sale de `base`."""
    candidate = base.joinpath(*parts).resolve()
    base_resolved = base.resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        raise ValueError(f"ruta fuera de {base_resolved}: {candidate}")
    return candidate


def project_layout(project_id: str) -> dict[str, Path]:
    """Subcarpetas estándar de un proyecto."""
    base = project_dir(project_id)
    return {
        "root": base,
        "source": base / "source",        # audio y vídeo subidos (originales intactos)
        "analysis": base / "analysis",    # audio_analysis.json, video_analysis.json, scene_library.json
        "master": base / "master",        # vídeo normalizado reutilizado por todas las versiones
        "edits": base / "edits",          # un edl.json por versión
        "lyrics": base / "lyrics",        # lyrics.json + lyrics.ass
        "renders": base / "renders",      # MP4 finales
        "thumbs": base / "thumbs",        # miniaturas reales generadas con FFmpeg
        "tmp": base / "tmp",              # temporales desechables del proyecto
    }
