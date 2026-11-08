"""Esquemas Pydantic de la API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Format = Literal["9:16", "1:1", "16:9", "4:5"]
Resolution = Literal["720p", "1080p", "1440p"]
Quality = Literal["fast", "balanced", "high"]
Encoder = Literal["cpu", "qsv"]
Animation = Literal[
    "none",
    "fade",
    "slide_up",
    "slide_down",
    "scale",
    "pop",
    "word_by_word",
    "karaoke",
    "typewriter",
    "blur",
    "bounce",
    "smooth_reveal",
]


class ProjectCreate(BaseModel):
    name: str | None = Field(default=None, max_length=80)


class ProjectConfigure(BaseModel):
    project_id: str | None = None
    count: int | None = Field(default=None, ge=1, le=20)
    duration: float | None = Field(default=None, ge=3, le=300)
    format: Format | None = None
    resolution: Resolution | None = None
    fps: Literal[24, 25, 30, 60] | None = None
    quality: Quality | None = None
    encoder: Encoder | None = None
    seed: int | None = None
    styles: list[str] | None = None
    weights: dict[str, float] | None = None
    effects: dict[str, float] | None = None


class Fragment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)

    @field_validator("end")
    @classmethod
    def end_after_start(cls, value: float, info: Any) -> float:
        start = info.data.get("start", 0)
        if value <= start:
            raise ValueError("El final debe ser mayor que el inicio.")
        return value


class AnalyzeAudioRequest(BaseModel):
    project_id: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    force: bool = False


class AnalyzeVideoRequest(BaseModel):
    project_id: str
    format: Format = "9:16"
    resolution: Resolution = "1080p"
    fps: Literal[24, 25, 30, 60] = 30
    force: bool = False


class GenerateRequest(BaseModel):
    project_id: str
    count: int = Field(default=5, ge=1, le=20)
    duration: float = Field(default=30.0, ge=3, le=300)
    format: Format = "9:16"
    resolution: Resolution = "1080p"
    fps: Literal[24, 25, 30, 60] = 30
    quality: Quality = "balanced"
    encoder: Encoder = "cpu"
    seed: int = 20261107
    styles: list[str] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)
    effects: dict[str, float] = Field(default_factory=dict)
    lyrics: dict[str, Any] | None = None


class RenderRequest(BaseModel):
    project_id: str
    edit_id: str
    preview: bool = False
    quality: Quality | None = None
    encoder: Encoder | None = None


class JobCancelResponse(BaseModel):
    ok: bool
    job_id: str
    status: str


class YouTubePreflight(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    rights_confirmed: bool = False


class YouTubeImport(BaseModel):
    project_id: str
    url: str = Field(min_length=8, max_length=2000)
    rights_confirmed: bool


class LyricsLine(BaseModel):
    id: str | None = None
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = ""
    words: list[dict[str, Any]] = Field(default_factory=list)


class LyricsUpdate(BaseModel):
    project_id: str
    lines: list[LyricsLine]
    source: str = "manual"
    style: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class LyricsImport(BaseModel):
    project_id: str
    content: str
    kind: Literal["srt", "lrc", "text"]


class TranscribeRequest(BaseModel):
    project_id: str
    language: str | None = None
    model: str = "small"


class EditPatch(BaseModel):
    segments: list[dict[str, Any]] | None = None
    effects: dict[str, Any] | None = None
    grade: dict[str, float] | None = None
    lyrics_style: dict[str, Any] | None = None
    volume: float | None = Field(default=None, ge=0, le=2)
    weights: dict[str, float] | None = None


class ZipRequest(BaseModel):
    project_id: str
    render_ids: list[str] = Field(default_factory=list)
