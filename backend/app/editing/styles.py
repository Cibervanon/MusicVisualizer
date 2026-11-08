"""Presets de edición. Cada estilo es un contrato declarativo, no un color.

Los pesos son orientativos y se pueden sobrescribir desde la interfaz; el EDL
guarda los pesos usados para que un re-render reproduzca el mismo resultado.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Style:
    id: str
    name: str
    tagline: str
    description: str
    accent: str
    beat_min: float
    beat_max: float
    min_shot: float
    max_shot: float
    transition: str
    transition_duration: float
    motion_target: float
    density_min: float
    density_max: float
    grade: dict[str, float] = field(default_factory=dict)
    effects: dict[str, float] = field(default_factory=dict)
    weights: dict[str, float] = field(default_factory=dict)
    align_scene_start: bool = False
    allowed_effects: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["allowed_effects"] = list(self.allowed_effects)
        return data


DEFAULT_WEIGHTS = {
    "beat": 0.30,
    "scene": 0.20,
    "motion": 0.15,
    "quality": 0.15,
    "diversity": 0.10,
    "energy": 0.10,
}


STYLES: tuple[Style, ...] = (
    Style(
        id="cinematic",
        name="Cinematic",
        tagline="Planos largos, luz de cine",
        description="Cortes amplios que respiran, transiciones suaves y un grade teal/orange contenido. Ideal para narrativa y música emocional.",
        accent="#E0B36A",
        beat_min=4,
        beat_max=8,
        min_shot=1.2,
        max_shot=5.5,
        transition="crossfade",
        transition_duration=0.45,
        motion_target=0.42,
        density_min=0.15,
        density_max=0.55,
        grade={"contrast": 1.07, "saturation": 0.93, "brightness": -0.01},
        effects={"vignette": 0.38, "grain": 0.14, "glow": 0.10, "rgb_split": 0.0, "sharpen": 0.25},
        weights={**DEFAULT_WEIGHTS, "motion": 0.13, "quality": 0.18},
        align_scene_start=True,
        allowed_effects=("vignette", "grain", "glow", "grade", "sharpen"),
    ),
    Style(
        id="dynamic",
        name="Dynamic",
        tagline="Energía en cada beat",
        description="Cortes de uno o dos beats, saturación alta y punch visual. Pensado para hooks y contenido de alto impacto.",
        accent="#FF6B3D",
        beat_min=1,
        beat_max=2,
        min_shot=0.32,
        max_shot=1.9,
        transition="cut",
        transition_duration=0.0,
        motion_target=0.66,
        density_min=0.7,
        density_max=1.8,
        grade={"contrast": 1.13, "saturation": 1.18, "brightness": 0.01},
        effects={"vignette": 0.16, "grain": 0.08, "glow": 0.0, "rgb_split": 0.0, "sharpen": 0.55},
        weights={**DEFAULT_WEIGHTS, "beat": 0.34, "motion": 0.18},
        allowed_effects=("vignette", "grain", "grade", "sharpen"),
    ),
    Style(
        id="beat_sync",
        name="Beat Sync",
        tagline="Un corte, un beat",
        description="Montaje estrictamente anclado al pulso. Sin efectos llamativos: manda la sincronía.",
        accent="#D6FF3D",
        beat_min=1,
        beat_max=2,
        min_shot=0.28,
        max_shot=1.6,
        transition="cut",
        transition_duration=0.0,
        motion_target=0.55,
        density_min=0.8,
        density_max=2.0,
        grade={"contrast": 1.04, "saturation": 1.05, "brightness": 0.0},
        effects={"vignette": 0.0, "grain": 0.0, "glow": 0.0, "rgb_split": 0.0, "sharpen": 0.2},
        weights={**DEFAULT_WEIGHTS, "beat": 0.42, "scene": 0.14},
        align_scene_start=True,
        allowed_effects=("grade", "sharpen"),
    ),
    Style(
        id="fast_cuts",
        name="Fast Cuts",
        tagline="Medio beat, máxima adrenalina",
        description="Cortes de medio beat y micro impactos. La densidad más alta del estudio.",
        accent="#FF3D7F",
        beat_min=0.5,
        beat_max=1.25,
        min_shot=0.18,
        max_shot=1.1,
        transition="cut",
        transition_duration=0.0,
        motion_target=0.82,
        density_min=1.2,
        density_max=3.2,
        grade={"contrast": 1.16, "saturation": 1.14, "brightness": 0.0},
        effects={"vignette": 0.2, "grain": 0.1, "glow": 0.0, "rgb_split": 0.04, "sharpen": 0.5},
        weights={**DEFAULT_WEIGHTS, "beat": 0.34, "motion": 0.22, "diversity": 0.08},
        allowed_effects=("vignette", "grain", "rgb_split", "grade", "sharpen"),
    ),
    Style(
        id="smooth",
        name="Smooth",
        tagline="Transiciones que fluyen",
        description="Crossfades largos y planos amplios. Un montaje elegante, sin agresividad.",
        accent="#7DD3FC",
        beat_min=6,
        beat_max=10,
        min_shot=2.0,
        max_shot=8.0,
        transition="crossfade",
        transition_duration=0.8,
        motion_target=0.3,
        density_min=0.1,
        density_max=0.42,
        grade={"contrast": 1.02, "saturation": 0.96, "brightness": 0.01},
        effects={"vignette": 0.12, "grain": 0.0, "glow": 0.16, "rgb_split": 0.0, "sharpen": 0.1},
        weights={**DEFAULT_WEIGHTS, "motion": 0.12, "quality": 0.2, "diversity": 0.12},
        allowed_effects=("glow", "vignette", "grade"),
    ),
    Style(
        id="emotional",
        name="Emotional",
        tagline="Silencio, grano y memoria",
        description="Planos largos, desaturación parcial y grano visible. Para breakdowns y letras que importan.",
        accent="#C4A7E7",
        beat_min=6,
        beat_max=10,
        min_shot=2.2,
        max_shot=8.5,
        transition="crossfade",
        transition_duration=1.0,
        motion_target=0.24,
        density_min=0.08,
        density_max=0.36,
        grade={"contrast": 0.98, "saturation": 0.72, "brightness": -0.01},
        effects={"vignette": 0.3, "grain": 0.2, "glow": 0.14, "rgb_split": 0.0, "sharpen": 0.0},
        weights={**DEFAULT_WEIGHTS, "quality": 0.2, "motion": 0.1, "energy": 0.08},
        allowed_effects=("vignette", "grain", "glow", "grade"),
    ),
    Style(
        id="flash",
        name="Flash",
        tagline="Destellos a cada impacto",
        description="Cortes rápidos con flash blanco en las transiciones y un ligero RGB split. Muy TikTok.",
        accent="#FFFFFF",
        beat_min=1,
        beat_max=2,
        min_shot=0.3,
        max_shot=1.6,
        transition="flash",
        transition_duration=0.07,
        motion_target=0.7,
        density_min=0.7,
        density_max=2.0,
        grade={"contrast": 1.1, "saturation": 1.08, "brightness": 0.02},
        effects={"vignette": 0.18, "grain": 0.06, "glow": 0.05, "rgb_split": 0.07, "sharpen": 0.35},
        weights={**DEFAULT_WEIGHTS, "beat": 0.36, "energy": 0.14},
        allowed_effects=("vignette", "grain", "glow", "rgb_split", "grade", "sharpen"),
    ),
    Style(
        id="modern",
        name="Modern Music Video",
        tagline="El equilibrio del videoclip",
        description="Mezcla de planos cortos y largos, grade contrastado y grano fino. El estilo más versátil.",
        accent="#8B5CF6",
        beat_min=2,
        beat_max=4,
        min_shot=0.6,
        max_shot=3.4,
        transition="crossfade",
        transition_duration=0.25,
        motion_target=0.56,
        density_min=0.4,
        density_max=1.0,
        grade={"contrast": 1.09, "saturation": 1.1, "brightness": 0.0},
        effects={"vignette": 0.22, "grain": 0.1, "glow": 0.06, "rgb_split": 0.0, "sharpen": 0.3},
        weights=DEFAULT_WEIGHTS,
        align_scene_start=True,
        allowed_effects=("vignette", "grain", "glow", "grade", "sharpen"),
    ),
    Style(
        id="minimal",
        name="Minimal",
        tagline="Solo imagen y tipografía",
        description="Sin efectos. Cortes limpios y planos amplios para que la letra sea la protagonista.",
        accent="#E5E5E5",
        beat_min=4,
        beat_max=8,
        min_shot=1.5,
        max_shot=6.5,
        transition="cut",
        transition_duration=0.0,
        motion_target=0.35,
        density_min=0.12,
        density_max=0.5,
        grade={"contrast": 1.02, "saturation": 1.0, "brightness": 0.0},
        effects={"vignette": 0.0, "grain": 0.0, "glow": 0.0, "rgb_split": 0.0, "sharpen": 0.15},
        weights={**DEFAULT_WEIGHTS, "quality": 0.22, "scene": 0.18},
        align_scene_start=True,
        allowed_effects=("grade",),
    ),
    Style(
        id="experimental",
        name="Experimental",
        tagline="Reglas rotas a propósito",
        description="Densidad variable, cambios de escala y efectos de color agresivos. Para material con personalidad.",
        accent="#34D399",
        beat_min=1,
        beat_max=8,
        min_shot=0.22,
        max_shot=4.2,
        transition="cut",
        transition_duration=0.0,
        motion_target=0.74,
        density_min=0.5,
        density_max=2.2,
        grade={"contrast": 1.14, "saturation": 1.16, "brightness": 0.0},
        effects={"vignette": 0.26, "grain": 0.16, "glow": 0.12, "rgb_split": 0.1, "sharpen": 0.4},
        weights={**DEFAULT_WEIGHTS, "diversity": 0.16, "motion": 0.18, "beat": 0.24},
        allowed_effects=("vignette", "grain", "glow", "rgb_split", "grade", "sharpen"),
    ),
)

STYLE_MAP = {style.id: style for style in STYLES}


def get_style(style_id: str) -> Style:
    return STYLE_MAP.get(style_id, STYLE_MAP["modern"])


def resolve_styles(ids: list[str] | None) -> list[Style]:
    if ids:
        resolved = [STYLE_MAP[i] for i in ids if i in STYLE_MAP]
        if resolved:
            return resolved
    return list(STYLES)


def style_catalog() -> list[dict[str, Any]]:
    return [style.to_dict() for style in STYLES]
