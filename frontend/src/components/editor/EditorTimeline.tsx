import { Copy, Scissors, Trash2 } from "lucide-react";

import { Button } from "../ui";
import type { Segment } from "../../lib/types";
import { Timeline } from "../Timeline";

interface EditorTimelineProps {
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
  onSplit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  hasSelection: boolean;
}

export function EditorTimeline({
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
  onDuplicate,
  onRemove,
  hasSelection,
}: EditorTimelineProps) {
  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-title">Timeline</p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="quiet" onClick={onSplit} title="Dividir en el cursor" disabled={!hasSelection}>
            <Scissors size={13} /> Dividir
          </Button>
          <Button size="sm" variant="quiet" onClick={onDuplicate} disabled={!hasSelection}>
            <Copy size={13} /> Duplicar
          </Button>
          <Button size="sm" variant="quiet" onClick={onRemove} disabled={!hasSelection}>
            <Trash2 size={13} /> Eliminar
          </Button>
        </div>
      </div>
      <Timeline
        segments={segments}
        duration={duration}
        masterDuration={masterDuration}
        playhead={playhead}
        selectedId={selectedId}
        accent={accent}
        onSelect={onSelect}
        onSeek={onSeek}
        onBeginInteraction={onBeginInteraction}
        onChange={onChange}
      />
    </div>
  );
}