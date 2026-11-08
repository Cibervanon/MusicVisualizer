"""Importación y normalización de letras (SRT, LRC y texto plano)."""

from __future__ import annotations

import re
import uuid
from typing import Any

from ..core.util import clamp

_SRT_TIME = re.compile(
    r"(?P<h>\d{1,2}):(?P<m>\d{2}):(?P<s>\d{2})[,.](?P<ms>\d{1,3})\s*-->\s*"
    r"(?P<h2>\d{1,2}):(?P<m2>\d{2}):(?P<s2>\d{2})[,.](?P<ms2>\d{1,3})"
)
_LRC_TIME = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")


def _new_id() -> str:
    return f"l_{uuid.uuid4().hex[:8]}"


def _seconds(h: str, m: str, s: str, frac: str) -> float:
    frac_value = float(f"0.{frac}") if frac else 0.0
    return int(h) * 3600 + int(m) * 60 + int(s) + frac_value


def distribute_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    """Reparte el tiempo de una línea entre sus palabras por longitud.

    No pretende ser alineación forzada: es una estimación editable. La UI lo
    indica y el usuario puede corregir palabra por palabra.
    """
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    if not words:
        return []
    span = max(0.1, end - start)
    weights = [max(1, len(re.sub(r"[^\wÁÉÍÓÚÜÑáéíóúüñ]", "", w))) for w in words]
    total = sum(weights) or len(words)
    cursor = start
    result: list[dict[str, Any]] = []
    for index, (word, weight) in enumerate(zip(words, weights)):
        duration = span * weight / total
        word_end = end if index == len(words) - 1 else min(end, cursor + duration)
        result.append(
            {
                "text": word,
                "start": round(cursor, 3),
                "end": round(max(cursor + 0.04, word_end), 3),
            }
        )
        cursor = word_end
    return result


def normalize_lines(
    lines: list[dict[str, Any]],
    duration: float,
    *,
    source: str = "manual",
) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for line in lines:
        text = str(line.get("text") or "").strip()
        if not text:
            continue
        try:
            start = clamp(float(line.get("start") or 0.0), 0.0, max(0.0, duration - 0.1))
            end = clamp(float(line.get("end") or start + 2.0), start + 0.08, duration)
        except (TypeError, ValueError):
            continue
        words = line.get("words") or []
        normalized_words: list[dict[str, Any]] = []
        for word in words:
            word_text = str(word.get("text") or "").strip()
            if not word_text:
                continue
            try:
                ws = clamp(float(word.get("start") or start), start, end)
                we = clamp(float(word.get("end") or ws + 0.2), ws + 0.03, end)
            except (TypeError, ValueError):
                continue
            normalized_words.append({"text": word_text, "start": round(ws, 3), "end": round(we, 3)})
        if not normalized_words:
            normalized_words = distribute_words(text, start, end)
        cleaned.append(
            {
                "id": line.get("id") or _new_id(),
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
                "words": normalized_words,
                "source": source,
            }
        )
    cleaned.sort(key=lambda item: item["start"])
    # Elimina solapamientos evidentes manteniendo la legibilidad.
    for previous, current in zip(cleaned, cleaned[1:]):
        if current["start"] < previous["end"] - 0.02:
            previous["end"] = round(max(previous["start"] + 0.1, current["start"] - 0.02), 3)
    return cleaned


def parse_srt(content: str, duration: float) -> list[dict[str, Any]]:
    blocks = re.split(r"\n\s*\n", content.replace("\r\n", "\n").strip())
    lines: list[dict[str, Any]] = []
    for block in blocks:
        match = _SRT_TIME.search(block)
        if not match:
            continue
        start = _seconds(match.group("h"), match.group("m"), match.group("s"), match.group("ms"))
        end = _seconds(match.group("h2"), match.group("m2"), match.group("s2"), match.group("ms2"))
        text = block[match.end() :].strip()
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s*\n\s*", " ", text).strip()
        if text:
            lines.append({"start": start, "end": max(start + 0.1, end), "text": text})
    return normalize_lines(lines, duration, source="srt")


def parse_lrc(content: str, duration: float) -> list[dict[str, Any]]:
    entries: list[tuple[float, str]] = []
    for raw in content.replace("\r\n", "\n").splitlines():
        matches = list(_LRC_TIME.finditer(raw))
        if not matches:
            continue
        text = _LRC_TIME.sub("", raw).strip()
        if not text:
            continue
        for match in matches:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            frac = match.group(3) or "0"
            frac_value = float(f"0.{frac}") if frac else 0.0
            entries.append((minutes * 60 + seconds + frac_value, text))
    entries.sort(key=lambda item: item[0])
    lines: list[dict[str, Any]] = []
    for index, (start, text) in enumerate(entries):
        end = entries[index + 1][0] if index + 1 < len(entries) else min(duration, start + 4.0)
        lines.append({"start": start, "end": max(start + 0.15, end), "text": text})
    return normalize_lines(lines, duration, source="lrc")


def split_text_into_lines(text: str, max_chars: int = 42) -> list[str]:
    raw_lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    result: list[str] = []
    for line in raw_lines:
        if not line:
            continue
        if len(line) <= max_chars:
            result.append(line)
            continue
        # Divide por frases y, si hace falta, por palabras.
        for sentence in re.split(r"(?<=[.!?;])\s+", line):
            words = sentence.split()
            current = ""
            for word in words:
                candidate = f"{current} {word}".strip()
                if len(candidate) > max_chars and current:
                    result.append(current)
                    current = word
                else:
                    current = candidate
            if current:
                result.append(current)
    return result


def parse_plain_text(content: str, duration: float) -> list[dict[str, Any]]:
    texts = split_text_into_lines(content)
    if not texts:
        return []
    slot = duration / len(texts)
    lines = []
    for index, text in enumerate(texts):
        start = index * slot
        end = duration if index == len(texts) - 1 else (index + 1) * slot
        lines.append({"start": start, "end": end, "text": text})
    normalized = normalize_lines(lines, duration, source="text")
    # La distribución uniforme es una ayuda, no una sincronización real.
    for line in normalized:
        line["estimated"] = True
    return normalized


def parse_import(content: str, kind: str, duration: float) -> list[dict[str, Any]]:
    if kind == "srt":
        return parse_srt(content, duration)
    if kind == "lrc":
        return parse_lrc(content, duration)
    return parse_plain_text(content, duration)


def to_srt(lines: list[dict[str, Any]]) -> str:
    def fmt(seconds: float) -> str:
        seconds = max(0.0, seconds)
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        ms = int(round((seconds - int(seconds)) * 1000))
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"

    chunks = []
    for index, line in enumerate(lines, start=1):
        chunks.append(f"{index}\n{fmt(line['start'])} --> {fmt(line['end'])}\n{line['text']}\n")
    return "\n".join(chunks)


def to_lrc(lines: list[dict[str, Any]]) -> str:
    chunks = []
    for line in lines:
        minutes = int(line["start"] // 60)
        seconds = line["start"] % 60
        chunks.append(f"[{minutes:02d}:{seconds:05.2f}]{line['text']}")
    return "\n".join(chunks)
