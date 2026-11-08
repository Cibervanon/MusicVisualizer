"""Generador de subtítulos ASS con animaciones reales.

Todo lo que se declara aquí lo renderiza libass dentro de FFmpeg: fade, slide,
scale, pop, karaoke con \\kf, word-by-word, typewriter, blur, bounce y reveal.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core.util import clamp


def _ass_time(seconds: float) -> str:
    total_cs = max(0, int(round(float(seconds) * 100)))
    hours, rem = divmod(total_cs, 360000)
    minutes, rem = divmod(rem, 6000)
    secs, cs = divmod(rem, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"


def _hex_to_bgr(color: str) -> str:
    value = str(color or "#FFFFFF").lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        value = "FFFFFF"
    r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
    return f"{b:02X}{g:02X}{r:02X}"


def _alpha(opacity: float) -> int:
    return int(round(clamp(1.0 - float(opacity), 0.0, 1.0) * 255))


def _wrap(text: str, width: int, font_size: float) -> str:
    max_chars = max(8, int((width * 0.88) / max(8.0, font_size * 0.56)))
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return r"\N".join(lines[:4])


def _escape(text: str) -> str:
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def _scaled(style: dict[str, Any], width: int, height: int) -> dict[str, float]:
    scale = max(0.5, min(width, height) / 1080.0)
    return {
        "scale": scale,
        "font_size": max(12.0, float(style.get("size") or 58) * scale),
        "outline": max(0.0, float(style.get("outline") or 0) * scale),
        "shadow": max(0.0, float(style.get("shadow") or 0) * scale),
        "glow": max(0.0, float(style.get("glow") or 0) * scale),
        "spacing": float(style.get("spacing") or 0) * scale,
    }


def _position(style: dict[str, Any], width: int, height: int) -> tuple[int, int]:
    x = int(clamp(float(style.get("pos_x") or 0.5), 0.05, 0.95) * width)
    y = int(clamp(float(style.get("pos_y") or 0.80), 0.08, 0.92) * height)
    return x, y


def _anim_tags(
    animation_in: str,
    animation_out: str,
    in_ms: int,
    out_ms: int,
    alpha: int,
    x: int,
    y: int,
    height: int,
    duration_ms: int,
    extra: str = "",
) -> str:
    tags: list[str] = [r"\an5"]
    move = ""
    if animation_in == "slide_up":
        offset = int(height * 0.035)
        move = rf"\move({x},{y + offset},{x},{y},0,{in_ms})"
        tags.append(rf"\fad({in_ms},0)")
    elif animation_in == "slide_down":
        offset = int(height * 0.035)
        move = rf"\move({x},{y - offset},{x},{y},0,{in_ms})"
        tags.append(rf"\fad({in_ms},0)")
    else:
        move = rf"\pos({x},{y})"
        if animation_in in {"none"}:
            tags.append(rf"\fad(0,{out_ms})")
        elif animation_in == "scale":
            tags.append(rf"\fscx72\fscy72\t(0,{in_ms},\fscx100\fscy100)")
            tags.append(rf"\fad({in_ms},{out_ms})")
        elif animation_in == "pop":
            tags.append(rf"\fscx124\fscy124\t(0,{max(80, int(in_ms * 0.45))},\fscx100\fscy100)")
            tags.append(rf"\fad({max(40, int(in_ms * 0.4))},{out_ms})")
        elif animation_in == "blur":
            tags.append(rf"\blur14\t(0,{in_ms},\blur0)")
            tags.append(rf"\fad({in_ms},{out_ms})")
        elif animation_in == "bounce":
            tags.append(rf"\t(0,{max(90, int(in_ms * 0.4))},\fscx110\fscy110)")
            tags.append(rf"\t({max(90, int(in_ms * 0.4))},{in_ms},\fscx100\fscy100)")
            tags.append(rf"\fad({max(60, int(in_ms * 0.3))},{out_ms})")
        elif animation_in == "smooth_reveal":
            tags.append(rf"\alpha&HFF&\t(0,{in_ms},\alpha&H{alpha:02X}&)")
        else:  # fade y cualquier valor no reconocido
            tags.append(rf"\fad({in_ms},{out_ms})")
    tags.append(move)
    if animation_out == "scale":
        tags.append(rf"\t({max(0, duration_ms - out_ms)},{duration_ms},\fscx78\fscy78)")
    elif animation_out == "pop":
        tags.append(rf"\t({max(0, duration_ms - out_ms)},{duration_ms},\fscx118\fscy118)")
    if extra:
        tags.append(extra)
    return "{" + "".join(tags) + "}"


def _karaoke_text(words: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for word in words:
        duration_cs = max(1, int(round((float(word["end"]) - float(word["start"])) * 100)))
        chunks.append(rf"{{\kf{duration_cs}}}{_escape(str(word['text']))}")
    return " ".join(chunks)


def build_ass(
    lines: list[dict[str, Any]],
    style: dict[str, Any],
    *,
    width: int,
    height: int,
    duration: float,
    title: str = "AI Music Clip Studio",
) -> str:
    metrics = _scaled(style, width, height)
    font_size = metrics["font_size"]
    outline = metrics["outline"]
    shadow = metrics["shadow"]
    glow = metrics["glow"]
    spacing = metrics["spacing"]
    x, y = _position(style, width, height)
    base_alpha = _alpha(float(style.get("opacity") or 1.0))
    speed = max(0.25, float(style.get("animation_speed") or 1.0))
    in_ms = max(60, int(320 / speed))
    out_ms = max(60, int(260 / speed))

    primary = _hex_to_bgr(style.get("color") or "#FFFFFF")
    active = _hex_to_bgr(style.get("active_color") or style.get("color") or "#FFFFFF")
    outline_color = _hex_to_bgr(style.get("outline_color") or "#000000")
    shadow_color = _hex_to_bgr(style.get("shadow_color") or "#000000")
    back_color = _hex_to_bgr(style.get("background_color") or "#000000")
    back_alpha = _alpha(float(style.get("background_opacity") or 0.0))
    background = bool(style.get("background"))
    border_style = 4 if background else 1
    border_width = max(outline, font_size * 0.18) if background else outline

    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {width}
PlayResY: {height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,{style.get('font') or 'Segoe UI'},{font_size:.1f},&H{base_alpha:02X}{primary},&H{base_alpha:02X}{active},&H00{outline_color},&H{back_alpha:02X}{back_color},{'-1' if style.get('bold') else '0'},0,0,0,100,100,{spacing:.1f},0,{border_style},{border_width:.1f},{shadow:.1f},5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    font = _escape(str(style.get("font") or "Segoe UI"))
    uppercase = bool(style.get("uppercase"))
    animation_in = str(style.get("animation_in") or "fade")
    animation_out = str(style.get("animation_out") or "fade")

    def base_overrides(
        *,
        primary_override: str | None = None,
        secondary_override: str | None = None,
        extra: str = "",
    ) -> str:
        tags = [
            r"\an5",
            rf"\fn{font}",
            rf"\fs{font_size:.1f}",
            r"\b1" if style.get("bold") else r"\b0",
            rf"\c&H{primary_override or primary}&",
            rf"\3c&H{outline_color}&",
            rf"\4c&H{back_color}&",
            rf"\bord{border_width:.1f}",
            rf"\shad{shadow:.1f}",
            rf"\fsp{spacing:.1f}",
        ]
        if secondary_override:
            tags.append(rf"\2c&H{secondary_override}&")
        if base_alpha:
            tags.append(rf"\alpha&H{base_alpha:02X}&")
        if extra:
            tags.append(extra)
        return "{" + "".join(tags) + "}"

    def position_block(extra: str = "") -> str:
        return "{" + rf"\an5\pos({x},{y}){extra}" + "}"

    def glow_event(start: float, end: float, text: str, anim_in: str, anim_out: str) -> str | None:
        if glow <= 0.1 or not text:
            return None
        glow_style = (
            rf"\1a&HFF&\3a&H60&\shad0"
            rf"\bord{max(outline + glow * 0.45, glow * 0.5):.1f}"
            rf"\blur{glow * 0.55:.1f}"
            rf"\3c&H{outline_color}&"
        )
        tags = _anim_tags(
            anim_in,
            anim_out,
            in_ms,
            out_ms,
            base_alpha,
            x,
            y,
            height,
            max(100, int((end - start) * 1000)),
            extra=glow_style,
        )
        return f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Main,,0,0,0,,{tags}{text}"

    for line in lines:
        text = str(line.get("text") or "").strip()
        if not text:
            continue
        start = clamp(float(line.get("start") or 0.0), 0.0, duration)
        end = clamp(float(line.get("end") or start + 1.0), start + 0.05, duration)
        if end - start < 0.05:
            continue
        words = line.get("words") or []
        if uppercase:
            text = text.upper()
            words = [{**w, "text": str(w.get("text") or "").upper()} for w in words]
        wrapped = _wrap(_escape(text), width, font_size)

        if animation_in == "karaoke" and words:
            karaoke = _karaoke_text(words)
            tags = base_overrides(
                primary_override=active,
                secondary_override=primary,
            ) + position_block(rf"\fad({in_ms},{out_ms})")
            events.append(
                f"Dialogue: 1,{_ass_time(start)},{_ass_time(end)},Main,,0,0,0,,{tags}{karaoke}"
            )
            continue

        if animation_in == "word_by_word" and words:
            capped = words[:24]
            for index, word in enumerate(capped):
                word_start = max(start, float(word["start"]))
                word_end = (
                    min(end, float(capped[index + 1]["start"]))
                    if index + 1 < len(capped)
                    else end
                )
                if word_end - word_start < 0.03:
                    continue
                parts: list[str] = []
                for pos, item in enumerate(capped[: index + 1]):
                    word_text = _escape(str(item["text"]))
                    if pos == index:
                        parts.append(rf"{{\c&H{active}&}}{word_text}{{\c&H{primary}&}}")
                    else:
                        parts.append(word_text)
                partial = " ".join(parts)
                partial = _wrap(partial, width, font_size)
                tags = base_overrides() + position_block(
                    rf"\fad({max(40, int(in_ms * 0.35))},{max(40, int(out_ms * 0.35))})"
                )
                events.append(
                    f"Dialogue: 1,{_ass_time(word_start)},{_ass_time(word_end)},Main,,0,0,0,,{tags}{partial}"
                )
            continue

        if animation_in == "typewriter":
            clean = _escape(text)
            step = max(0.018, min(0.085, (end - start) / max(1, len(clean))))
            for index in range(min(len(clean), 90)):
                char_start = start + index * step
                char_end = end if index == min(len(clean), 90) - 1 else min(end, start + (index + 1) * step)
                if char_end <= char_start:
                    continue
                partial = clean[: index + 1]
                tags = base_overrides() + position_block(r"\fad(0,0)")
                events.append(
                    f"Dialogue: 1,{_ass_time(char_start)},{_ass_time(char_end)},Main,,0,0,0,,{tags}{partial}"
                )
            continue

        tags = base_overrides() + _anim_tags(
            animation_in,
            animation_out,
            in_ms,
            out_ms,
            base_alpha,
            x,
            y,
            height,
            max(100, int((end - start) * 1000)),
        )
        # El glow se dibuja detrás (capa 0) con el contorno resplandeciente.
        glow_line = glow_event(start, end, wrapped, animation_in, animation_out)
        if glow_line:
            events.append(glow_line)
        events.append(
            f"Dialogue: 1,{_ass_time(start)},{_ass_time(end)},Main,,0,0,0,,{tags}{wrapped}"
        )

    return header + "\n".join(events) + "\n"


def write_ass(
    path: str | Path,
    lines: list[dict[str, Any]],
    style: dict[str, Any],
    *,
    width: int,
    height: int,
    duration: float,
) -> Path:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        build_ass(lines, style, width=width, height=height, duration=duration),
        encoding="utf-8",
    )
    return output
