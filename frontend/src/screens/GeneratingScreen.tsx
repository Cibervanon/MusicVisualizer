import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Film,
  Layers,
  ListChecks,
  Loader2,
  RotateCw,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, ApiError, waitForJob } from "../lib/validatedApi";
import type { Job, JobClip } from "../lib/types";
import { cn, formatTime, stageLabel } from "../lib/utils";
import { useStudio } from "../store/studio";
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  ProgressRing,
  SectionHeading,
} from "../components/ui";

function clipTone(status: JobClip["status"]) {
  switch (status) {
    case "ready":
      return "success" as const;
    case "error":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    case "rendering":
      return "accent" as const;
    default:
      return "neutral" as const;
  }
}

function clipLabel(status: JobClip["status"]) {
  switch (status) {
    case "ready":
      return "Listo";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelado";
    case "rendering":
      return "Renderizando";
    default:
      return "En cola";
  }
}

export function GeneratingScreen() {
  const project = useStudio((state) => state.project);
  const job = useStudio((state) => state.job);
  const setJob = useStudio((state) => state.setJob);
  const setStep = useStudio((state) => state.setStep);
  const refreshProject = useStudio((state) => state.refreshProject);
  const notify = useStudio((state) => state.notify);
  const [now, setNow] = useState(Date.now() / 1000);
  const [cancelling, setCancelling] = useState(false);
  const [finding, setFinding] = useState(false);
  const polledRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();

    const run = async () => {
      let current = job;
      if (!current) {
        setFinding(true);
        try {
          const { jobs } = await api.listJobs(project.id);
          current = jobs.find((item) => item.kind === "generate") || null;
        } catch {
          current = null;
        } finally {
          setFinding(false);
        }
        if (current) {
          setJob(current);
          return;
        }
      }
      if (!current) return;
      if (polledRef.current === current.id && current.status !== "running") return;
      if (current.status === "done") {
        await refreshProject();
        return;
      }
      if (current.status === "error" || current.status === "cancelled") return;

      polledRef.current = current.id;
      try {
        const final = await waitForJob(current.id, setJob, controller.signal);
        if (final.status === "done") {
          await refreshProject();
          notify(`${final.result?.renders?.length || 0} clip(s) listos.`, "success");
        }
      } catch (error) {
        if ((error as ApiError).code !== "aborted") {
          notify((error as ApiError).message, "error");
        }
      }
    };

    run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, job?.id]);

  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      const { job: updated } = await api.cancelJob(job.id);
      setJob(updated);
      notify("Cancelación solicitada. FFmpeg se detendrá de verdad.", "info");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setCancelling(false);
    }
  };

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

  if (!job && finding) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-lime" size={26} />
        <p className="text-sm text-white/40">Buscando el trabajo de generación…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50">
          <Layers size={20} />
        </div>
        <p className="text-sm font-semibold text-white/85">No hay una generación en curso</p>
        <p className="mt-1 text-xs leading-relaxed text-white/35">
          Configura la tanda y pulsa «Generar». También puedes abrir los resultados existentes.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="ghost" onClick={() => setStep("customize")}>
            Personalizar
          </Button>
          <Button variant="primary" onClick={() => setStep("results")}>
            Ver resultados <ArrowRight size={15} />
          </Button>
        </div>
      </Card>
    );
  }

  const elapsed =
    job.status === "done" || job.status === "error" || job.status === "cancelled"
      ? (job.finished_at || now) - (job.started_at || job.created_at)
      : now - (job.started_at || job.created_at);
  const clips = job.clips.length ? job.clips : [];
  const readyCount = clips.filter((clip) => clip.status === "ready").length;
  const errorCount = clips.filter((clip) => clip.status === "error").length;
  const isTerminal = ["done", "error", "cancelled"].includes(job.status);

  return (
    <div className="space-y-7 animate-rise">
      <SectionHeading
        eyebrow="Paso 03 · Generando"
        title={
          job.status === "done"
            ? "Tanda terminada."
            : job.status === "error"
              ? "Algo falló en el render."
              : job.status === "cancelled"
                ? "Generación cancelada."
                : "Cortando al ritmo. Render real."
        }
        description={
          job.status === "done"
            ? `${readyCount} de ${clips.length} clips se han renderizado y validado con FFmpeg.`
            : "El progreso viene directamente de FFmpeg y de las etapas de análisis. No hay barras simuladas."
        }
        action={
          isTerminal ? (
            <div className="flex gap-2">
              {job.status === "done" && (
                <Button variant="primary" size="lg" onClick={() => setStep("results")}>
                  <CheckCircle2 size={16} /> Ver resultados
                </Button>
              )}
              <Button variant="ghost" onClick={() => setStep("customize")}>
                <RotateCw size={15} /> Ajustar y repetir
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={cancel} loading={cancelling || job.status === "cancelling"}>
              <XCircle size={15} /> Cancelar render
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card strong className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime/[0.06] blur-3xl" />
          <div className="flex flex-col items-center">
            <ProgressRing
              value={job.progress}
              size={186}
              label={
                <span className="font-display text-4xl font-semibold text-white">
                  {Math.round(job.progress * 100)}
                  <span className="text-lg text-white/35">%</span>
                </span>
              }
              sublabel={
                <span className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/30">
                  {stageLabel(job.stage)}
                </span>
              }
            />
            <p className="mt-5 text-center text-sm font-medium text-white/80">{job.message}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Badge tone={job.status === "error" ? "danger" : job.status === "done" ? "success" : "accent"}>
                {job.status === "running" ? <Loader2 size={11} className="animate-spin" /> : null}
                {job.status === "cancelling" ? "Cancelando" : job.status}
              </Badge>
              <span className="chip">
                <Clock3 size={11} /> {formatTime(elapsed)}
              </span>
              <span className="chip">
                <Film size={11} /> {readyCount}/{clips.length || "?"}
              </span>
            </div>
          </div>

          {job.warnings.length > 0 && (
            <div className="mt-5 space-y-1.5">
              {job.warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-100/75"
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}

          {job.error && (
            <div className="mt-5 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-rose-100/85">
              {job.error}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <p className="panel-title mb-2">Registro</p>
            <div className="scroll-fade max-h-44 space-y-1 overflow-y-auto pr-1">
              {(job.logs || []).slice(-30).map((entry, index) => (
                <p key={`${entry.t}-${index}`} className="font-mono text-[10px] leading-relaxed text-white/30">
                  <span className="text-white/20">
                    {new Date(entry.t * 1000).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>{" "}
                  {entry.message}
                </p>
              ))}
              {(!job.logs || job.logs.length === 0) && (
                <p className="text-[10px] text-white/20">Sin eventos todavía.</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ListChecks size={16} className="text-cyan" />
              <div>
                <p className="text-sm font-semibold text-white/90">Clips de esta tanda</p>
                <p className="text-[11px] text-white/35">
                  Cada tarjeta es un render independiente con su propio EDL.
                </p>
              </div>
            </div>
            {errorCount > 0 && <Badge tone="danger">{errorCount} con error</Badge>}
          </div>

          {clips.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-14 text-center">
              <Loader2 size={20} className="animate-spin text-white/30" />
              <p className="mt-3 text-xs text-white/35">Preparando la planificación…</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {clips.map((clip) => (
              <div
                key={clip.index}
                className={cn(
                  "rounded-xl border px-3.5 py-3 transition",
                  clip.status === "ready"
                    ? "border-emerald-400/20 bg-emerald-400/[0.04]"
                    : clip.status === "error"
                      ? "border-rose-400/25 bg-rose-500/[0.06]"
                      : clip.status === "rendering"
                        ? "border-lime/25 bg-lime/[0.04]"
                        : "border-white/[0.07] bg-white/[0.02]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-white/25">
                      Clip {String(clip.index + 1).padStart(2, "0")}
                    </p>
                    <p className="truncate text-[13px] font-semibold text-white/85">
                      {clip.style_name || "Planificando…"}
                    </p>
                  </div>
                  <Badge tone={clipTone(clip.status)}>
                    {clip.status === "rendering" && <Loader2 size={10} className="animate-spin" />}
                    {clipLabel(clip.status)}
                  </Badge>
                </div>
                <div className="mt-2.5">
                  <ProgressBar
                    value={clip.progress}
                    tone={
                      clip.status === "error"
                        ? "danger"
                        : clip.status === "ready"
                          ? "lime"
                          : "accent"
                    }
                    height="h-1.5"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-white/30">
                    {Math.round(clip.progress * 100)}%
                  </span>
                  {clip.error && (
                    <span className="truncate text-right text-[10px] text-rose-300/80" title={clip.error}>
                      {clip.error}
                    </span>
                  )}
                  {clip.status === "ready" && clip.render_id && (
                    <span className="text-[10px] text-emerald-300/70">{clip.render_id}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {job.status === "done" && (job.result?.renders?.length || 0) > 0 && (
            <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-medium text-emerald-200/85">
                <CheckCircle2 size={14} /> {job.result?.renders?.length} MP4 validados y listos para
                descargar.
              </p>
              <p className="mt-1 text-[11px] text-white/35">
                Duración y resolución verificadas con ffprobe; integridad decodificada completa.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
