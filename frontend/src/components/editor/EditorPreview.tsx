import { Download, Film, Pause, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge, ProgressBar } from "../ui";
import { cn, formatTime, stageLabel } from "../../lib/utils";
import { downloadUrl } from "../../lib/api";
import { mediaUrl } from "../../lib/api";
import type { EDL, RenderInfo, Job } from "../../lib/types";

interface EditorPreviewProps {
  edit: EDL;
  projectId: string;
  timelineDuration: number;
  usingRender: boolean;
  renderStale: boolean;
  dirty: boolean;
  rendered: RenderInfo | null;
  playhead: number;
  playing: boolean;
  totalDuration: number;
  segments: Array<{ scene_id: string }>;
  renderBusy: boolean;
  renderJob: Job | null;
  videoSrc: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVideoTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onVideoLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
}

export function EditorPreview({
  edit,
  projectId,
  timelineDuration,
  usingRender,
  renderStale,
  dirty,
  rendered,
  playhead,
  playing,
  totalDuration,
  segments,
  renderBusy,
  renderJob,
  videoSrc,
  videoRef,
  onTogglePlay,
  onSeek,
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
}: EditorPreviewProps) {
  const uniqueSceneCount = new Set(segments.map((s) => s.scene_id)).size;
  const cutsPerSecond = segments.length / Math.max(0.1, totalDuration);

  return (
    <div className="relative flex min-h-[280px] items-center justify-center bg-black/50 p-3">
      <video
        ref={videoRef}
        key={videoSrc}
        src={videoSrc}
        className="max-h-[46vh] w-full rounded-lg object-contain"
        controls
        playsInline
        onTimeUpdate={onVideoTimeUpdate}
        onPlay={() => onTogglePlay()}
        onPause={() => onTogglePlay()}
        onLoadedMetadata={onVideoLoadedMetadata}
      />
      <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
        <Badge tone={usingRender ? (renderStale ? "warning" : "success") : "warning"}>
          {usingRender ? (
            <>
              <Film size={10} />{" "}
              {renderStale
                ? "render desactualizado"
                : rendered?.type === "preview"
                ? "preview real"
                : "render final"}
            </>
          ) : (
            <>
              <Film size={10} /> máster original
            </>
          )}
        </Badge>
        {dirty && <Badge tone="accent">cambios sin guardar</Badge>}
      </div>
      {!usingRender && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-[10px] text-white/50 backdrop-blur">
          Estás viendo el máster normalizado: el cursor se mapea al metraje de origen.
          Renderiza una preview para ver el montaje real.
        </p>
      )}
      {usingRender && (renderStale || dirty) && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[10px] text-amber-100/80 backdrop-blur">
          {dirty
            ? "Hay cambios sin guardar: esta preview no los incluye."
            : "Esta preview se generó antes de los últimos cambios guardados."}
        </p>
      )}

      <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] p-4 lg:border-l lg:border-t-0 lg:absolute lg:bottom-auto lg:top-0 lg:left-auto lg:right-0 lg:w-80 lg:h-full lg:min-h-0">
        <div className="flex items-center justify-between">
          <p className="panel-title">Reproducción</p>
          <button
            onClick={onTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-lime/30 bg-lime/10 text-lime transition hover:bg-lime/20"
            aria-label={playing ? "Pausa" : "Play"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
        </div>
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-2xl font-semibold text-white">{formatTime(playhead, true)}</span>
          <span className="text-xs text-white/30">/ {formatTime(totalDuration)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="text-white/30">Segmentos</p>
            <p className="font-mono text-white/80">{segments.length}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="text-white/30">Cortes/s</p>
            <p className="font-mono text-white/80">{cutsPerSecond.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="text-white/30">Escenas</p>
            <p className="font-mono text-white/80">{uniqueSceneCount}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="text-white/30">Salida</p>
            <p className="font-mono text-white/80">{edit.width}×{edit.height}</p>
          </div>
        </div>
        {rendered && (
          <a
            href={downloadUrl(projectId, rendered.id)}
            download
            className="btn btn-ghost w-full px-3 py-2 text-xs"
          >
            <Download size={13} /> Descargar {rendered.type === "preview" ? "preview" : "MP4"}
          </a>
        )}
        {renderBusy && renderJob && (
          <div className="rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2">
            <p className="text-[10px] text-white/45">
              {stageLabel(renderJob.stage)} · {Math.round(renderJob.progress * 100)}%
            </p>
            <ProgressBar value={renderJob.progress} height="h-1" className="mt-1.5" />
          </div>
        )}
      </div>
    </div>
  );
}