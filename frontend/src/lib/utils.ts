export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatTime(seconds: number | null | undefined, withMs = false): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "--:--";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const base = `${minutes}:${String(secs).padStart(2, "0")}`;
  if (!withMs) return base;
  const ms = Math.floor((safe % 1) * 10);
  return `${base}.${ms}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function aspectRatio(format: string): string {
  return format.replace(":", " / ");
}

const ASPECTS: Record<string, [number, number]> = {
  "9:16": [9, 16],
  "1:1": [1, 1],
  "16:9": [16, 9],
  "4:5": [4, 5],
};

export function targetDims(format: string, resolution: string): [number, number] {
  const height = resolution === "1440p" ? 1440 : resolution === "720p" ? 720 : 1080;
  const [aw, ah] = ASPECTS[format] || [9, 16];
  let width: number;
  let outH: number;
  if (aw >= ah) {
    width = height;
    outH = Math.round((width * ah) / aw);
  } else {
    outH = height;
    width = Math.round((outH * aw) / ah);
  }
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return [even(width), even(outH)];
}

export function uid(prefix = "line"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: "En cola",
    starting: "Iniciando",
    audio_extract: "Extrayendo audio",
    audio_analyze: "Analizando música",
    audio_ready: "Audio listo",
    video_master: "Normalizando vídeo",
    video_scenes: "Detectando escenas",
    video_ready: "Vídeo listo",
    planning: "Planificando cortes",
    rendering: "Renderizando",
    transcribing: "Transcribiendo",
    done: "Completado",
  };
  return labels[stage] || stage.replaceAll("_", " ");
}
