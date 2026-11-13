import type { Segment } from "./types";

const MIN_DURATION = 0.12;

let fallbackCounter = 0;

export function newSegmentId(prefix = "seg"): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : `${Date.now().toString(36)}${(fallbackCounter++).toString(36)}`;
  return `${prefix}-${uuid}`;
}

/** Garantiza un id estable y único para cada segmento (proyectos antiguos no lo tenían). */
export function ensureSegmentIds(segments: Segment[], prefix = "legacy"): Segment[] {
  const seen = new Set<string>();
  return segments.map((segment, index) => {
    let id = typeof segment.id === "string" ? segment.id.trim() : "";
    if (!id || seen.has(id)) {
      id = `${prefix}-${index}-${segment.scene_id || "scene"}`;
      let suffix = 1;
      while (seen.has(id)) id = `${prefix}-${index}-${segment.scene_id || "scene"}-${suffix++}`;
    }
    seen.add(id);
    return { ...segment, id };
  });
}

export function segmentIndexById(segments: Segment[], id: string | null): number {
  if (!id) return -1;
  return segments.findIndex((segment) => segment.id === id);
}

export function docDuration(segments: Segment[]): number {
  return round(segments.reduce((total, segment) => total + Math.max(0, Number(segment.duration) || 0), 0));
}

/**
 * Reordena en timeline secuencial y sanea los límites de origen.
 *
 * Importante: la duración del montaje se deriva de la suma de segmentos. Si el
 * usuario acorta el último clip, NO se vuelve a estirar (el bug anterior
 * cancelaba esa edición). Solo se recorta por el final cuando la suma supera la
 * duración disponible del audio.
 */
export function reflowSegments(
  segments: Segment[],
  targetDuration: number,
  masterDuration: number,
  transitionDuration = 0,
): Segment[] {
  if (!segments.length) return [];
  const safeMaster = Math.max(0.2, Number(masterDuration) || Number(targetDuration) || 1);
  const target = Math.max(MIN_DURATION, Number(targetDuration) || docDuration(segments) || 1);

  const next = segments.map((segment, index) => {
    let duration = Math.max(MIN_DURATION, Number(segment.duration) || 0.2);
    const sceneStart = Math.max(0, Number(segment.scene_start) || 0);
    const sceneEnd = Math.min(
      safeMaster,
      Math.max(sceneStart + MIN_DURATION, Number(segment.scene_end) || safeMaster),
    );
    const crossfade = segment.transition === "crossfade" && index > 0;
    const minSource = duration + (crossfade ? Math.max(0, transitionDuration) : 0);

    let lower = Math.min(sceneStart, safeMaster - MIN_DURATION);
    let upper = sceneEnd;
    if (upper - lower < minSource) {
      upper = Math.min(safeMaster, lower + minSource);
      lower = Math.max(0, Math.min(lower, upper - minSource));
    }
    if (upper - lower < MIN_DURATION) {
      lower = Math.max(0, safeMaster - MIN_DURATION);
      upper = safeMaster;
    }
    duration = Math.min(duration, Math.max(MIN_DURATION, upper - lower));

    let sourceDuration = Math.max(minSource, Number(segment.source_duration) || minSource);
    sourceDuration = Math.min(sourceDuration, Math.max(duration, upper - lower));
    const sourceStart = clamp(Number(segment.source_start) || lower, lower, upper - sourceDuration);
    return {
      ...segment,
      index,
      duration: round(duration),
      source_start: round(sourceStart),
      source_duration: round(sourceDuration),
      source_end: round(sourceStart + sourceDuration),
    };
  });

  // Solo recortar si el montaje excede el audio disponible. Se hace por el final.
  let total = next.reduce((sum, segment) => sum + segment.duration, 0);
  let excess = total - target;
  for (let index = next.length - 1; index >= 0 && excess > 0.001; index -= 1) {
    const reducible = Math.max(0, next[index].duration - MIN_DURATION);
    const cut = Math.min(reducible, excess);
    if (cut <= 0) continue;
    next[index].duration = round(next[index].duration - cut);
    excess -= cut;
  }

  total = 0;
  for (const segment of next) {
    segment.timeline_start = round(total);
    segment.timeline_end = round(total + segment.duration);
    total += segment.duration;
  }
  return next;
}

export function splitSegmentAt(
  segments: Segment[],
  idOrIndex: string | number,
  playhead: number,
  transitionDuration = 0,
): Segment[] {
  const index =
    typeof idOrIndex === "number"
      ? idOrIndex
      : segments.findIndex((segment) => segment.id === idOrIndex);
  const segment = segments[index];
  if (!segment) return segments;
  const offset = playhead - segment.timeline_start;
  if (offset <= 0.15 || offset >= segment.duration - 0.15) return segments;

  const firstDuration = round(offset);
  const secondDuration = round(segment.duration - offset);
  const crossfade = segment.transition === "crossfade";
  const firstSourceDuration = round(
    Math.min(segment.source_duration, offset + (crossfade ? transitionDuration : 0)),
  );
  const secondSourceStart = round(segment.source_start + offset);
  const available = Math.max(0, segment.source_end - secondSourceStart);
  const secondSourceDuration = round(
    Math.max(
      Math.min(secondDuration, available),
      Math.min(segment.source_duration - offset, available),
    ),
  );
  if (secondSourceDuration < secondDuration - 0.02) return segments;

  const first: Segment = {
    ...segment,
    duration: firstDuration,
    source_duration: Math.max(firstDuration, firstSourceDuration),
  };
  first.source_end = round(first.source_start + first.source_duration);

  const second: Segment = {
    ...segment,
    id: newSegmentId(segment.id.split("-")[0] || "seg"),
    duration: secondDuration,
    source_start: secondSourceStart,
    source_duration: Math.max(secondDuration, secondSourceDuration),
  };
  second.source_end = round(second.source_start + second.source_duration);

  const result = [...segments];
  result.splice(index, 1, first, second);
  return result;
}

export function moveSegment(
  segments: Segment[],
  idOrIndex: string | number,
  direction: -1 | 1,
): Segment[] {
  const index =
    typeof idOrIndex === "number"
      ? idOrIndex
      : segments.findIndex((segment) => segment.id === idOrIndex);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= segments.length) return segments;
  const result = [...segments];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function duplicateSegment(
  segments: Segment[],
  idOrIndex: string | number,
  maxDuration = Number.POSITIVE_INFINITY,
): { segments: Segment[]; id: string | null } {
  const index =
    typeof idOrIndex === "number"
      ? idOrIndex
      : segments.findIndex((segment) => segment.id === idOrIndex);
  const segment = segments[index];
  if (!segment) return { segments, id: null };
  const duration = Math.max(
    MIN_DURATION,
    Math.min(segment.duration, maxDuration),
  );
  if (maxDuration < MIN_DURATION) {
    return { segments, id: null };
  }
  const copy: Segment = {
    ...segment,
    id: newSegmentId(segment.id.split("-")[0] || "seg"),
    duration: round(duration),
    source_duration: round(Math.max(duration, Math.min(segment.source_duration, duration + 0.5))),
  };
  copy.source_end = round(copy.source_start + copy.source_duration);
  const result = [...segments];
  result.splice(index + 1, 0, copy);
  return { segments: result, id: copy.id };
}

export function removeSegment(
  segments: Segment[],
  idOrIndex: string | number,
): { segments: Segment[]; nextId: string | null } {
  const index =
    typeof idOrIndex === "number"
      ? idOrIndex
      : segments.findIndex((segment) => segment.id === idOrIndex);
  if (index < 0 || segments.length <= 1) return { segments, nextId: null };
  const result = segments.filter((_, item) => item !== index);
  const nextId = result[Math.min(index, result.length - 1)]?.id ?? null;
  return { segments: result, nextId };
}

/** Tiempo de salida → tiempo del máster. */
export function timelineToSource(segments: Segment[], time: number): number {
  if (!segments.length) return 0;
  const segment =
    segments.find((item) => time >= item.timeline_start && time < item.timeline_end) ||
    (time < segments[0].timeline_start ? segments[0] : segments[segments.length - 1]);
  const offset = clamp(time - segment.timeline_start, 0, segment.duration);
  return round(clamp(segment.source_start + offset, segment.source_start, segment.source_end));
}

/** Tiempo del máster → tiempo de salida (primer segmento que lo contiene). */
export function sourceToTimeline(segments: Segment[], source: number): number | null {
  if (!segments.length) return null;
  const segment = segments.find(
    (item) => source >= item.source_start && source <= item.source_end,
  );
  if (!segment) return null;
  const offset = clamp(source - segment.source_start, 0, segment.duration);
  return round(clamp(segment.timeline_start + offset, segment.timeline_start, segment.timeline_end));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
