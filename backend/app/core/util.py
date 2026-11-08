"""Utilidades pequeñas compartidas: hashing, JSON atómico, nombres seguros."""

from __future__ import annotations

import hashlib
import json
import re
import time
import unicodedata
from pathlib import Path
from typing import Any

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def sha1_of(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    return hashlib.sha1(payload).hexdigest()[:16]


def file_fingerprint(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    stat = p.stat()
    return {"name": p.name, "size": stat.st_size, "mtime": int(stat.st_mtime)}


def safe_filename(name: str, fallback: str = "file") -> str:
    normalized = unicodedata.normalize("NFKD", name or "")
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.strip().replace(" ", "_")
    normalized = _SAFE_NAME.sub("_", normalized).strip("._")
    return normalized[:120] or fallback


def read_json(path: str | Path, default: Any = None) -> Any:
    p = Path(path)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def write_json(path: str | Path, data: Any) -> None:
    """Escritura atómica para que un corte no deje un JSON corrupto."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + f".{int(time.time() * 1000)}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def human_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0))
    minutes, rest = divmod(seconds, 60)
    return f"{int(minutes):02d}:{rest:05.2f}"
