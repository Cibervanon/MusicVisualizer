"""Análisis musical real con librosa.

Todo lo que devuelve este módulo se calcula a partir del audio del fragmento.
No hay eventos inventados: si una detección falla, se marca `fallback` y se
devuelve una rejilla honesta con confianza baja.
"""

from __future__ import annotations

import asyncio
import math
from pathlib import Path
from typing import Any

import numpy as np

from ..core.ffmpeg import run_ffmpeg
from ..core.paths import project_layout
from ..core.util import clamp, read_json, sha1_of, write_json

ANALYSIS_VERSION = "audio-v3"
HOP = 512
SR = 22050
BANDS = {
    "kick": (40.0, 120.0),
    "bass": (60.0, 250.0),
    "snare": (200.0, 4000.0),
    "hat": (6000.0, 11000.0),
}


def _norm(values: np.ndarray, percentile: float = 95.0) -> np.ndarray:
    arr = np.nan_to_num(np.asarray(values, dtype=np.float64))
    if arr.size == 0:
        return arr
    scale = float(np.percentile(arr, percentile))
    if not math.isfinite(scale) or scale <= 1e-9:
        scale = float(arr.max()) or 1.0
    return np.clip(arr / scale, 0.0, 1.0)


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        arr = np.atleast_1d(np.asarray(value, dtype=np.float64))
        result = float(arr.reshape(-1)[0])
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


async def extract_fragment(
    project_id: str,
    source_path: str | Path,
    start: float,
    end: float,
    *,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    """Extrae el fragmento exacto a WAV estéreo (mux) y mono (análisis)."""
    from ..core.util import file_fingerprint

    duration = round(float(end) - float(start), 3)
    if duration <= 0.05:
        raise ValueError("El fragmento debe durar más de 0,05 s.")

    layout = project_layout(project_id)
    audio_dir = layout["analysis"] / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    stereo = audio_dir / "fragment.wav"
    mono = audio_dir / "fragment_mono.wav"
    meta_path = audio_dir / "fragment.json"

    key = sha1_of(
        {
            "source": file_fingerprint(source_path),
            "start": round(start, 3),
            "end": round(end, 3),
            "version": ANALYSIS_VERSION,
        }
    )
    cached = read_json(meta_path)
    if (
        isinstance(cached, dict)
        and cached.get("key") == key
        and stereo.exists()
        and mono.exists()
    ):
        return cached

    await run_ffmpeg(
        [
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(stereo),
        ],
        duration=duration,
        cancel_event=cancel_event,
        timeout=300,
    )
    await run_ffmpeg(
        [
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(SR),
            "-c:a",
            "pcm_s16le",
            str(mono),
        ],
        duration=duration,
        cancel_event=cancel_event,
        timeout=300,
    )

    meta = {
        "key": key,
        "source": str(source_path),
        "start": round(float(start), 3),
        "end": round(float(end), 3),
        "duration": duration,
        "stereo": str(stereo.relative_to(layout["root"])).replace("\\", "/"),
        "mono": str(mono.relative_to(layout["root"])).replace("\\", "/"),
        "sample_rate": 48000,
        "analysis_sample_rate": SR,
    }
    write_json(meta_path, meta)
    return meta


def _section_labels(intensities: list[float], flux: list[float]) -> list[str]:
    count = len(intensities)
    if count == 0:
        return []
    labels: list[str] = []
    peak = max(intensities) if intensities else 0.0
    for index, intensity in enumerate(intensities):
        if count >= 3 and index == 0:
            labels.append("intro")
            continue
        if count >= 3 and index == count - 1:
            labels.append("outro" if intensity < peak * 0.92 else "chorus")
            continue
        previous = intensities[index - 1] if index > 0 else intensity
        rising = intensity - previous
        if intensity >= peak * 0.86 and (flux[index] >= 0.45 or rising > 0.08):
            labels.append("drop")
        elif rising > 0.12:
            labels.append("build")
        elif intensity <= peak * 0.42:
            labels.append("breakdown" if index > 0 else "intro")
        elif index % 2 == 0:
            labels.append("chorus")
        else:
            labels.append("verse")
    return labels


def analyze_audio_file(mono_path: str | Path, expected_duration: float | None = None) -> dict[str, Any]:
    """Analiza el WAV mono y devuelve el contrato audio_analysis."""
    import librosa

    y, sr = librosa.load(str(mono_path), sr=SR, mono=True)
    y = np.nan_to_num(np.asarray(y, dtype=np.float32))
    if y.size == 0:
        raise ValueError("El fragmento de audio está vacío.")

    duration = float(len(y) / sr)
    if expected_duration and abs(duration - expected_duration) > 0.35:
        duration = min(duration, float(expected_duration))
    duration = max(0.1, duration)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    onset_env = np.nan_to_num(np.asarray(onset_env, dtype=np.float64))

    try:
        tempo_raw, beat_times = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=sr,
            hop_length=HOP,
            units="time",
            trim=False,
        )
        bpm = _as_float(tempo_raw, 0.0)
        beats = np.asarray(beat_times, dtype=np.float64).reshape(-1)
    except Exception:
        bpm, beats = 0.0, np.array([], dtype=np.float64)

    engine = "librosa.beat_track"
    fallback = False
    if beats.size < 2:
        fallback = True
        try:
            onsets = librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=sr, hop_length=HOP, units="time", backtrack=True
            )
            beats = np.asarray(onsets, dtype=np.float64).reshape(-1)
        except Exception:
            beats = np.array([], dtype=np.float64)
    if beats.size < 2:
        # Rejilla honesta de respaldo, marcada como tal (no se presenta como detección).
        step = 60.0 / (bpm if bpm > 30 else 120.0)
        beats = np.arange(0.0, duration, step)
        fallback = True
        engine = "fallback_grid"

    beats = beats[(beats >= -0.05) & (beats <= duration + 0.05)]
    beats = np.clip(beats, 0.0, duration)

    # Intervalos entre beats → confianza del tempo.
    if beats.size >= 3:
        intervals = np.diff(beats)
        med = float(np.median(intervals))
        mad = float(np.median(np.abs(intervals - med)))
        confidence = clamp(1.0 - (mad / med if med > 0 else 1.0), 0.0, 1.0)
        if bpm <= 0 and med > 0:
            bpm = 60.0 / med
    else:
        confidence = 0.0
    if bpm > 220:
        bpm /= 2
    elif 0 < bpm < 50:
        bpm *= 2
    bpm = round(clamp(bpm if bpm > 0 else 120.0, 40.0, 240.0), 2)

    # Envolventes.
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    rms = np.nan_to_num(np.asarray(rms, dtype=np.float64))
    rms_norm = _norm(rms, 98.0)

    stft = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    band_arrays: dict[str, np.ndarray] = {}
    for name, (low, high) in BANDS.items():
        mask = (freqs >= low) & (freqs < high)
        if not np.any(mask):
            band_arrays[name] = np.zeros(stft.shape[1])
            continue
        band_arrays[name] = _norm(stft[mask].mean(axis=0), 98.0)

    if stft.shape[1] > 1:
        flux = np.sqrt(np.sum(np.diff(stft, axis=1) ** 2, axis=0))
        flux = np.concatenate([[0.0], flux])
    else:
        flux = np.zeros(stft.shape[1])
    flux_norm = _norm(flux, 98.0)

    times = librosa.times_like(rms_norm, sr=sr, hop_length=HOP)
    n_frames = min(len(times), len(rms_norm), len(flux_norm), *(len(v) for v in band_arrays.values()))

    # Fuerza y bandas por beat.
    beat_frames = np.clip(
        librosa.time_to_frames(beats, sr=sr, hop_length=HOP),
        0,
        max(0, len(onset_env) - 1),
    )
    windows: list[tuple[int, int]] = []
    raw_strengths: list[float] = []
    for frame in beat_frames:
        lo = max(0, int(frame) - 2)
        hi = min(len(onset_env), int(frame) + 3)
        windows.append((lo, hi))
        raw_strengths.append(
            float(np.max(onset_env[lo:hi])) if hi > lo else float(onset_env[int(frame)])
        )
    # Normalizar el vector completo UNA vez. Normalizar cada escalar por separado
    # devolvía siempre 1.0 y aplastaba la jerarquía de acentos (downbeats falsos).
    strengths = (
        _norm(np.asarray(raw_strengths, dtype=np.float64), 99.0)
        if raw_strengths
        else np.asarray([], dtype=np.float64)
    )

    beat_objects: list[dict[str, Any]] = []
    for index, (beat_time, (lo, hi), strength) in enumerate(
        zip(beats, windows, strengths)
    ):
        band_values = {
            name: round(float(np.mean(values[lo:hi])) if hi > lo else float(values[int(lo)]), 4)
            for name, values in band_arrays.items()
        }
        beat_objects.append(
            {
                "t": round(float(beat_time), 4),
                "index": index,
                "is_downbeat": False,
                "strength": round(float(clamp(strength, 0.0, 1.0)), 4),
                "bands": band_values,
            }
        )

    # Downbeats: fase de compás 4/4 que maximiza la suma de acentos.
    # La confianza se deriva de cuánto separa la mejor fase de la segunda; con
    # pocos beats o fases empatadas se marca como incierta.
    downbeat_confidence = 0.0
    if beat_objects:
        phase_scores = [
            sum(b["strength"] for b in beat_objects[offset::4]) for offset in range(4)
        ]
        best_offset = max(range(4), key=lambda offset: phase_scores[offset])
        best_score = phase_scores[best_offset]
        ordered = sorted(phase_scores, reverse=True)
        second = ordered[1] if len(ordered) > 1 else 0.0
        separation = (best_score - second) / best_score if best_score > 0 else 0.0
        support = min(1.0, len(beat_objects) / 8.0)
        downbeat_confidence = round(clamp(separation * support, 0.0, 1.0), 3)
        for beat in beat_objects[best_offset::4]:
            beat["is_downbeat"] = True
        if best_offset >= len(beat_objects):
            beat_objects[0]["is_downbeat"] = True

    # Secciones por similitud espectral.
    try:
        mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=HOP, n_mels=96)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        segment_count = int(clamp(round(duration / 9.0), 2, 9))
        boundaries = librosa.segment.agglomerative(mel_db, segment_count)
        boundaries = sorted({int(b) for b in np.atleast_1d(boundaries)})
    except Exception:
        segment_count = int(clamp(round(duration / 9.0), 2, 9))
        boundaries = [int(i * (n_frames - 1) / segment_count) for i in range(segment_count)]

    if not boundaries:
        boundaries = [0]
    if boundaries[0] != 0:
        boundaries.insert(0, 0)
    if boundaries[-1] < n_frames - 1:
        boundaries.append(n_frames - 1)

    raw_sections: list[dict[str, Any]] = []
    for start_frame, end_frame in zip(boundaries[:-1], boundaries[1:]):
        if end_frame <= start_frame:
            continue
        start_t = float(times[min(start_frame, len(times) - 1)])
        end_t = float(times[min(end_frame, len(times) - 1)])
        if end_t - start_t < 0.35:
            continue
        raw_sections.append(
            {
                "start": round(start_t, 3),
                "end": round(end_t, 3),
                "intensity": round(float(np.mean(rms_norm[start_frame:end_frame])), 4),
                "flux": round(float(np.mean(flux_norm[start_frame:end_frame])), 4),
                "kick": round(float(np.mean(band_arrays["kick"][start_frame:end_frame])), 4),
            }
        )
    if not raw_sections:
        raw_sections = [{"start": 0.0, "end": round(duration, 3), "intensity": 0.5, "flux": 0.5, "kick": 0.5}]
    raw_sections[0]["start"] = 0.0
    raw_sections[-1]["end"] = round(duration, 3)
    labels = _section_labels(
        [s["intensity"] for s in raw_sections], [s["flux"] for s in raw_sections]
    )
    sections = [
        {
            "start": s["start"],
            "end": s["end"],
            "label": labels[i] if i < len(labels) else "verse",
            "intensity": s["intensity"],
            "confidence": round(clamp(0.55 + s["flux"] * 0.35, 0.0, 0.95), 3),
        }
        for i, s in enumerate(raw_sections)
    ]

    # Eventos musicales anclados a hechos medidos.
    events: list[dict[str, Any]] = []
    for index, section in enumerate(sections):
        if index > 0:
            previous = sections[index - 1]
            delta = section["intensity"] - previous["intensity"]
            if delta > 0.10:
                events.append(
                    {
                        "t": section["start"],
                        "type": "drop" if section["label"] in {"drop", "chorus"} and section["intensity"] > 0.6 else "energy_up",
                        "strength": round(clamp(delta + 0.4, 0.0, 1.0), 3),
                    }
                )
            elif delta < -0.10:
                events.append(
                    {
                        "t": section["start"],
                        "type": "energy_down",
                        "strength": round(clamp(abs(delta) + 0.3, 0.0, 1.0), 3),
                    }
                )
            events.append(
                {
                    "t": section["start"],
                    "type": "section_change",
                    "strength": round(clamp(section["intensity"], 0.0, 1.0), 3),
                    "label": section["label"],
                }
            )

    # Silencios reales (RMS por debajo del 6 % del pico durante > 0,35 s).
    silent_threshold = max(0.015, float(np.percentile(rms_norm, 10)) * 0.6)
    silent = rms_norm < silent_threshold
    run_start: int | None = None
    for i, is_silent in enumerate(silent):
        if is_silent and run_start is None:
            run_start = i
        elif not is_silent and run_start is not None:
            if (i - run_start) * HOP / sr >= 0.35:
                events.append(
                    {
                        "t": round(float(times[run_start]), 3),
                        "type": "silence",
                        "strength": 0.4,
                        "end": round(float(times[min(i, len(times) - 1)]), 3),
                    }
                )
            run_start = None

    strong_threshold = float(np.percentile([b["strength"] for b in beat_objects], 85)) if beat_objects else 1.0
    for beat in beat_objects:
        if beat["strength"] >= strong_threshold and beat["strength"] > 0.5:
            events.append({"t": beat["t"], "type": "strong_beat", "strength": beat["strength"]})
        if beat["bands"].get("kick", 0) > 0.72:
            events.append({"t": beat["t"], "type": "kick", "strength": beat["bands"]["kick"]})

    events.sort(key=lambda e: e["t"])

    # Envolventes serializadas (redondeadas para no inflar el JSON).
    energy = {
        "hop": HOP,
        "sample_rate": sr,
        "times": [round(float(t), 3) for t in times[:n_frames]],
        "rms": [round(float(v), 4) for v in rms_norm[:n_frames]],
        "flux": [round(float(v), 4) for v in flux_norm[:n_frames]],
        "band_kick": [round(float(v), 4) for v in band_arrays["kick"][:n_frames]],
        "band_bass": [round(float(v), 4) for v in band_arrays["bass"][:n_frames]],
        "band_snare": [round(float(v), 4) for v in band_arrays["snare"][:n_frames]],
        "band_hat": [round(float(v), 4) for v in band_arrays["hat"][:n_frames]],
    }

    return {
        "schema_version": 1,
        "duration": round(duration, 4),
        "tempo": {
            "bpm": bpm,
            "confidence": round(confidence, 3),
            "meter": 4,
            "downbeat_confidence": downbeat_confidence,
        },
        "beats": beat_objects,
        "onsets": [
            round(float(v), 4)
            for v in librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=sr, hop_length=HOP, units="time", backtrack=True
            )
        ],
        "energy": energy,
        "sections": sections,
        "events": events,
        "analysis_engine": {
            "beats": engine,
            "sections": "spectral_agglomerative_v1",
            "fallback": fallback,
        },
    }
