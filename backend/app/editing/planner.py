"""Planificador de montaje: convierte beats + escenas en un EDL reproducible.

Cada corte se elige por puntuación multicriterio (beat, escena, movimiento,
calidad, diversidad, energía). El resultado es un JSON que el renderizador puede
ejecutar sin volver a analizar nada.
"""

from __future__ import annotations

import math
import random
from statistics import median
from typing import Any

from ..core.util import clamp
from .styles import Style, get_style


def _beat_interval(audio: dict[str, Any]) -> float:
    beats = [float(b["t"]) for b in audio.get("beats", [])]
    if len(beats) >= 3:
        diffs = [b - a for a, b in zip(beats, beats[1:]) if b - a > 0.05]
        if diffs:
            return clamp(float(median(diffs)), 0.18, 2.0)
    bpm = float((audio.get("tempo") or {}).get("bpm") or 120.0)
    return clamp(60.0 / max(40.0, bpm), 0.18, 2.0)


def _section_at(sections: list[dict[str, Any]], t: float) -> dict[str, Any]:
    for section in sections:
        if float(section["start"]) <= t < float(section["end"]):
            return section
    if sections:
        return sections[-1] if t >= float(sections[-1]["start"]) else sections[0]
    return {"start": 0.0, "end": 0.0, "label": "verse", "intensity": 0.5}


def _nearest_beat(beats: list[dict[str, Any]], t: float) -> tuple[float, dict[str, Any] | None]:
    if not beats:
        return 99.0, None
    best = min(beats, key=lambda b: abs(float(b["t"]) - t))
    return abs(float(best["t"]) - t), best


def _events_near(events: list[dict[str, Any]], t: float, tolerance: float = 0.14) -> list[dict[str, Any]]:
    return [e for e in events if abs(float(e["t"]) - t) <= tolerance]


def _grid(audio: dict[str, Any], duration: float, style: Style) -> list[float]:
    values: set[float] = {0.0, round(duration, 4)}
    beats = sorted(float(b["t"]) for b in audio.get("beats", []))
    for beat in beats:
        if 0 <= beat <= duration:
            values.add(round(beat, 4))
    if style.min_shot <= 0.65 and len(beats) > 1:
        for a, b in zip(beats, beats[1:]):
            mid = (a + b) / 2
            if 0 <= mid <= duration:
                values.add(round(mid, 4))
    for section in audio.get("sections", []):
        values.add(round(clamp(float(section["start"]), 0, duration), 4))
        values.add(round(clamp(float(section["end"]), 0, duration), 4))
    for event in audio.get("events", []):
        if event.get("type") in {"drop", "energy_up", "section_change"}:
            values.add(round(clamp(float(event["t"]), 0, duration), 4))
    return sorted(v for v in values if 0 <= v <= duration)


def _target_motion(style: Style, intensity: float) -> float:
    return clamp(style.motion_target * (0.55 + 0.9 * intensity), 0.0, 1.0)


def _pick_scene(
    scenes: list[dict[str, Any]],
    needed: float,
    section: dict[str, Any],
    style: Style,
    rng: random.Random,
    used_counts: dict[str, int],
    weights: dict[str, float],
) -> dict[str, Any]:
    intensity = float(section.get("intensity") or 0.5)
    target_motion = _target_motion(style, intensity)
    candidates = [s for s in scenes if float(s["duration"]) >= needed - 0.02 and float(s["quality"]) >= 0.05]
    if not candidates:
        candidates = [max(scenes, key=lambda s: float(s["duration"]))]

    scored: list[tuple[float, dict[str, Any], dict[str, float]]] = []
    for scene in candidates:
        motion = float(scene.get("motion") or 0)
        quality = float(scene.get("quality") or 0)
        motion_match = 1.0 - min(1.0, abs(motion - target_motion) / 0.75)
        energy_match = 1.0 - min(1.0, abs(motion - intensity) / 0.85)
        reuse = used_counts.get(str(scene.get("id")), 0)
        diversity = 1.0 / (1.0 + reuse * 1.9)
        scene_change = 1.0 if style.align_scene_start else 0.62
        jitter = rng.random() * 0.14
        total = (
            weights.get("scene", 0.2) * scene_change
            + weights.get("motion", 0.15) * motion_match
            + weights.get("quality", 0.15) * quality
            + weights.get("diversity", 0.1) * diversity
            + weights.get("energy", 0.1) * energy_match
            + jitter
        )
        scored.append(
            (
                total,
                scene,
                {
                    "scene": round(scene_change, 4),
                    "motion": round(motion_match, 4),
                    "quality": round(quality, 4),
                    "diversity": round(diversity, 4),
                    "energy": round(energy_match, 4),
                    "jitter": round(jitter, 4),
                },
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    top = scored[: min(4, len(scored))]
    probabilities = [math.exp(item[0] * 5.0) for item in top]
    total_p = sum(probabilities) or 1.0
    pick = rng.random() * total_p
    cursor = 0.0
    for probability, item in zip(probabilities, top):
        cursor += probability
        if pick <= cursor:
            return item[1]
    return top[0][1]


def _choose_cut(
    t: float,
    duration: float,
    desired: float,
    candidates: list[float],
    audio: dict[str, Any],
    style: Style,
    rng: random.Random,
    beat_interval: float,
) -> tuple[float, str, dict[str, float]]:
    beats = audio.get("beats", [])
    events = audio.get("events", [])
    sections = audio.get("sections", [])
    min_end = t + max(0.20, style.min_shot * 0.8)
    max_end = min(duration, t + style.max_shot)
    valid = [c for c in candidates if min_end - 1e-6 <= c <= max_end + 1e-6]
    if not valid:
        end = clamp(t + desired, t + 0.20, duration)
        return end, "fallback", {"fit": 0.5, "beat": 0.0, "phrase": 0.0}

    scored: list[tuple[float, float, str, dict[str, float]]] = []
    for candidate in valid:
        shot = candidate - t
        fit = 1.0 - min(1.0, abs(shot - desired) / max(0.35, desired))
        distance, beat = _nearest_beat(beats, candidate)
        alignment = 1.0 - min(1.0, distance / max(0.08, beat_interval * 0.55))
        cut_type = "beat"
        if beat is not None and bool(beat.get("is_downbeat")):
            cut_type = "downbeat"
            alignment = min(1.0, alignment + 0.18)
        if beat is not None and int(beat.get("index", 0)) % 16 == 0:
            alignment = min(1.0, alignment + 0.12)
        nearby = _events_near(events, candidate)
        event_bonus = 0.0
        if nearby:
            strongest = max(nearby, key=lambda e: float(e.get("strength") or 0))
            event_bonus = clamp(float(strongest.get("strength") or 0.5), 0.0, 1.0)
            cut_type = str(strongest.get("type") or "event")
        section_bonus = 0.0
        for section in sections:
            if abs(float(section["start"]) - candidate) <= 0.1:
                section_bonus = 0.5
                cut_type = "section"
                break
        phrase = 0.12 if beat is not None and int(beat.get("index", 0)) % 8 == 0 else 0.0
        score = (
            fit * 0.42
            + alignment * 0.34
            + event_bonus * 0.10
            + section_bonus * 0.08
            + phrase * 0.06
            + rng.random() * 0.04
        )
        scored.append(
            (
                score,
                candidate,
                cut_type,
                {
                    "fit": round(fit, 4),
                    "beat": round(alignment, 4),
                    "event": round(event_bonus, 4),
                    "section": round(section_bonus, 4),
                    "phrase": round(phrase, 4),
                },
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    top = scored[:3]
    probabilities = [math.exp(item[0] * 4.5) for item in top]
    total_p = sum(probabilities) or 1.0
    pick = rng.random() * total_p
    cursor = 0.0
    for probability, item in zip(probabilities, top):
        cursor += probability
        if pick <= cursor:
            return item[1], item[2], item[3]
    return top[0][1], top[0][2], top[0][3]


def plan_edit(
    *,
    project_id: str,
    edit_id: str,
    audio: dict[str, Any],
    scene_library: dict[str, Any],
    style_id: str,
    duration: float,
    seed: int,
    format: str,
    width: int,
    height: int,
    fps: int,
    master_rel: str,
    audio_rel: str,
    weights_override: dict[str, float] | None = None,
    effects_override: dict[str, float] | None = None,
    used_counts: dict[str, int] | None = None,
    version_index: int = 0,
    lyrics: dict[str, Any] | None = None,
    volume: float = 1.0,
) -> dict[str, Any]:
    style = get_style(style_id)
    rng = random.Random(seed)
    duration = float(duration)
    scenes = [s for s in scene_library.get("scenes", []) if float(s.get("duration") or 0) >= 0.2]
    if not scenes:
        raise ValueError("El vídeo no tiene planos utilizables.")

    weights = {**style.weights, **(weights_override or {})}
    total_weight = sum(max(0.0, float(v)) for v in weights.values()) or 1.0
    weights = {k: max(0.0, float(v)) / total_weight for k, v in weights.items()}

    beat_interval = _beat_interval(audio)
    candidates = _grid(audio, duration, style)
    used = dict(used_counts or {})
    segments: list[dict[str, Any]] = []
    t = 0.0
    guard = 0
    max_segments = int(clamp(duration / max(0.18, style.min_shot), 2, 260))

    while t < duration - 0.12 and len(segments) < max_segments:
        guard += 1
        if guard > max_segments + 20:
            break
        section = _section_at(audio.get("sections", []), t)
        intensity = clamp(float(section.get("intensity") or 0.5), 0.0, 1.0)
        label = str(section.get("label") or "verse")

        span = (style.beat_min + style.beat_max) / 2
        if label in {"drop", "chorus"}:
            span = style.beat_min + (style.beat_max - style.beat_min) * 0.22
        elif label in {"intro", "breakdown", "outro"}:
            span = style.beat_min + (style.beat_max - style.beat_min) * 0.85
        span *= 1.18 - 0.36 * intensity
        if style.id == "experimental":
            span = rng.choice([style.beat_min, style.beat_max, (style.beat_min + style.beat_max) / 2])
        span = clamp(span, style.beat_min, style.beat_max)
        desired = clamp(span * beat_interval, style.min_shot, style.max_shot)
        desired *= 1.0 + ((version_index % 3) - 1) * 0.045

        end, cut_type, cut_score = _choose_cut(
            t, duration, desired, candidates, audio, style, rng, beat_interval
        )
        if duration - end < 0.18:
            end = duration
        shot = max(0.16, end - t)

        extra = style.transition_duration if (style.transition == "crossfade" and segments) else 0.0
        needed = shot + extra
        scene = _pick_scene(scenes, needed, section, style, rng, used, weights)

        # Si ningún plano cubre el corte, se acorta el plano al material disponible.
        if float(scene["duration"]) < needed - 0.02:
            available = max(0.20, float(scene["duration"]) - extra)
            shot = min(shot, available)
            end = min(duration, t + shot)
            needed = shot + extra

        free = max(0.0, float(scene["duration"]) - needed)
        if style.align_scene_start:
            offset = rng.uniform(0.0, min(0.30, free)) if free > 0 else 0.0
        else:
            offset = free / 2 + (rng.uniform(-0.18, 0.18) * min(1.0, free) if free > 0 else 0.0)
        offset = clamp(offset, 0.0, free)
        source_start = float(scene["start"]) + offset
        source_end = source_start + needed

        reuse = used.get(str(scene["id"]), 0)
        used[str(scene["id"])] = reuse + 1

        segments.append(
            {
                "index": len(segments),
                "timeline_start": round(t, 4),
                "timeline_end": round(end, 4),
                "duration": round(end - t, 4),
                "source_start": round(source_start, 4),
                "source_end": round(source_end, 4),
                "source_duration": round(needed, 4),
                "scene_id": scene.get("id"),
                "scene_start": round(float(scene["start"]), 4),
                "scene_end": round(float(scene["end"]), 4),
                "cut_type": cut_type,
                "transition": "cut" if not segments else style.transition,
                "score": {
                    **cut_score,
                    "scene_quality": round(float(scene.get("quality") or 0), 4),
                    "scene_motion": round(float(scene.get("motion") or 0), 4),
                    "reuse": reuse,
                },
            }
        )
        t = end

    if not segments:
        scene = max(scenes, key=lambda s: float(s.get("quality") or 0))
        segments.append(
            {
                "index": 0,
                "timeline_start": 0.0,
                "timeline_end": round(duration, 4),
                "duration": round(duration, 4),
                "source_start": round(float(scene["start"]), 4),
                "source_end": round(min(float(scene["end"]), float(scene["start"]) + duration), 4),
                "source_duration": round(duration, 4),
                "scene_id": scene.get("id"),
                "scene_start": round(float(scene["start"]), 4),
                "scene_end": round(float(scene["end"]), 4),
                "cut_type": "fallback",
                "transition": "cut",
                "score": {},
            }
        )

    # Cierre exacto de la duración: extiende o recorta el último plano.
    last = segments[-1]
    if abs(float(last["timeline_end"]) - duration) > 0.002:
        last["timeline_end"] = round(duration, 4)
        last["duration"] = round(duration - float(last["timeline_start"]), 4)
        if last["duration"] < 0.16 and len(segments) > 1:
            segments.pop()
            segments[-1]["timeline_end"] = round(duration, 4)
            segments[-1]["duration"] = round(duration - float(segments[-1]["timeline_start"]), 4)
            last = segments[-1]
        extra = style.transition_duration if (style.transition == "crossfade" and len(segments) > 1) else 0.0
        want = float(last["duration"]) + extra
        have = float(last["source_end"]) - float(last["source_start"])
        if want > have:
            shortage = want - have
            new_start = max(float(last["scene_start"]), float(last["source_start"]) - shortage)
            last["source_start"] = round(new_start, 4)
            last["source_end"] = round(min(float(last["scene_end"]), new_start + want), 4)
        else:
            last["source_end"] = round(float(last["source_start"]) + want, 4)
        last["source_duration"] = round(float(last["source_end"]) - float(last["source_start"]), 4)

    for index, segment in enumerate(segments):
        segment["index"] = index
        segment["transition"] = "cut" if index == 0 else style.transition
        segment["timeline_start"] = round(sum(float(s["duration"]) for s in segments[:index]), 4)
        segment["timeline_end"] = round(segment["timeline_start"] + float(segment["duration"]), 4)

    total = sum(float(s["duration"]) for s in segments)
    if abs(total - duration) > 0.01:
        # Reparto del error en el último plano para garantizar audio y vídeo iguales.
        delta = duration - total
        segments[-1]["duration"] = round(float(segments[-1]["duration"]) + delta, 4)
        segments[-1]["timeline_end"] = round(float(segments[-1]["timeline_start"]) + float(segments[-1]["duration"]), 4)

    cuts_per_second = len(segments) / max(0.1, duration)
    effects = {**style.effects, **(effects_override or {})}

    return {
        "schema_version": 1,
        "id": edit_id,
        "project_id": project_id,
        "version_index": version_index,
        "style": style.id,
        "style_name": style.name,
        "seed": seed,
        "duration": round(duration, 4),
        "format": format,
        "width": width,
        "height": height,
        "fps": fps,
        "master": master_rel,
        "audio": audio_rel,
        "volume": volume,
        "segments": segments,
        "transition": {"type": style.transition, "duration": style.transition_duration},
        "grade": dict(style.grade),
        "effects": effects,
        "weights": weights,
        "stats": {
            "segments": len(segments),
            "cuts_per_second": round(cuts_per_second, 3),
            "avg_shot": round(duration / max(1, len(segments)), 3),
            "unique_scenes": len({s["scene_id"] for s in segments}),
            "density_target": [style.density_min, style.density_max],
        },
        "lyrics": lyrics or {},
        "allowed_effects": list(style.allowed_effects),
        "created_at": None,
    }


def validate_edl(edl: dict[str, Any], master_duration: float | None = None) -> list[str]:
    issues: list[str] = []
    segments = edl.get("segments") or []
    if not segments:
        issues.append("El EDL no tiene segmentos.")
        return issues
    total = sum(float(s.get("duration") or 0) for s in segments)
    if abs(total - float(edl.get("duration") or 0)) > 0.05:
        issues.append(f"La suma de segmentos ({total:.2f}s) no coincide con la duración del EDL.")
    for segment in segments:
        if float(segment.get("duration") or 0) <= 0.05:
            issues.append(f"Segmento {segment.get('index')} con duración no válida.")
        if float(segment.get("source_start") or 0) < 0:
            issues.append(f"Segmento {segment.get('index')} empieza antes del vídeo.")
        if master_duration is not None and float(segment.get("source_end") or 0) > master_duration + 0.2:
            issues.append(f"Segmento {segment.get('index')} sale del vídeo fuente.")
    return issues
