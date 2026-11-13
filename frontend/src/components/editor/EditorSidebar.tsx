import { Download, Eye, History, Zap, Loader2, Clapperboard, Volume2, Wand2 } from "lucide-react";

import { Badge, Button, Card, ProgressBar } from "../ui";
import { cn, formatBytes, formatTime, stageLabel } from "../../lib/utils";
import type { RenderInfo, Job } from "../../lib/types";
import { downloadUrl } from "../../lib/api";
import { useStudio } from "../../store/studio";

interface EditorSidebarProps {
  projectId: string;
  edit: any;
  project: any;
  rendered: RenderInfo | null;
  renderingType: "preview" | "final" | null;
  renderJob: Job | null;
  renderBusy: boolean;
  dirty: boolean;
  pastLength: number;
  futureLength: number;
  onPreview: () => void;
  onRenderFinal: () => void;
}

export function EditorSidebar({
  projectId,
  edit,
  project,
  rendered,
  renderingType,
  renderJob,
  renderBusy,
  dirty,
  pastLength,
  futureLength,
  onPreview,
  onRenderFinal,
}: EditorSidebarProps) {
  return (
    <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-lime/20 bg-lime/[0.07] text-lime">
            <Zap size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">Render</p>
            <p className="text-[11px] text-white/35">MP4 H.264 + AAC, validado con ffprobe</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={onPreview}
            loading={renderingType === "preview"}
            disabled={renderBusy}
          >
            <Eye size={15} /> Preview a media resolución
          </Button>
          <Button
            variant="primary"
            className="w-full"
            onClick={onRenderFinal}
            loading={renderingType === "final"}
            disabled={renderBusy}
          >
            <Download size={15} /> Render final
          </Button>
        </div>
        <div className="mt-3 space-y-1.5 text-[10px] text-white/30">
          <p className="flex items-center justify-between">
            <span>Calidad</span>
            <span className="text-white/55">{project.config.quality}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>Encoder</span>
            <span className="text-white/55">{project.config.encoder}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>Salida</span>
            <span className="text-white/55">
              {edit.width}×{edit.height} · {edit.fps}fps
            </span>
          </p>
        </div>
        {rendered && (
          <div className="mt-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-[10px] text-emerald-200/75">
            {rendered.type === "preview" ? "Preview" : "Final"} lista ·{" "}
            {formatBytes(rendered.size)} · {rendered.validation.ok ? "validada" : "revisar"}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <History size={14} className="text-white/40" />
          <p className="panel-title">Historial</p>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px] text-white/40">
          <p className="flex items-center justify-between">
            <span>Deshacer</span>
            <span className="font-mono text-white/60">{pastLength}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>Rehacer</span>
            <span className="font-mono text-white/60">{futureLength}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>Estado</span>
            <span className={dirty ? "text-amber-300" : "text-emerald-300"}>
              {dirty ? "sin guardar" : "guardado"}
            </span>
          </p>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-white/30">
          Ctrl+Z deshacer · Ctrl+Y rehacer · Espacio reproducir. El historial es local a esta
          sesión de edición.
        </div>
      </Card>

      {renderJob && renderBusy && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="text-accent animate-spin" />
            <p className="panel-title">Progreso de render</p>
          </div>
          <div className="mt-3 space-y-1.5 text-[11px] text-white/40">
            <p className="flex items-center justify-between">
              <span>Etapa</span>
              <span className="font-mono text-white/60">{stageLabel(renderJob.stage)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>Progreso</span>
              <span className="font-mono text-white/60">{Math.round(renderJob.progress * 100)}%</span>
            </p>
          </div>
          <ProgressBar value={renderJob.progress} className="mt-2" />
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <p className="panel-title">Consejos de montaje</p>
        <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-white/35">
          <li className="flex gap-2">
            <Wand2 size={12} className="mt-0.5 shrink-0 text-lime/60" />
            Mantén cortes de 0,5–2 s en estilos rápidos y de 2–5 s en cinemáticos.
          </li>
          <li className="flex gap-2">
            <Clapperboard size={12} className="mt-0.5 shrink-0 text-cyan/60" />
            Reutiliza escenas con moderación: el planificador penaliza la repetición.
          </li>
          <li className="flex gap-2">
            <Volume2 size={12} className="mt-0.5 shrink-0 text-accent/60" />
            El audio se normaliza a −14 LUFS, el estándar de plataformas.
          </li>
        </ul>
      </Card>
    </div>
  );
}