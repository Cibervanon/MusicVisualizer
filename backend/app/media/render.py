"""Renderizador FFmpeg: un único comando por clip.

Entradas:
  - el máster normalizado, una vez por segmento con doble búsqueda rápida;
  - el WAV del fragmento.
Filtros:
  - trim/setpts/fps/scale por segmento;
  - concat (corte) o xfade (crossfade) o flash blanco;
  - grade, nitidez, viñeta, grano, glow y RGB split;
  - subtítulos ASS quemados;
  - audio recortado, con volumen y loudnorm.
Progreso:
  - `-progress pipe:1` parseado en core.ffmpeg; nunca simulado.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from ..core.errors import ProcessingError
from ..core.ffmpeg import (
    ass_filter,
    filter_graph_input,
    probe,
    run_ffmpeg,
    run_ffmpeg_sync,
)
from ..core.paths import project_layout
from ..core.util import clamp
from ..lyrics.service import resolve_ass_for_edit
from ..quality.validator import validate_render

ProgressCallback = Callable[[float], Awaitable[None] | None]

QUALITY_PRESETS = {
    "fast": {"preset": "veryfast", "crf": 22, "audio": "160k"},
    "balanced": {"preset": "veryfast", "crf": 20, "audio": "192k"},
    "high": {"preset": "medium", "crf": 18, "audio": "224k"},
}


def _even(value: float) -> int:
    return max(2, round(value / 2) * 2)


def _preview_dims(width: int, height: int) -> tuple[int, int]:
    scale = 0.5
    return _even(width * scale), _even(height * scale)


def _effect_filters(edl: dict[str, Any]) -> list[str]:
    effects = edl.get("effects") or {}
    grade = edl.get("grade") or {}
    allowed = set(edl.get("allowed_effects") or [])
    filters: list[str] = []
    contrast = clamp(float(grade.get("contrast", 1.0)), 0.5, 1.6)
    saturation = clamp(float(grade.get("saturation", 1.0)), 0.0, 2.0)
    brightness = clamp(float(grade.get("brightness", 0.0)), -0.4, 0.4)
    if allowed and "grade" in allowed:
        filters.append(f"eq=contrast={contrast:.3f}:saturation={saturation:.3f}:brightness={brightness:.3f}")

    sharpen = clamp(float(effects.get("sharpen", 0.0)), 0.0, 1.0)
    if sharpen > 0.03 and (not allowed or "sharpen" in allowed):
        filters.append(f"unsharp=5:5:{sharpen * 1.2:.2f}:5:5:0")

    vignette = clamp(float(effects.get("vignette", 0.0)), 0.0, 1.0)
    if vignette > 0.03 and (not allowed or "vignette" in allowed):
        angle = max(3.2, 7.0 - vignette * 3.5)
        filters.append(f"vignette=angle=PI/{angle:.2f}")

    grain = clamp(float(effects.get("grain", 0.0)), 0.0, 1.0)
    if grain > 0.03 and (not allowed or "grain" in allowed):
        strength = int(clamp(grain * 28, 1, 28))
        filters.append(f"noise=alls={strength}:allf=t+u")

    glow = clamp(float(effects.get("glow", 0.0)), 0.0, 1.0)
    if glow > 0.03 and (not allowed or "glow" in allowed):
        filters.append(f"__GLOW__{glow:.3f}")

    rgb = clamp(float(effects.get("rgb_split", 0.0)), 0.0, 1.0)
    if rgb > 0.02 and (not allowed or "rgb_split" in allowed):
        shift = int(clamp(round(rgb * 14), 1, 14))
        filters.append(f"rgbashift=rh={shift}:bh=-{shift}")
    return filters


def _build_graph(
    edl: dict[str, Any],
    *,
    out_width: int,
    out_height: int,
    fps: int,
    audio_index: int,
    ass_path: Path | None,
) -> str:
    segments = edl.get("segments") or []
    if not segments:
        raise ProcessingError("El EDL no tiene segmentos para renderizar.")
    transition = (edl.get("transition") or {}).get("type") or "cut"
    transition_duration = float((edl.get("transition") or {}).get("duration") or 0.0)
    duration = float(edl.get("duration") or 30.0)

    parts: list[str] = []
    for index, segment in enumerate(segments):
        shot = float(segment.get("duration") or 0.0)
        source_duration = float(segment.get("source_duration") or shot)
        # En un corte, el input debe durar exactamente el plano. `source_duration`
        # puede ser mayor (margen de crossfade o una edición manual): si se dejaba
        # entero, concat alargaba el montaje y el audio/vídeo se desincronizaban.
        trim_duration = max(shot, source_duration) if transition == "crossfade" and index > 0 else max(0.04, shot)
        filters = [
            f"trim=start=0:end={trim_duration:.4f}",
            "setpts=PTS-STARTPTS",
            f"fps={fps}",
            f"scale={out_width}:{out_height}:flags=lanczos",
            "setsar=1",
            "settb=AVTB",
        ]
        if transition == "flash" and transition_duration > 0:
            fade = min(transition_duration, max(0.02, shot / 4))
            if index > 0:
                filters.append(f"fade=t=in:st=0:d={fade:.3f}:color=white")
            if index < len(segments) - 1:
                filters.append(f"fade=t=out:st={max(0.0, shot - fade):.3f}:d={fade:.3f}:color=white")
        parts.append(f"[{index}:v]" + ",".join(filters) + f"[v{index}]")

    if len(segments) == 1:
        parts.append("[v0]null[base]")
    elif transition == "crossfade" and transition_duration > 0:
        current = "v0"
        elapsed = float(segments[0].get("duration") or 0.0)
        for index in range(1, len(segments)):
            offset = max(0.0, elapsed - transition_duration)
            label = f"x{index}"
            parts.append(
                f"[{current}][v{index}]xfade=transition=fade:duration={transition_duration:.3f}:"
                f"offset={offset:.4f}[{label}]"
            )
            current = label
            elapsed += float(segments[index].get("duration") or 0.0)
        parts.append(f"[{current}]null[base]")
    else:
        chain = "".join(f"[v{i}]" for i in range(len(segments)))
        parts.append(f"{chain}concat=n={len(segments)}:v=1:a=0[vcat]")
        parts.append("[vcat]null[base]")

    # Duración exacta: clona el último fotograma si faltara y recorta el exceso.
    parts.append(
        f"[base]tpad=stop_mode=clone:stop_duration=1,trim=duration={duration:.4f},"
        "setpts=PTS-STARTPTS[base2]"
    )

    current = "base2"
    filters = _effect_filters(edl)
    for step, item in enumerate(filters):
        label = f"e{step}"
        if item.startswith("__GLOW__"):
            strength = float(item.replace("__GLOW__", ""))
            sigma = 8.0 + strength * 22.0
            opacity = clamp(strength * 0.4, 0.04, 0.4)
            parts.append(f"[{current}]split[glow_a][glow_b]")
            parts.append(f"[glow_b]gblur=sigma={sigma:.2f}[glow_blur]")
            parts.append(
                f"[glow_a][glow_blur]blend=all_mode=screen:all_opacity={opacity:.3f}[{label}]"
            )
        else:
            parts.append(f"[{current}]{item}[{label}]")
        current = label

    if ass_path is not None:
        parts.append(f"[{current}]{ass_filter(ass_path)}[vout]")
    else:
        parts.append(f"[{current}]format=yuv420p[vout]")

    volume = clamp(float(edl.get("volume", 1.0)), 0.0, 2.0)
    audio_filters = [
        f"atrim=0:{duration:.4f}",
        "asetpts=PTS-STARTPTS",
    ]
    if abs(volume - 1.0) > 0.01:
        audio_filters.append(f"volume={volume:.3f}")
    audio_filters.append("loudnorm=I=-14:TP=-1.5:LRA=11")
    parts.append(f"[{audio_index}:a]" + ",".join(audio_filters) + "[aout]")
    return ";\n".join(parts)


async def _make_thumb(video: Path, thumb: Path, duration: float) -> None:
    thumb.parent.mkdir(parents=True, exist_ok=True)
    at = min(max(0.4, duration * 0.35), max(0.4, duration - 0.2))
    with contextlib.suppress(Exception):
        await asyncio.to_thread(
            run_ffmpeg_sync,
            [
                "-ss",
                f"{at:.3f}",
                "-i",
                str(video),
                "-frames:v",
                "1",
                "-vf",
                "scale=720:-2",
                "-q:v",
                "3",
                str(thumb),
            ],
        )


def render_identity(project_id: str, edit_id: str, preview: bool) -> tuple[str, str]:
    """ID y nombre de archivo "amigable" (para descargas) de un render.

    Antes el id era `r_<edit_id>` y dos proyectos con el mismo `edit_01_*`
    colisionaban: `find_render` podía servir/borrar el clip de otro proyecto.

    El nombre de descarga se mantiene legible, pero **en disco** se usa el id
    (`<render_id>.mp4`): así un render heredado y uno nuevo con el mismo
    `edit_id` no comparten archivo y borrar uno no deja colgando al otro.
    """
    suffix = "_preview" if preview else ""
    return f"r_{project_id}_{edit_id}{suffix}", f"{edit_id}{suffix}.mp4"


async def render_edit(
    project: dict[str, Any],
    edl: dict[str, Any],
    *,
    preview: bool = False,
    quality: str = "balanced",
    encoder: str = "cpu",
    cancel_event: asyncio.Event | None = None,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    layout = project_layout(project["id"])
    master = layout["root"] / str(edl.get("master") or "")
    audio = layout["root"] / str(edl.get("audio") or "")
    if not master.exists():
        raise ProcessingError("No se encuentra el máster de vídeo. Vuelve a analizar el vídeo.")
    if not audio.exists():
        raise ProcessingError("No se encuentra el audio del fragmento. Vuelve a analizar el audio.")

    width = int(edl.get("width") or 1080)
    height = int(edl.get("height") or 1920)
    fps = int(edl.get("fps") or 30)
    out_width, out_height = _preview_dims(width, height) if preview else (width, height)

    render_id, filename = render_identity(project["id"], edl["id"], preview)
    # El archivo en disco lleva el id único, no el nombre amigable. Dos renders
    # del mismo clip (heredado y nuevo) deben poder convivir y borrarse por
    # separado sin dejar registros apuntando a un archivo inexistente.
    output = layout["renders"] / f"{render_id}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    thumb = layout["thumbs"] / f"{render_id}.jpg"

    ass_path: Path | None = None
    try:
        ass_edl = {**edl, "width": out_width, "height": out_height}
        ass_path = resolve_ass_for_edit(project, ass_edl, layout["lyrics"] / f"{render_id}.ass")
    except Exception:
        ass_path = None

    segments = edl.get("segments") or []
    if not segments:
        raise ProcessingError("El EDL no tiene segmentos.")

    inputs: list[str] = []
    for segment in segments:
        source_start = float(segment.get("source_start") or 0.0)
        source_duration = float(segment.get("source_duration") or segment.get("duration") or 0.0)
        inputs.extend(
            [
                "-ss",
                f"{source_start:.4f}",
                "-t",
                f"{max(0.2, source_duration + 0.25):.4f}",
                "-i",
                str(master),
            ]
        )
    audio_index = len(segments)
    inputs.extend(["-i", str(audio)])

    graph = _build_graph(
        edl,
        out_width=out_width,
        out_height=out_height,
        fps=fps,
        audio_index=audio_index,
        ass_path=ass_path,
    )
    filter_path = layout["tmp"] / f"{render_id}_filter.txt"
    filter_path.parent.mkdir(parents=True, exist_ok=True)
    filter_path.write_text(graph, encoding="utf-8")

    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["balanced"])
    if preview:
        preset = {"preset": "ultrafast", "crf": 28, "audio": "128k"}

    encode: list[str] = []
    if encoder == "qsv":
        encode = ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23"]
    else:
        encode = [
            "-c:v",
            "libx264",
            "-preset",
            preset["preset"],
            "-crf",
            str(preset["crf"]),
            "-profile:v",
            "high",
        ]

    args = [
        *inputs,
        *filter_graph_input(filter_path),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        *encode,
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(fps),
        "-c:a",
        "aac",
        "-b:a",
        preset["audio"],
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "-shortest",
        str(output),
    ]

    async def progress(value: float, _meta: dict[str, Any]) -> None:
        if on_progress is not None:
            result = on_progress(value)
            if asyncio.iscoroutine(result):
                await result

    started = time.time()
    note = None
    try:
        await run_ffmpeg(
            args,
            duration=float(edl.get("duration") or 0),
            on_progress=progress,
            cancel_event=cancel_event,
            timeout=None,
        )
    except ProcessingError:
        if encoder == "qsv":
            # Reintento honesto en CPU si el encoder por hardware no está disponible.
            note = "El encoder QSV falló; se re-renderizó en CPU."
            cpu_args = [
                *inputs,
                *filter_graph_input(filter_path),
                "-map",
                "[vout]",
                "-map",
                "[aout]",
                "-c:v",
                "libx264",
                "-preset",
                preset["preset"],
                "-crf",
                str(preset["crf"]),
                "-profile:v",
                "high",
                "-pix_fmt",
                "yuv420p",
                "-r",
                str(fps),
                "-c:a",
                "aac",
                "-b:a",
                preset["audio"],
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                "-shortest",
                str(output),
            ]
            await run_ffmpeg(
                cpu_args,
                duration=float(edl.get("duration") or 0),
                on_progress=progress,
                cancel_event=cancel_event,
                timeout=None,
            )
        else:
            raise
    finally:
        filter_path.unlink(missing_ok=True)

    info = probe(output)
    validation = await asyncio.to_thread(
        validate_render,
        output,
        expected_duration=float(edl.get("duration") or 0),
        width=out_width,
        height=out_height,
        fps=fps,
    )
    await _make_thumb(output, thumb, info.duration)

    return {
        "id": render_id,
        "edit_id": edl["id"],
        "project_id": project["id"],
        "type": "preview" if preview else "final",
        "filename": filename,
        "path": str(output.relative_to(layout["root"])).replace("\\", "/"),
        "thumb": str(thumb.relative_to(layout["root"])).replace("\\", "/") if thumb.exists() else None,
        "status": "ready",
        "duration": round(info.duration, 3),
        "width": info.width,
        "height": info.height,
        "fps": fps,
        "size": info.size,
        "quality": quality,
        "encoder": encoder if note is None else "cpu",
        "note": note,
        "validation": validation,
        "elapsed": round(time.time() - started, 2),
        "created_at": time.time(),
        "style": edl.get("style"),
        "style_name": edl.get("style_name"),
    }
