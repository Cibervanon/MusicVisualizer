"""Gestión de proyectos en disco.

Un proyecto = `projects/<id>/project.json` + subcarpetas. No hay base de datos.
"""

from __future__ import annotations

import contextlib
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from ..core.errors import NotFoundError, ValidationError
from ..core.paths import ensure_dirs, project_dir, project_layout, safe_join
from ..core.util import read_json, safe_filename, write_json

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")

_lock = threading.RLock()


def new_id(prefix: str = "") -> str:
    value = uuid.uuid4().hex[:14]
    return f"{prefix}{value}" if prefix else value


def create_project(name: str | None = None) -> dict[str, Any]:
    ensure_dirs()
    project_id = new_id()
    base = project_dir(project_id)
    layout = project_layout(project_id)
    for folder in layout.values():
        folder.mkdir(parents=True, exist_ok=True)
    now = time.time()
    project = {
        "id": project_id,
        "name": (name or "Untitled project").strip()[:80] or "Untitled project",
        "created_at": now,
        "updated_at": now,
        "schema_version": 1,
        "audio": None,
        "fragment": None,
        "video": None,
        "youtube": None,
        "config": default_config(),
        "analysis": {"audio": None, "video": None, "audio_key": None, "video_key": None},
        "edits": [],
        "renders": [],
        "lyrics": None,
    }
    write_json(base / "project.json", project)
    return project


def default_config() -> dict[str, Any]:
    return {
        "count": 5,
        "duration": 30.0,
        "format": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "quality": "balanced",
        "encoder": "cpu",
        "seed": 20261107,
        "styles": [],
        "weights": {
            "beat": 0.30,
            "scene": 0.20,
            "motion": 0.15,
            "quality": 0.15,
            "diversity": 0.10,
            "energy": 0.10,
        },
        "effects": {
            "grade": 0.5,
            "grain": 0.0,
            "vignette": 0.0,
            "glow": 0.0,
            "rgb_split": 0.0,
        },
    }


def load_project(project_id: str) -> dict[str, Any]:
    base = project_dir(project_id)
    data = read_json(base / "project.json")
    if not isinstance(data, dict):
        raise NotFoundError(f"Proyecto no encontrado: {project_id}")
    return data


def save_project(project: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        project["updated_at"] = time.time()
        write_json(project_dir(project["id"]) / "project.json", project)
    return project


def update_project(project_id: str, **changes: Any) -> dict[str, Any]:
    with _lock:
        project = load_project(project_id)
        project.update(changes)
        return save_project(project)


def mutate_project(project_id: str, mutator: Any) -> dict[str, Any]:
    """Modifica un proyecto de forma atómica con una función."""
    with _lock:
        project = load_project(project_id)
        mutator(project)
        return save_project(project)


def validate_id(value: str, kind: str = "id") -> str:
    """Rechaza identificadores que puedan escapar de su carpeta."""
    if not isinstance(value, str) or not _ID_RE.match(value):
        raise ValidationError(f"{kind} no válido.")
    return value


def edit_path(project_id: str, edit_id: str) -> Path:
    # `edit_id` llega desde la URL: validarlo antes de tocar el sistema de archivos.
    validate_id(edit_id, "edit_id")
    edits_dir = project_layout(project_id)["edits"]
    try:
        path = safe_join(edits_dir, f"{edit_id}.json")
    except ValueError as exc:
        raise ValidationError("edit_id no válido.") from exc
    if not path.exists():
        raise NotFoundError(f"Edición no encontrada: {edit_id}")
    return path


def list_projects() -> list[dict[str, Any]]:
    from ..core.paths import PROJECTS_DIR

    ensure_dirs()
    items: list[dict[str, Any]] = []
    for entry in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        data = read_json(entry / "project.json")
        if isinstance(data, dict):
            items.append(
                {
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "has_audio": bool(data.get("audio")),
                    "has_video": bool(data.get("video")),
                    "renders": len(data.get("renders") or []),
                }
            )
    return items


def layout(project_id: str) -> dict[str, Path]:
    return project_layout(project_id)


def add_render(project_id: str, render: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        project = load_project(project_id)
        existing = project.get("renders", [])

        def superseded(record: dict[str, Any]) -> bool:
            # Mismo id (re-render) o un registro heredado del mismo clip y tipo
            # (p. ej. `r_edit_01_preview` frente a `r_<project>_edit_01_preview`).
            if record.get("id") == render.get("id"):
                return True
            return (
                record.get("edit_id") == render.get("edit_id")
                and record.get("type") == render.get("type")
                and record.get("id") != render.get("id")
            )

        previous = [
            r for r in existing if superseded(r) and r.get("path") != render.get("path")
        ]
        project["renders"] = [r for r in existing if not superseded(r)]
        project["renders"].insert(0, render)
        save_project(project)
        # Al reemplazar un render el archivo anterior quedaría huérfano ocupando
        # disco. Se borra solo si ningún registro restante lo usa todavía.
        if previous:
            root = project_layout(project_id)["root"]
            still_used = {r.get("path") for r in project["renders"]}
            for old in previous:
                old_path = old.get("path")
                if not old_path or old_path in still_used:
                    continue
                with contextlib.suppress(ValueError, OSError):
                    safe_join(root, old_path).unlink(missing_ok=True)
        return render


def add_edit(project_id: str, edit: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        project = load_project(project_id)
        project["edits"] = [e for e in project.get("edits", []) if e.get("id") != edit.get("id")]
        project["edits"].insert(0, edit)
        save_project(project)
        return edit


def find_edit(project: dict[str, Any], edit_id: str) -> dict[str, Any]:
    for edit in project.get("edits", []):
        if edit.get("id") == edit_id:
            return edit
    raise NotFoundError(f"Edición no encontrada: {edit_id}")


def validate_audio_source(project: dict[str, Any]) -> Path:
    audio = project.get("audio") or {}
    path = audio.get("path")
    if not path:
        raise ValidationError("El proyecto no tiene audio subido.")
    resolved = project_dir(project["id"]) / path
    if not resolved.exists():
        raise NotFoundError("El archivo de audio del proyecto ya no existe en disco.")
    return resolved


def validate_video_source(project: dict[str, Any]) -> Path:
    video = project.get("video") or {}
    path = video.get("path")
    if not path:
        raise ValidationError("El proyecto no tiene vídeo de origen.")
    resolved = project_dir(project["id"]) / path
    if not resolved.exists():
        raise NotFoundError("El archivo de vídeo del proyecto ya no existe en disco.")
    return resolved


def source_filename(name: str, default_ext: str = ".bin") -> str:
    safe = safe_filename(name, "source")
    if "." not in safe:
        safe += default_ext
    return safe
