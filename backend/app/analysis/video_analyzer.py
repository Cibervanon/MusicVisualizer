"""Análisis visual: escenas + métricas reales por plano.

- Cortes de escena con PySceneDetect (ContentDetector) sobre el máster.
- Muestreo de fotogramas con OpenCV a ~4 fps.
- Métricas: movimiento, brillo, nitidez, colorido, estabilidad y centro de saliencia.
- Si la detección de escenas no produce nada, se dividen bloques de duración fija
  y se marca `fallback: true` (no se inventan cortes).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np

from ..core.ffmpeg import probe, run_ffmpeg_sync
from ..core.util import clamp, read_json, sha1_of, write_json

SCENE_VERSION = "scenes-v2"
SAMPLE_FPS = 4.0
MAX_SAMPLES = 1500


def _timecode_seconds(tc: Any) -> float:
    if hasattr(tc, "get_seconds"):
        return float(tc.get_seconds())
    if isinstance(tc, (int, float)):
        return float(tc)
    return 0.0


def detect_scenes(master_path: str | Path, fps: float, duration: float) -> tuple[list[dict[str, float]], bool]:
    scenes: list[dict[str, float]] = []
    fallback = False
    try:
        from scenedetect import ContentDetector, detect

        detector = ContentDetector(
            threshold=27.0,
            min_scene_len=max(8, int(fps * 0.35)),
            luma_only=False,
        )
        scene_list = detect(str(master_path), detector, start_in_scene=True, show_progress=False)
        for start, end in scene_list:
            start_s = _timecode_seconds(start)
            end_s = _timecode_seconds(end)
            if end_s - start_s >= 0.35:
                scenes.append({"start": start_s, "end": end_s})
    except Exception:
        scenes = []

    if len(scenes) <= 1 and duration > 2.0:
        fallback = True
        chunk = 3.5
        count = max(1, math.ceil(duration / chunk))
        scenes = [
            {"start": i * chunk, "end": min(duration, (i + 1) * chunk)}
            for i in range(count)
            if min(duration, (i + 1) * chunk) - i * chunk >= 0.4
        ]

    if not scenes:
        fallback = True
        scenes = [{"start": 0.0, "end": max(0.5, duration)}]

    # Fusiona escenas muy cortas con la anterior para no generar átomos basura.
    merged: list[dict[str, float]] = []
    for scene in scenes:
        if merged and scene["end"] - scene["start"] < 0.45:
            merged[-1]["end"] = scene["end"]
        else:
            merged.append(dict(scene))
    merged[0]["start"] = 0.0
    merged[-1]["end"] = max(merged[-1]["start"] + 0.2, min(duration, merged[-1]["end"]))
    return merged, fallback


def _colorfulness(frame: np.ndarray) -> float:
    b, g, r = frame[:, :, 0].astype(np.float32), frame[:, :, 1].astype(np.float32), frame[:, :, 2].astype(np.float32)
    rg = r - g
    yb = 0.5 * (r + g) - b
    std_rg, std_yb = float(rg.std()), float(yb.std())
    mean_rg, mean_yb = float(rg.mean()), float(yb.mean())
    value = math.sqrt(std_rg**2 + std_yb**2) + 0.3 * math.sqrt(mean_rg**2 + mean_yb**2)
    return clamp(value / 110.0, 0.0, 1.0)


def _saliency_center(cap: Any, time_s: float, frame_w: int, frame_h: int) -> tuple[float, float]:
    try:
        import cv2

        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, time_s) * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            return 0.5, 0.5
        small = cv2.resize(frame, (320, max(2, int(320 * frame_h / max(1, frame_w)))))
        saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
        ok, sal = saliency.computeSaliency(small)
        if not ok or sal is None:
            return 0.5, 0.5
        sal = cv2.GaussianBlur(sal.astype(np.float32), (0, 0), 5)
        threshold = float(sal.mean() + sal.std())
        mask = (sal >= threshold).astype(np.uint8)
        moments = cv2.moments(mask)
        if moments["m00"] <= 1e-6:
            return 0.5, 0.5
        cx = clamp(moments["m10"] / moments["m00"] / sal.shape[1], 0.0, 1.0)
        cy = clamp(moments["m01"] / moments["m00"] / sal.shape[0], 0.0, 1.0)
        return round(cx, 3), round(cy, 3)
    except Exception:
        return 0.5, 0.5


def analyze_video_file(
    master_path: str | Path,
    fps: float,
    duration: float,
    *,
    thumb_path: str | Path | None = None,
) -> dict[str, Any]:
    import cv2

    master_path = Path(master_path)
    scenes, fallback = detect_scenes(master_path, fps, duration)
    cap = cv2.VideoCapture(str(master_path))
    if not cap.isOpened():
        raise ValueError("OpenCV no pudo abrir el máster de vídeo.")

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    real_fps = float(cap.get(cv2.CAP_PROP_FPS) or fps or 30.0)

    sample_count_target = int(min(MAX_SAMPLES, max(24, duration * SAMPLE_FPS)))
    step = max(1, round(total_frames / sample_count_target)) if total_frames > 0 else 1

    samples: list[dict[str, float]] = []
    previous_small: np.ndarray | None = None
    frame_index = 0
    while True:
        ok, frame = cap.read()
        if not ok or frame is None:
            break
        if frame_index % step != 0:
            frame_index += 1
            continue
        t = frame_index / real_fps if real_fps > 0 else 0.0
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (160, 90), interpolation=cv2.INTER_AREA)
        brightness = float(small.mean()) / 255.0
        sharpness = clamp(float(cv2.Laplacian(gray, cv2.CV_64F).var()) / 900.0, 0.0, 1.0)
        motion = 0.0
        if previous_small is not None:
            diff = float(cv2.absdiff(small, previous_small).mean())
            motion = clamp(diff / 42.0, 0.0, 1.0)
        previous_small = small
        samples.append(
            {
                "t": t,
                "brightness": brightness,
                "sharpness": sharpness,
                "motion": motion,
                "colorfulness": _colorfulness(frame),
            }
        )
        frame_index += 1

    cap.release()
    if not samples:
        raise ValueError("No se pudieron extraer fotogramas del vídeo.")

    by_time = sorted(samples, key=lambda s: s["t"])

    def samples_in(start: float, end: float) -> list[dict[str, float]]:
        inside = [s for s in by_time if start <= s["t"] < end]
        if inside:
            return inside
        nearest = min(by_time, key=lambda s: abs(s["t"] - (start + end) / 2))
        return [nearest]

    scene_objects: list[dict[str, Any]] = []
    cap2 = cv2.VideoCapture(str(master_path))
    for index, scene in enumerate(scenes):
        start = float(scene["start"])
        end = float(min(duration, scene["end"]))
        length = max(0.2, end - start)
        inside = samples_in(start, end)
        brightness = float(np.mean([s["brightness"] for s in inside]))
        sharpness = float(np.mean([s["sharpness"] for s in inside]))
        motion = float(np.mean([s["motion"] for s in inside]))
        colorfulness = float(np.mean([s["colorfulness"] for s in inside]))
        motion_values = [s["motion"] for s in inside]
        stability = clamp(1.0 - float(np.std(motion_values)) * 2.2, 0.0, 1.0)
        center_t = (start + end) / 2
        cx, cy = _saliency_center(cap2, center_t, frame_w, frame_h)

        brightness_score = clamp(1.0 - abs(brightness - 0.5) * 1.7, 0.0, 1.0)
        if brightness < 0.06:
            brightness_score *= 0.25
        quality = clamp(
            brightness_score * 0.35 + sharpness * 0.30 + stability * 0.20 + colorfulness * 0.15,
            0.0,
            1.0,
        )
        tags: list[str] = []
        if motion > 0.55:
            tags.append("fast")
        elif motion > 0.22:
            tags.append("moving")
        else:
            tags.append("static")
        if brightness < 0.10:
            tags.append("dark")
        if quality > 0.68:
            tags.append("high_quality")
        if sharpness > 0.55:
            tags.append("sharp")

        scene_objects.append(
            {
                "id": f"s{index + 1:03d}",
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(length, 3),
                "sample_center": round(center_t, 3),
                "motion": round(motion, 4),
                "brightness": round(brightness, 4),
                "sharpness": round(sharpness, 4),
                "stability": round(stability, 4),
                "colorfulness": round(colorfulness, 4),
                "saliency_center": [cx, cy],
                "tags": tags,
                "quality": round(quality, 4),
            }
        )
    cap2.release()

    if thumb_path is not None:
        try:
            Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)
            at = min(max(0.0, duration * 0.12), max(0.0, duration - 0.2))
            run_ffmpeg_sync(
                [
                    "-ss",
                    f"{at:.3f}",
                    "-i",
                    str(master_path),
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=720:-2",
                    "-q:v",
                    "3",
                    str(thumb_path),
                ],
                timeout=90,
            )
        except Exception:
            pass

    return {
        "schema_version": 1,
        "master": master_path.name,
        "fps": round(real_fps, 3),
        "duration": round(duration, 4),
        "width": frame_w,
        "height": frame_h,
        "scenes": scene_objects,
        "usable_range": [0.0, round(duration, 3)],
        "analysis_engine": {
            "scenes": "pyscenedetect.content_v1" if not fallback else "fallback_fixed_chunks",
            "frames": "opencv_sampled_v1",
            "fallback": fallback,
        },
    }


def analyze_and_cache(
    project_id: str,
    master_meta: dict[str, Any],
    *,
    force: bool = False,
) -> dict[str, Any]:
    from ..core.paths import project_layout

    layout = project_layout(project_id)
    master_abs = Path(master_meta["abs_path"])
    output = layout["analysis"] / "scene_library.json"
    thumb = layout["thumbs"] / "video.jpg"
    info = probe(master_abs)
    key = sha1_of(
        {
            "master": master_meta["key"],
            "duration": round(info.duration, 3),
            "version": SCENE_VERSION,
        }
    )
    cached = read_json(output)
    if not force and isinstance(cached, dict) and cached.get("cache_key") == key:
        return cached

    data = analyze_video_file(master_abs, master_meta["fps"], info.duration, thumb_path=thumb)
    data["cache_key"] = key
    data["master_path"] = str(master_abs.relative_to(layout["root"])).replace("\\", "/")
    data["thumb"] = str(thumb.relative_to(layout["root"])).replace("\\", "/") if thumb.exists() else None
    data["width"] = master_meta["width"]
    data["height"] = master_meta["height"]
    write_json(output, data)
    return data
