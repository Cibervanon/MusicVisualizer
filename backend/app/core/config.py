"""Configuración global.

No hay valores secretos ni credenciales: la aplicación es local y sin registro.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from .paths import ROOT_DIR

APP_NAME = "AI Music Clip Studio"
APP_VERSION = "0.1.0"
# Versión de los contratos JSON (audio_analysis, scene_library, edl...).
SCHEMA_VERSION = 1


@dataclass(frozen=True)
class Settings:
    """Ajustes de ejecución. Se pueden sobrescribir por variables de entorno."""

    host: str = os.environ.get("MCS_HOST", "127.0.0.1")
    port: int = int(os.environ.get("MCS_PORT", "8000"))

    # Orígenes permitidos del frontend en desarrollo (Vite).
    dev_origins: tuple[str, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    )

    # Cuántos renders simultáneos como máximo. 8 núcleos en este equipo:
    # 3 deja margen para que la interfaz siga respondiendo (ver docs §7.3).
    max_parallel_renders: int = int(os.environ.get("MCS_MAX_PARALLEL_RENDERS", "3"))

    # Codificador de vídeo preferido. "auto" elige h264_qsv si está disponible,
    # si no libx264. El usuario puede forzarlo desde la interfaz.
    video_encoder: str = os.environ.get("MCS_VIDEO_ENCODER", "auto")

    # Aviso de disco: por debajo de este margen la app advierte antes de empezar.
    min_free_disk_gb: float = float(os.environ.get("MCS_MIN_FREE_DISK_GB", "8"))

    # Nivel de logging.
    log_level: str = os.environ.get("MCS_LOG_LEVEL", "INFO")

    root_dir: str = str(ROOT_DIR)

    extras: tuple[str, ...] = field(default_factory=tuple)


settings = Settings()
