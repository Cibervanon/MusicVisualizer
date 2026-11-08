import type { Segment } from "./types";

export function reflowSegments(
  segments: Segment[],
  targetDuration: number,
  masterDuration: number,
): Segment[] {
  if (!segments.length) return [];
  const safeMaster = Math.max(0.2, masterDuration || targetDuration || 1);
  const next = segments.map((segment, index) => {
    const duration = Math.max(0.12, Number(segment.duration) || 0.2);
    let sourceStart = Math.max(0, Number(segment.source_start) || 0);
    let sourceDuration = Math.max(duration, Number(segment.source_duration) || duration);
    if (sourceStart + sourceDuration > safeMaster) {
      sourceDuration = Math.max(duration, safeMaster - sourceStart);
      if (sourceStart + sourceDuration > safeMaster) {
        sourceStart = Math.max(0, safeMaster - sourceDuration);
      }
    }
    return {
      ...segment,
      index,
      duration: round(duration),
      source_start: round(sourceStart),
      source_duration: round(sourceDuration),
      source_end: round(sourceStart + sourceDuration),
    };
  });

  let cursor = 0;
  for (const segment of next) {
    segment.timeline_start = round(cursor);
    segment.timeline_end = round(cursor + segment.duration);
    cursor += segment.duration;
  }

  const delta = targetDuration - cursor;
  if (Math.abs(delta) > 0.01) {
    const last = next[next.length - 1];
    const newDuration = Math.max(0.12, last.duration + delta);
    const actualDelta = newDuration - last.duration;
    last.duration = round(newDuration);
    last.source_duration = round(Math.max(newDuration, last.source_duration + actualDelta));
    if (last.source_start + last.source_duration > safeMaster) {
      last.source_duration = round(Math.max(newDuration, safeMaster - last.source_start));
    }
    last.source_end = round(last.source_start + last.source_duration);
    last.timeline_end = round(last.timeline_start + last.duration);
  }

  return next;
}

export function splitSegmentAt(
  segments: Segment[],
  index: number,
  playhead: number,
): Segment[] {
  const segment = segments[index];
  if (!segment) return segments;
  const offset = playhead - segment.timeline_start;
  if (offset <= 0.15 || offset >= segment.duration - 0.15) return segments;
  const firstDuration = round(offset);
  const secondDuration = round(segment.duration - offset);
  const first: Segment = {
    ...segment,
    duration: firstDuration,
    source_duration: round(Math.min(segment.source_duration, firstDuration + 0.5)),
  };
  first.source_end = round(first.source_start + first.source_duration);
  const second: Segment = {
    ...segment,
    duration: secondDuration,
    source_start: round(segment.source_start + firstDuration),
    source_duration: round(Math.max(secondDuration, segment.source_duration - firstDuration)),
  };
  second.source_end = round(second.source_start + second.source_duration);
  const result = [...segments];
  result.splice(index, 1, first, second);
  return result;
}

export function moveSegment(segments: Segment[], index: number, direction: -1 | 1): Segment[] {
  const target = index + direction;
  if (target < 0 || target >= segments.length) return segments;
  const result = [...segments];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
