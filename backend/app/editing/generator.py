"""Generación de N versiones distintas y comprobación de diversidad."""

from __future__ import annotations

import time
from collections import Counter
from typing import Any

from ..core.paths import project_layout
from ..core.util import write_json
from ..media.master import target_dims
from .planner import plan_edit, validate_edl
from .styles import get_style, resolve_styles


def _scene_set(edl: dict[str, Any]) -> set[str]:
    return {str(s.get("scene_id")) for s in edl.get("segments", [])}


def _similarity(a: dict[str, Any], b: dict[str, Any]) -> float:
    sa, sb = _scene_set(a), _scene_set(b)
    if not sa and not sb:
        return 1.0
    jaccard = len(sa & sb) / max(1, len(sa | sb))
    avg_a = float(a.get("stats", {}).get("avg_shot") or 1.0)
    avg_b = float(b.get("stats", {}).get("avg_shot") or 1.0)
    duration_delta = min(1.0, abs(avg_a - avg_b) / max(0.5, max(avg_a, avg_b)))
    return jaccard * 0.8 + (1.0 - duration_delta) * 0.2


def generate_versions(
    *,
    project_id: str,
    audio: dict[str, Any],
    scene_library: dict[str, Any],
    master_rel: str,
    audio_rel: str,
    master_duration: float,
    config: dict[str, Any],
    lyrics: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    count = int(config.get("count") or 5)
    duration = float(config.get("duration") or 30.0)
    fmt = str(config.get("format") or "9:16")
    resolution = str(config.get("resolution") or "1080p")
    fps = int(config.get("fps") or 30)
    width, height = target_dims(fmt, resolution)
    styles = resolve_styles(list(config.get("styles") or []))
    base_seed = int(config.get("seed") or 20261107)
    weights = dict(config.get("weights") or {})
    effects = dict(config.get("effects") or {})
    used: Counter[str] = Counter()
    versions: list[dict[str, Any]] = []
    layout = project_layout(project_id)

    for index in range(count):
        style = styles[index % len(styles)]
        style_cycle = index // len(styles)
        seed = base_seed + index * 7919 + style_cycle * 104729
        edit_id = f"edit_{index + 1:02d}_{style.id}"
        best: dict[str, Any] | None = None
        best_score = 2.0
        attempts = 3 if versions else 1
        for attempt in range(attempts):
            candidate = plan_edit(
                project_id=project_id,
                edit_id=edit_id,
                audio=audio,
                scene_library=scene_library,
                style_id=style.id,
                duration=duration,
                seed=seed + attempt * 104729,
                format=fmt,
                width=width,
                height=height,
                fps=fps,
                master_rel=master_rel,
                audio_rel=audio_rel,
                weights_override=weights,
                effects_override=effects,
                used_counts=dict(used),
                version_index=index,
                lyrics=lyrics or {},
            )
            issues = validate_edl(candidate, master_duration)
            if issues:
                continue
            similarity = max((_similarity(candidate, other) for other in versions), default=0.0)
            if similarity < best_score:
                best, best_score = candidate, similarity
            if similarity < 0.82:
                break
        if best is None:
            # Último recurso: el candidato más reciente aunque tenga avisos menores.
            best = candidate
        best["similarity_max"] = round(best_score if best_score < 2.0 else 0.0, 3)
        best["created_at"] = time.time()
        best["edited_at"] = best["created_at"]
        best["duration"] = round(
            sum(float(s["duration"]) for s in best["segments"]), 4
        )
        for segment in best["segments"]:
            used[str(segment.get("scene_id"))] += 1

        write_json(layout["edits"] / f"{edit_id}.json", best)
        versions.append(best)

    return versions


def edit_summary(edl: dict[str, Any], render: dict[str, Any] | None = None) -> dict[str, Any]:
    style = get_style(str(edl.get("style")))
    return {
        "id": edl.get("id"),
        "style": edl.get("style"),
        "style_name": edl.get("style_name") or style.name,
        "accent": style.accent,
        "duration": edl.get("duration"),
        "format": edl.get("format"),
        "fps": edl.get("fps"),
        "width": edl.get("width"),
        "height": edl.get("height"),
        "stats": edl.get("stats"),
        "segments": len(edl.get("segments") or []),
        "created_at": edl.get("created_at"),
        "edited_at": edl.get("edited_at"),
        "render": render,
    }
