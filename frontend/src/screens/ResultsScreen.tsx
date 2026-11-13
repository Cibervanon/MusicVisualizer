import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  Layers,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, ApiError, downloadUrl, mediaUrl, saveBlob } from "../lib/validatedApi";
import type { RenderInfo } from "../lib/types";
import { cn, formatBytes, formatTime } from "../lib/utils";
import { useStudio } from "../store/studio";
import { Badge, Button, Card, EmptyState, Modal, SectionHeading, Skeleton } from "../components/ui";

function ClipCard({
  render,
  projectId,
  onOpen,
  onEdit,
  onDelete,
  deleting,
}: {
  render: RenderInfo;
  projectId: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = mediaUrl(projectId, render.path);
  const poster = render.thumb ? mediaUrl(projectId, render.thumb) : undefined;
  const errors = render.validation.issues.filter((issue) => issue.level === "error");
  const warnings = render.validation.issues.filter((issue) => issue.level === "warning");

  return (
    <Card className="group overflow-hidden transition duration-300 hover:border-white/15 hover:shadow-card">
      <div
        className="relative aspect-video cursor-pointer overflow-hidden bg-black"
        onClick={onOpen}
        onMouseEnter={() => {
          const video = videoRef.current;
          if (video) {
            video.currentTime = 0;
            video.play().catch(() => undefined);
          }
        }}
        onMouseLeave={() => {
          const video = videoRef.current;
          if (video) {
            video.pause();
            video.currentTime = 0;
          }
        }}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-100 transition group-hover:opacity-0">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-md">
            <Play size={18} className="ml-0.5" />
          </span>
        </div>
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          <Badge tone="success">
            <CheckCircle2 size={10} /> validado
          </Badge>
          {warnings.length > 0 && (
            <Badge tone="warning">
              <TriangleAlert size={10} /> {warnings.length}
            </Badge>
          )}
          {errors.length > 0 && <Badge tone="danger">{errors.length} errores</Badge>}
        </div>
        <div className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/75 backdrop-blur">
          {render.width}×{render.height}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-white/90">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: render.style === "flash" ? "#fff" : undefined }}
              />
              {render.style_name}
            </p>
            <p className="mt-0.5 text-[11px] text-white/35">
              {formatTime(render.duration)} · {render.fps} fps · {formatBytes(render.size)}
            </p>
          </div>
          <Badge tone={render.quality === "high" ? "accent" : "neutral"}>{render.quality}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-white/30">
          <span className="chip">
            <Film size={10} /> {render.encoder}
          </span>
          <span className="chip">
            <Scissors size={10} /> {render.edit_id}
          </span>
          {render.note && <span className="chip text-amber-200/60">{render.note}</span>}
        </div>

        <div className="mt-3.5 flex items-center gap-1.5">
          <a
            href={downloadUrl(projectId, render.id)}
            className="btn btn-ghost flex-1 px-3 py-2 text-xs"
            download
          >
            <Download size={13} /> Descargar
          </a>
          <Button variant="ghost" size="sm" onClick={onEdit} className="px-2.5">
            <Pencil size={13} />
          </Button>
          <Button variant="quiet" size="sm" onClick={onOpen} className="px-2.5">
            <ExternalLink size={13} />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={onDelete}
            loading={deleting}
            className="px-2.5 text-rose-300/70 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// small helper so the ref type is local and stable
export function ResultsScreen() {
  const project = useStudio((state) => state.project);
  const setStep = useStudio((state) => state.setStep);
  const setSelectedEdit = useStudio((state) => state.setSelectedEdit);
  const refreshProject = useStudio((state) => state.refreshProject);
  const notify = useStudio((state) => state.notify);
  const [active, setActive] = useState<RenderInfo | null>(null);
  const [zipping, setZipping] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!project?.renders?.length);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!project) return;
      setLoading(true);
      await refreshProject();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-white/60">No hay ningún proyecto activo.</p>
        <Button className="mt-4" variant="ghost" onClick={() => setStep("setup")}>
          <ArrowLeft size={15} /> Empezar
        </Button>
      </Card>
    );
  }

  const finals = (project.renders || []).filter((render) => render.type === "final");
  const previews = (project.renders || []).filter((render) => render.type === "preview");
  const totalSize = finals.reduce((sum, render) => sum + render.size, 0);
  const allValid = finals.length > 0 && finals.every((render) => render.validation.ok);

  const downloadZip = async () => {
    setZipping(true);
    try {
      const blob = await api.downloadZip(project.id, finals.map((render) => render.id));
      saveBlob(blob, `${project.name.replace(/\s+/g, "_")}_clips.zip`);
      notify("ZIP generado con los MP4 reales.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setZipping(false);
    }
  };

  const remove = async (render: RenderInfo) => {
    if (!window.confirm(`¿Eliminar el clip «${render.style_name}» del disco?`)) return;
    setDeletingId(render.id);
    try {
      await api.deleteRender(render.id, project.id);
      await refreshProject();
      notify("Clip eliminado.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const edit = (render: RenderInfo) => {
    setSelectedEdit(render.edit_id);
    setStep("editor");
  };

  return (
    <div className="space-y-7 animate-rise">
      <SectionHeading
        eyebrow="Paso 04 · Resultados"
        title={finals.length ? `${finals.length} clips listos para publicar.` : "Todavía no hay clips finales."}
        description={
          finals.length
            ? "Cada tarjeta reproduce el MP4 real desde el disco. Descarga individual o toda la tanda en ZIP. Los archivos se validan con ffprobe antes de aparecer aquí."
            : "Genera una tanda para ver aquí los resultados renderizados."
        }
        action={
          finals.length ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep("customize")}>
                <Plus size={15} /> Nueva tanda
              </Button>
              <Button variant="primary" onClick={downloadZip} loading={zipping}>
                <Download size={16} /> Descargar ZIP
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setStep("customize")}>
              <Plus size={15} /> Generar clips
            </Button>
          )
        }
      />

      {finals.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            ["Clips", String(finals.length)],
            ["Peso total", formatBytes(totalSize)],
            ["Duración", `${formatTime(finals[0].duration)} c/u`],
            ["Validación", allValid ? "todo OK" : "revisar"],
          ].map(([label, value]) => (
            <Card key={label} className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</p>
              <p
                className={cn(
                  "mt-1 font-display text-lg font-semibold",
                  label === "Validación" && allValid ? "text-emerald-300" : "text-white/85",
                )}
              >
                {value}
              </p>
            </Card>
          ))}
        </div>
      )}

      {loading && finals.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="overflow-hidden">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2 w-1/3" />
                <Skeleton className="h-8 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : finals.length === 0 ? (
        <EmptyState
          icon={<Layers size={20} />}
          title="Sin renders finales todavía"
          description="Vuelve a personalizar y genera la primera tanda. El render se ejecuta en tu equipo con FFmpeg."
          action={
            <Button variant="primary" onClick={() => setStep("customize")}>
              <Plus size={15} /> Ir a personalizar
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {finals.map((render) => (
            <ClipCard
              key={render.id}
              render={render}
              projectId={project.id}
              onOpen={() => setActive(render)}
              onEdit={() => edit(render)}
              onDelete={() => remove(render)}
              deleting={deletingId === render.id}
            />
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white/80">Previews del editor</p>
              <p className="text-[11px] text-white/35">
                {previews.length} preview(s) a media resolución generados para revisar cambios.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {previews.slice(0, 4).map((render) => (
                <button
                  key={render.id}
                  onClick={() => setActive(render)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55 transition hover:bg-white/[0.07] hover:text-white"
                >
                  {render.edit_id.replace("edit_", "")} · {formatTime(render.duration)}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.style_name} wide>
        {active && (
          <div className="bg-black">
            <video
              key={active.id}
              src={mediaUrl(project.id, active.path)}
              poster={active.thumb ? mediaUrl(project.id, active.thumb) : undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[70vh] w-full object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3 text-[11px] text-white/45">
              <span>
                {active.width}×{active.height} · {active.fps} fps · {formatBytes(active.size)} ·{" "}
                {active.duration.toFixed(2)}s
              </span>
              <div className="flex gap-2">
                <a
                  href={downloadUrl(project.id, active.id)}
                  download
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  <Download size={13} /> Descargar MP4
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    edit(active);
                    setActive(null);
                  }}
                >
                  <Pencil size={13} /> Editar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
