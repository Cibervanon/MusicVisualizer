import { useCallback, useEffect, useRef, useState } from "react";

import type { Segment } from "../lib/types";
import { clamp, cn, formatTime } from "../lib/utils";

interface TimelineProps {
  segments: Segment[];
  duration: number;
  masterDuration: number;
  playhead: number;
  selectedId: string | null;
  accent: string;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onBeginInteraction: () => void;
  onChange: (segments: Segment[]) => void;
  onSplit?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onMoveSelection?: (direction: -1 | 1) => void;
  hasSelection?: boolean;
}

type DragState = {
  type: "move" | "resize";
  id: string;
  startX: number;
  sourceStart: number;
  duration: number;
  sourceDuration: number;
};

export function Timeline({
  segments,
  duration,
  masterDuration,
  playhead,
  selectedId,
  accent,
  onSelect,
  onSeek,
  onBeginInteraction,
  onChange,
  onSplit,
  onRemove,
  onMoveSelection,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const dragRef = useRef<DragState | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation
  const frameDuration = 1 / 30; // assuming 30fps for frame step

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Only handle keys when timeline or ruler is focused
      const timelineFocused =
        target === wrapRef.current ||
        target === rulerRef.current ||
        target.closest('[role="button"][aria-label^="Segmento"]') !== null ||
        // Also check if a child of ruler is focused (playhead marker, ticks)
        (rulerRef.current && rulerRef.current.contains(target));

      if (!timelineFocused) return;

      const selectedIndex = segments.findIndex((s) => s.id === selectedId);

      switch (event.key) {
        case "ArrowRight": {
          event.preventDefault();
          if (event.shiftKey && onMoveSelection) {
            onMoveSelection(1);
          } else {
            const newTime = Math.min(duration, playhead + frameDuration);
            onSeek(newTime);
          }
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          if (event.shiftKey && onMoveSelection) {
            onMoveSelection(-1);
          } else {
            const newTime = Math.max(0, playhead - frameDuration);
            onSeek(newTime);
          }
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const newTime = Math.min(duration, playhead + frameDuration * 10);
          onSeek(newTime);
          break;
        }
        case "ArrowDown": {
          event.preventDefault();
          const newTime = Math.max(0, playhead - frameDuration * 10);
          onSeek(newTime);
          break;
        }
        case "Enter": {
          if (event.shiftKey && onSplit) {
            event.preventDefault();
            onSplit();
          }
          break;
        }
        case "Delete":
        case "Backspace": {
          if (onRemove && selectedId) {
            event.preventDefault();
            onRemove();
          }
          break;
        }
        case "Home": {
          event.preventDefault();
          onSeek(0);
          break;
        }
        case "End": {
          event.preventDefault();
          onSeek(duration);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playhead, duration, selectedId, segments, onSeek, onSplit, onRemove, onMoveSelection]);

  const pxPerSec = width / Math.max(0.1, duration);
  const safeMaster = Math.max(masterDuration || duration, 1);

  const startDrag = (
    event: React.PointerEvent,
    segment: Segment,
    type: "move" | "resize",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(segment.id);
    onBeginInteraction();
    dragRef.current = {
      type,
      id: segment.id,
      startX: event.clientX,
      sourceStart: segment.source_start,
      duration: segment.duration,
      sourceDuration: segment.source_duration,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = (event.clientX - drag.startX) / pxPerSec;
    const current = segmentsRef.current;
    const index = current.findIndex((item) => item.id === drag.id);
    const segment = current[index];
    if (!segment) return;

    if (drag.type === "move") {
      const maxStart = Math.max(0, safeMaster - drag.sourceDuration);
      const sourceStart = clamp(drag.sourceStart + delta, 0, maxStart);
      onChange(
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                source_start: round(sourceStart),
                source_end: round(sourceStart + item.source_duration),
              }
            : item,
        ),
      );
    } else {
      const extra = Math.max(0, drag.sourceDuration - drag.duration);
      const maxDuration = Math.max(0.12, safeMaster - segment.source_start - extra);
      const newDuration = clamp(drag.duration + delta, 0.12, maxDuration);
      const sourceDuration = clamp(
        newDuration + extra,
        newDuration,
        Math.max(newDuration, safeMaster - segment.source_start),
      );
      onChange(
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                duration: round(newDuration),
                source_duration: round(sourceDuration),
                source_end: round(item.source_start + sourceDuration),
              }
            : item,
        ),
      );
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const seek = useCallback(
    (event: React.MouseEvent) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const time = clamp((event.clientX - rect.left) / pxPerSec, 0, duration);
      onSeek(time);
    },
    [duration, onSeek, pxPerSec],
  );

  const tickStep = duration > 90 ? 10 : duration > 45 ? 5 : duration > 20 ? 2 : 1;
  const ticks: number[] = [];
  for (let value = 0; value <= duration + 0.001; value += tickStep) ticks.push(value);

  return (
    <div className="select-none" ref={wrapRef} tabIndex={0} onFocus={(e) => e.currentTarget.focus()}>
      {/* ruler */}
      <div
        ref={rulerRef}
        className="relative h-6 cursor-crosshair border-b border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70"
        onClick={seek}
        title="Haz clic para mover el cursor · ←/→ mueve cursor · Shift+←/→ selecciona segmento"
        tabIndex={0}
      >
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute top-0 h-full"
            style={{ left: `${(tick / duration) * 100}%` }}
          >
            <div className="h-2 w-px bg-white/15" />
            <span className="absolute left-1 top-1 font-mono text-[9px] text-white/25">
              {formatTime(tick)}
            </span>
          </div>
        ))}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-lime"
          style={{ left: `${clamp(playhead / duration, 0, 1) * 100}%` }}
        >
          <span className="absolute -left-[3px] -top-[1px] h-2 w-2 rotate-45 bg-lime" />
        </div>
      </div>

      {/* blocks */}
      <div className="relative mt-2 h-[78px] overflow-hidden rounded-lg border border-white/[0.06] bg-black/30">
        {segments.map((segment, index) => {
          const left = (segment.timeline_start / duration) * 100;
          const blockWidth = (segment.duration / duration) * 100;
          const selected = selectedId === segment.id;
          return (
            <div
              key={segment.id}
              role="button"
              tabIndex={0}
              aria-label={`Segmento ${index + 1}, ${segment.duration.toFixed(2)} segundos`}
              aria-pressed={selected}
              className={cn(
                "group absolute top-1.5 h-[64px] overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70",
                selected
                  ? "z-10 border-lime/70"
                  : "border-white/15 hover:border-white/35",
              )}
              style={{
                left: `${left}%`,
                width: `calc(${blockWidth}% - 2px)`,
                background: selected
                  ? "linear-gradient(135deg, rgba(214,255,61,0.16), rgba(139,92,246,0.16))"
                  : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                boxShadow: selected ? `0 0 0 1px ${accent}55` : undefined,
              }}
              onPointerDown={(event) => startDrag(event, segment, "move")}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onFocus={() => onSelect(segment.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(segment.id);
                }
              }}
            >
              <div className="pointer-events-none px-1.5 py-1">
                <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-white/60">
                  {segment.scene_id || `#${index + 1}`}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-white/35">
                  {segment.duration.toFixed(2)}s
                </p>
                <p className="mt-0.5 truncate font-mono text-[8px] text-white/20">
                  src {segment.source_start.toFixed(1)}–{segment.source_end.toFixed(1)}
                </p>
              </div>
              <div
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition group-hover:bg-white/15"
                onPointerDown={(event) => startDrag(event, segment, "resize")}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title="Arrastra para cambiar la duración"
              >
                <div className="mx-auto mt-5 h-4 w-[2px] rounded-full bg-white/30" />
              </div>
            </div>
          );
        })}
        {segments.length === 0 && (
          <div className="flex h-full items-center justify-center text-[11px] text-white/25">
            Sin segmentos
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-white/25">
        Arrastra un bloque para desplazar su punto de entrada en el máster · arrastra el borde
        derecho para alargar o acortar · clic en la regla para mover el cursor.
        <br />
        Teclado: ←/→ mover cursor · Shift+←/→ seleccionar segmento · Enter dividir · Supr
        eliminar · Inicio/Fin saltar al principio/final.
      </p>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
