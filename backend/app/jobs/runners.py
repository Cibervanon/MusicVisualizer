"""Runners de los trabajos: análisis, generación, render y transcripción."""

from __future__ import annotations

import asyncio
import copy
import json
import time
from pathlib import Path
from typing import Any

from ..analysis.audio_analyzer import ANALYSIS_VERSION, analyze_audio_file, extract_fragment
from ..analysis.video_analyzer import analyze_and_cache
from ..core.config import settings
from ..core.errors import ProcessingError, ValidationError
from ..core.ffmpeg import probe
from ..core.paths import project_layout
from ..core.util import read_json, sha1_of, write_json
from ..editing.generator import edit_summary, generate_versions
from ..lyrics.service import save_lyrics, set_lyrics_payload, transcribe_audio
from ..media.master import ensure_master
from ..media.render import render_edit
from ..project.manager import (
    add_render,
    edit_path,
    load_project,
    mutate_project,
    validate_audio_source,
    validate_video_source,
)
from .manager import jobs


def _rel(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace("\\", "/")


def _deep(value: Any) -> Any:
    return json.loads(json.dumps(value))


async def _ensure_audio(
    job_id: str,
    project: dict[str, Any],
    start: float,
    end: float,
    *,
    force: bool = False,
    progress_base: float = 0.02,
    progress_span: float = 0.10,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    project_id = project["id"]
    layout = project_layout(project_id)
    source = validate_audio_source(project)
    cancel_event = await jobs.event(job_id)

    await jobs.update(
        job_id,
        stage="audio_extract",
        message="Extrayendo el fragmento de audio",
        progress=progress_base,
    )
    fragment = await extract_fragment(
        project_id, source, start, end, cancel_event=cancel_event
    )
    analysis_path = layout["analysis"] / "audio_analysis.json"
    key = sha1_of({"fragment": fragment["key"], "version": ANALYSIS_VERSION})
    existing = read_json(analysis_path)
    if not force and isinstance(existing, dict) and existing.get("cache_key") == key:
        analysis = existing
    else:
        await jobs.update(
            job_id,
            stage="audio_analyze",
            message="Detectando BPM, beats, energía y secciones",
            progress=progress_base + progress_span * 0.45,
        )
        analysis = await asyncio.to_thread(
            analyze_audio_file,
            layout["root"] / fragment["mono"],
            fragment["duration"],
        )
        analysis["cache_key"] = key
        analysis["fragment"] = {
            "source_id": project_id,
            "start": fragment["start"],
            "end": fragment["end"],
            "duration": fragment["duration"],
            "sample_rate": fragment["sample_rate"],
        }
        write_json(analysis_path, analysis)

    relative = _rel(analysis_path, layout["root"])

    def mutate(p: dict[str, Any]) -> None:
        p["fragment"] = {
            "start": fragment["start"],
            "end": fragment["end"],
            "duration": fragment["duration"],
        }
        p["analysis"] = {**(p.get("analysis") or {})}
        p["analysis"]["audio"] = relative
        p["analysis"]["audio_key"] = key
        p["config"] = {**(p.get("config") or {})}
        p["config"]["duration"] = fragment["duration"]

    mutate_project(project_id, mutate)
    await jobs.update(
        job_id,
        progress=progress_base + progress_span,
        stage="audio_ready",
        message=f"Audio analizado: {analysis.get('tempo', {}).get('bpm', 0)} BPM",
    )
    return analysis, fragment, relative


async def _ensure_video(
    job_id: str,
    project: dict[str, Any],
    fmt: str,
    resolution: str,
    fps: int,
    *,
    force: bool = False,
    progress_base: float = 0.12,
    progress_span: float = 0.26,
) -> tuple[dict[str, Any], dict[str, Any]]:
    project_id = project["id"]
    layout = project_layout(project_id)
    source = validate_video_source(project)
    cancel_event = await jobs.event(job_id)

    await jobs.update(
        job_id,
        stage="video_master",
        message="Normalizando el vídeo fuente (una sola vez)",
        progress=progress_base,
    )

    async def master_progress(value: float) -> None:
        await jobs.update(
            job_id,
            progress=progress_base + progress_span * 0.72 * value,
            stage="video_master",
        )

    master = await ensure_master(
        project_id,
        source,
        fmt,
        resolution,
        fps,
        cancel_event=cancel_event,
        on_progress=master_progress,
    )

    await jobs.update(
        job_id,
        stage="video_scenes",
        message="Detectando escenas y midiendo movimiento, luz y nitidez",
        progress=progress_base + progress_span * 0.76,
    )
    scene_library = await asyncio.to_thread(
        analyze_and_cache, project_id, master, force=force
    )

    def mutate(p: dict[str, Any]) -> None:
        p["analysis"] = {**(p.get("analysis") or {})}
        p["analysis"]["video"] = "analysis/scene_library.json"
        p["analysis"]["video_key"] = scene_library.get("cache_key")
        p["video"] = {**(p.get("video") or {})}
        p["video"].update(
            {
                "master": master["path"],
                "width": master["width"],
                "height": master["height"],
                "fps": master["fps"],
                "duration": master["duration"],
                "scenes": len(scene_library.get("scenes") or []),
                "thumb": scene_library.get("thumb"),
            }
        )

    mutate_project(project_id, mutate)
    await jobs.update(
        job_id,
        progress=progress_base + progress_span,
        stage="video_ready",
        message=f"Vídeo analizado: {len(scene_library.get('scenes') or [])} planos",
    )
    return scene_library, master


def _audio_summary(analysis: dict[str, Any], relative: str) -> dict[str, Any]:
    return {
        "path": relative,
        "duration": analysis.get("duration"),
        "bpm": (analysis.get("tempo") or {}).get("bpm"),
        "confidence": (analysis.get("tempo") or {}).get("confidence"),
        "beats": len(analysis.get("beats") or []),
        "sections": analysis.get("sections") or [],
        "events": len(analysis.get("events") or []),
        "engine": analysis.get("analysis_engine"),
    }


def _video_summary(scene_library: dict[str, Any]) -> dict[str, Any]:
    return {
        "scenes": len(scene_library.get("scenes") or []),
        "duration": scene_library.get("duration"),
        "width": scene_library.get("width"),
        "height": scene_library.get("height"),
        "fps": scene_library.get("fps"),
        "thumb": scene_library.get("thumb"),
        "engine": scene_library.get("analysis_engine"),
    }


async def run_audio_analysis(
    job_id: str,
    project_id: str,
    start: float,
    end: float,
    force: bool = False,
) -> None:
    project = load_project(project_id)
    if not project.get("audio"):
        raise ValidationError("Primero sube un archivo de audio.")
    analysis, _fragment, relative = await _ensure_audio(
        job_id, project, start, end, force=force, progress_base=0.05, progress_span=0.9
    )
    await jobs.update(
        job_id,
        status="done",
        progress=1.0,
        stage="done",
        message="Análisis de audio completado",
        result={"audio": _audio_summary(analysis, relative)},
        finished_at=time.time(),
    )


async def run_video_analysis(
    job_id: str,
    project_id: str,
    fmt: str,
    resolution: str,
    fps: int,
    force: bool = False,
) -> None:
    project = load_project(project_id)
    if not project.get("video"):
        raise ValidationError("Primero sube un vídeo o importa uno autorizado.")
    scene_library, master = await _ensure_video(
        job_id,
        project,
        fmt,
        resolution,
        fps,
        force=force,
        progress_base=0.03,
        progress_span=0.95,
    )
    await jobs.update(
        job_id,
        status="done",
        progress=1.0,
        stage="done",
        message="Análisis visual completado",
        result={"video": _video_summary(scene_library), "master": master.get("path")},
        finished_at=time.time(),
    )


async def run_generate(job_id: str, project_id: str, request: dict[str, Any]) -> None:
    project = load_project(project_id)
    if not project.get("audio"):
        raise ValidationError("Primero sube un archivo de audio.")
    if not project.get("video"):
        raise ValidationError("Primero sube un vídeo de origen.")

    fragment = project.get("fragment")
    if not fragment:
        source_info = probe(validate_audio_source(project))
        start = 0.0
        end = min(float(request.get("duration") or 30.0), source_info.duration)
        if end - start < 3:
            raise ValidationError("El audio es demasiado corto para generar un clip.")
    else:
        start = float(fragment["start"])
        end = float(fragment["end"])

    analysis, fragment_meta, _audio_rel = await _ensure_audio(
        job_id, project, start, end, progress_base=0.01, progress_span=0.10
    )
    scene_library, master = await _ensure_video(
        job_id,
        project,
        str(request.get("format") or "9:16"),
        str(request.get("resolution") or "1080p"),
        int(request.get("fps") or 30),
        progress_base=0.11,
        progress_span=0.27,
    )

    # Letras: se guardan antes de planificar para que el ASS use el estilo actual.
    if isinstance(request.get("lyrics"), dict):
        payload = request["lyrics"]
        if payload.get("lines"):
            set_lyrics_payload(project_id, payload)
        else:
            project = load_project(project_id)
            existing = project.get("lyrics") or {}
            if existing:
                save_lyrics(
                    project_id,
                    existing.get("lines") or [],
                    source=existing.get("source") or "manual",
                    style={**(existing.get("style") or {}), **(payload.get("style") or {})},
                    enabled=bool(payload.get("enabled", existing.get("enabled", True))),
                )
    project = load_project(project_id)
    lyrics = project.get("lyrics") or {}
    edl_lyrics = {
        "enabled": bool(lyrics.get("enabled")),
        "style": lyrics.get("style") or {},
    }

    config = {
        **(project.get("config") or {}),
        **{k: v for k, v in request.items() if k != "lyrics"},
    }
    config["duration"] = float(fragment_meta["duration"])
    config["format"] = str(request.get("format") or config.get("format") or "9:16")
    config["resolution"] = str(request.get("resolution") or config.get("resolution") or "1080p")
    config["fps"] = int(request.get("fps") or config.get("fps") or 30)

    await jobs.update(
        job_id,
        stage="planning",
        message="Planificando cortes sincronizados con los beats",
        progress=0.39,
    )
    versions = await asyncio.to_thread(
        generate_versions,
        project_id=project_id,
        audio=analysis,
        scene_library=scene_library,
        master_rel=scene_library.get("master_path") or master["path"],
        audio_rel=fragment_meta["stereo"],
        master_duration=float(scene_library.get("duration") or master["duration"]),
        config=config,
        lyrics=edl_lyrics,
    )
    if not versions:
        raise ProcessingError("No se pudo planificar ningún montaje.")

    def save_config(p: dict[str, Any]) -> None:
        p["config"] = config
        p["edits"] = [edit_summary(edl) for edl in versions]

    mutate_project(project_id, save_config)

    clips = [
        {
            "index": index,
            "edit_id": edl["id"],
            "style": edl.get("style"),
            "style_name": edl.get("style_name"),
            "accent": (edit_summary(edl).get("accent")),
            "status": "queued",
            "progress": 0.0,
            "render_id": None,
            "error": None,
        }
        for index, edl in enumerate(versions)
    ]
    await jobs.update(
        job_id,
        stage="rendering",
        message=f"Renderizando {len(clips)} versiones",
        progress=0.45,
        clips=copy.deepcopy(clips),
        result={"edits": [edit_summary(edl) for edl in versions], "renders": []},
    )

    cancel_event = await jobs.event(job_id)
    semaphore = asyncio.Semaphore(max(1, int(settings.max_parallel_renders)))
    renders: list[dict[str, Any]] = []
    lock = asyncio.Lock()

    async def sync_clips() -> None:
        async with lock:
            snapshot = copy.deepcopy(clips)
        total = sum(float(c.get("progress") or 0) for c in clips) / max(1, len(clips))
        await jobs.update(
            job_id,
            clips=snapshot,
            progress=0.45 + 0.55 * total,
        )

    async def render_one(index: int, edl: dict[str, Any]) -> None:
        async with semaphore:
            if cancel_event.is_set():
                clips[index]["status"] = "cancelled"
                await sync_clips()
                return
            clips[index]["status"] = "rendering"
            await jobs.update(
                job_id,
                message=f"Renderizando {index + 1}/{len(clips)} · {edl.get('style_name')}",
                clips=copy.deepcopy(clips),
            )
            try:
                async def on_progress(value: float) -> None:
                    clips[index]["progress"] = round(value, 4)
                    await sync_clips()

                render = await render_edit(
                    project,
                    edl,
                    preview=False,
                    quality=str(config.get("quality") or "balanced"),
                    encoder=str(config.get("encoder") or "cpu"),
                    cancel_event=cancel_event,
                    on_progress=on_progress,
                )
                clips[index].update(
                    status="ready",
                    progress=1.0,
                    render_id=render["id"],
                    error=None,
                )
                add_render(project_id, render)
                async with lock:
                    renders.append(render)

                def update_summary(p: dict[str, Any]) -> None:
                    p["edits"] = [e for e in p.get("edits", []) if e.get("id") != edl["id"]]
                    p["edits"].insert(0, edit_summary(edl, render))

                mutate_project(project_id, update_summary)
            except ProcessingError as exc:
                if exc.code == "cancelled":
                    clips[index].update(status="cancelled", error="Cancelado")
                else:
                    detail = exc.detail if isinstance(exc.detail, dict) else {}
                    stderr = str(detail.get("stderr") or "").strip()
                    last = stderr.splitlines()[-1] if stderr else ""
                    clips[index].update(
                        status="error",
                        error=exc.message + (f" · {last}" if last else ""),
                        error_detail=detail or None,
                    )
            except Exception as exc:  # pragma: no cover - salvaguarda
                clips[index].update(status="error", error=str(exc))
            finally:
                await sync_clips()

    await asyncio.gather(
        *(render_one(index, edl) for index, edl in enumerate(versions)),
        return_exceptions=True,
    )

    warnings: list[str] = []
    failed = [c for c in clips if c["status"] == "error"]
    cancelled = [c for c in clips if c["status"] == "cancelled"]
    if failed:
        warnings.append(f"{len(failed)} clip(s) fallaron al renderizar.")
    if cancelled:
        warnings.append(f"{len(cancelled)} clip(s) cancelados.")
    if not renders:
        if cancel_event.is_set():
            raise ProcessingError("Generación cancelada.", code="cancelled")
        raise ProcessingError(
            "No se pudo renderizar ningún clip.",
            detail={"clips": clips},
        )

    project = load_project(project_id)
    summaries = [edit_summary(edl) for edl in versions]
    await jobs.update(
        job_id,
        status="done",
        progress=1.0,
        stage="done",
        message=f"{len(renders)} clip(s) listos",
        clips=copy.deepcopy(clips),
        warnings=warnings,
        result={
            "edits": summaries,
            "renders": renders,
            "project": {
                "id": project_id,
                "edits": project.get("edits") or [],
                "renders": project.get("renders") or [],
            },
        },
        finished_at=time.time(),
    )


async def run_render(job_id: str, project_id: str, edit_id: str, request: dict[str, Any]) -> None:
    project = load_project(project_id)
    edl = read_json(edit_path(project_id, edit_id))
    if not isinstance(edl, dict):
        raise ValidationError("El EDL no es válido.")
    cancel_event = await jobs.event(job_id)
    preview = bool(request.get("preview"))
    quality = str(request.get("quality") or (project.get("config") or {}).get("quality") or "balanced")
    encoder = str(request.get("encoder") or (project.get("config") or {}).get("encoder") or "cpu")

    await jobs.update(
        job_id,
        stage="rendering",
        message="Renderizando clip" if not preview else "Renderizando preview",
        progress=0.02,
    )

    async def on_progress(value: float) -> None:
        await jobs.update(job_id, progress=max(0.02, value))

    render = await render_edit(
        project,
        edl,
        preview=preview,
        quality=quality,
        encoder=encoder,
        cancel_event=cancel_event,
        on_progress=on_progress,
    )
    add_render(project_id, render)

    def update_summary(p: dict[str, Any]) -> None:
        p["edits"] = [e for e in p.get("edits", []) if e.get("id") != edit_id]
        p["edits"].insert(0, edit_summary(edl, render))

    mutate_project(project_id, update_summary)
    await jobs.update(
        job_id,
        status="done",
        progress=1.0,
        stage="done",
        message="Render completado",
        result={"render": render},
        finished_at=time.time(),
    )


async def run_transcribe(
    job_id: str,
    project_id: str,
    language: str | None,
    model: str,
) -> None:
    await jobs.update(
        job_id,
        stage="transcribing",
        message="Transcribiendo el fragmento con Whisper (puede tardar)",
        progress=0.1,
    )
    lines = await asyncio.to_thread(transcribe_audio, project_id, language, model)
    payload = save_lyrics(project_id, lines, source="whisper", enabled=True)
    await jobs.update(
        job_id,
        status="done",
        progress=1.0,
        stage="done",
        message=f"{len(lines)} línea(s) transcritas. Revísalas antes de exportar.",
        result={"lyrics": payload},
        finished_at=time.time(),
    )
