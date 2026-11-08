import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Disc3,
  Film,
  FolderOpen,
  Music2,
  Plus,
  ShieldCheck,
  Sparkles,
  Video,
  Youtube,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, ApiError, mediaUrl, waitForJob } from "../lib/api";
import type { Job, Project, ProjectListItem } from "../lib/types";
import { cn, formatBytes, formatDate, formatTime, stageLabel } from "../lib/utils";
import { useStudio } from "../store/studio";
import { Dropzone } from "../components/Dropzone";
import { Waveform } from "../components/Waveform";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeading,
  Skeleton,
} from "../components/ui";

function JobRow({
  label,
  job,
  onCancel,
}: {
  label: string;
  job: Job | null;
  onCancel?: () => void;
}) {
  if (!job) return null;
  const done = job.status === "done";
  const failed = job.status === "error" || job.status === "cancelled";
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-white/70">
          {done ? (
            <CheckCircle2 size={13} className="text-emerald-300" />
          ) : failed ? (
            <AlertTriangle size={13} className="text-rose-300" />
          ) : (
            <Activity size={13} className="animate-pulseSoft text-lime" />
          )}
          {label}
        </span>
        <span className="font-mono text-[10px] text-white/35">
          {stageLabel(job.stage)} · {Math.round(job.progress * 100)}%
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar
          value={job.progress}
          tone={failed ? "danger" : done ? "lime" : "accent"}
          height="h-1.5"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="truncate text-[11px] text-white/35">{job.error || job.message}</p>
        {!done && !failed && onCancel && (
          <button
            onClick={onCancel}
            className="shrink-0 text-[10px] font-medium text-rose-300/80 hover:text-rose-200"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectRow({
  item,
  onOpen,
  active,
}: {
  item: ProjectListItem;
  onOpen: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
        active
          ? "border-lime/25 bg-lime/[0.06]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/50">
        <FolderOpen size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white/80">{item.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[10px] text-white/30">
          <Clock3 size={10} />
          {formatDate(item.updated_at)}
          {item.renders > 0 && <span className="text-lime/60">{item.renders} clips</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {item.has_audio && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />}
        {item.has_video && <span className="h-1.5 w-1.5 rounded-full bg-cyan/70" />}
      </div>
    </button>
  );
}

export function SetupScreen() {
  const project = useStudio((state) => state.project);
  const projects = useStudio((state) => state.projects);
  const capabilities = useStudio((state) => state.capabilities);
  const fragment = useStudio((state) => state.fragment);
  const config = useStudio((state) => state.config);
  const notify = useStudio((state) => state.notify);
  const createProject = useStudio((state) => state.createProject);
  const openProject = useStudio((state) => state.openProject);
  const refreshProject = useStudio((state) => state.refreshProject);
  const setFragment = useStudio((state) => state.setFragment);
  const setStep = useStudio((state) => state.setStep);

  const [name, setName] = useState(project?.name || "");
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [audioJob, setAudioJob] = useState<Job | null>(null);
  const [videoJob, setVideoJob] = useState<Job | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [preflight, setPreflight] = useState<Record<string, unknown> | null>(null);
  const [youtubeBusy, setYoutubeBusy] = useState(false);

  useEffect(() => {
    setName(project?.name || "");
  }, [project?.id, project?.name]);

  useEffect(() => {
    if (project?.fragment) {
      setFragment(project.fragment.start, project.fragment.end);
    } else if (project?.audio) {
      setFragment(0, project.audio.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.audio?.path]);

  const audioUrl = useMemo(
    () => (project?.audio ? mediaUrl(project.id, project.audio.path) : ""),
    [project?.id, project?.audio?.path],
  );
  const videoUrl = useMemo(
    () => (project?.video ? mediaUrl(project.id, project.video.path) : ""),
    [project?.id, project?.video?.path],
  );

  const ensureProject = async (): Promise<Project | null> => {
    if (project) return project;
    const created = await createProject(name.trim() || "Mi proyecto");
    if (created) setName(created.name);
    return created;
  };

  const handleAudio = async (file: File) => {
    const target = await ensureProject();
    if (!target) return;
    setAudioUploading(true);
    setAudioProgress(0);
    try {
      await api.uploadAudio(target.id, file, setAudioProgress);
      await openProject(target.id);
      setStep("setup");
      notify("Audio subido y listo para analizar.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setAudioUploading(false);
    }
  };

  const handleVideo = async (file: File) => {
    const target = await ensureProject();
    if (!target) return;
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      await api.uploadVideo(target.id, file, setVideoProgress);
      await openProject(target.id);
      setStep("setup");
      notify("Vídeo subido. Ya puedes analizarlo.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setVideoUploading(false);
    }
  };

  const runJob = async (
    starter: Promise<{ job: Job }>,
    setter: (job: Job) => void,
  ): Promise<Job> => {
    const { job } = await starter;
    setter(job);
    return waitForJob(job.id, setter);
  };

  const analyze = async () => {
    if (!project?.audio || !project?.video) {
      notify("Sube el audio y el vídeo antes de analizar.", "error");
      return;
    }
    setAnalyzing(true);
    try {
      const results = await Promise.allSettled([
        runJob(
          api.analyzeAudio(project.id, fragment.start, fragment.end, true),
          setAudioJob,
        ),
        runJob(
          api.analyzeVideo(project.id, config.format, config.resolution, config.fps, true),
          setVideoJob,
        ),
      ]);
      const failed = results.filter((item) => item.status === "rejected");
      if (failed.length) {
        notify("Algún análisis falló. Revisa el detalle.", "error");
      } else {
        notify("Análisis completado con datos reales.", "success");
      }
      await refreshProject();
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const preflightVideo = async () => {
    if (!rights) {
      notify("Confirma que tienes derechos sobre el vídeo.", "error");
      return;
    }
    setYoutubeBusy(true);
    try {
      const { metadata } = await api.youtubePreflight(youtubeUrl.trim(), rights);
      setPreflight(metadata);
      notify("Metadatos leídos. Revisa el vídeo antes de importarlo.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setYoutubeBusy(false);
    }
  };

  const importVideo = async () => {
    const target = await ensureProject();
    if (!target) return;
    if (!rights) {
      notify("Confirma que tienes derechos sobre el vídeo.", "error");
      return;
    }
    setYoutubeBusy(true);
    try {
      await api.youtubeImport(target.id, youtubeUrl.trim(), rights);
      await openProject(target.id);
      setStep("setup");
      setPreflight(null);
      setYoutubeUrl("");
      notify("Vídeo importado. Úsalo solo si tienes derechos.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setYoutubeBusy(false);
    }
  };

  const canContinue = Boolean(project?.audio && project?.video);
  const audioSummary = project?.analysis_summary.audio;
  const videoSummary = project?.analysis_summary.video;
  const recent = projects.filter((item) => item.id !== project?.id).slice(0, 4);
  const audioReady = Boolean(project?.analysis_ready.audio);
  const videoReady = Boolean(project?.analysis_ready.video);

  return (
    <div className="space-y-7 animate-rise">
      <SectionHeading
        eyebrow="Paso 01 · Fuente"
        title="Tu canción, tu material, tus reglas."
        description="Sube el audio y el vídeo. El fragmento se analiza de verdad en tu equipo: BPM, beats, secciones, escenas y movimiento. Nada se envía a ningún servicio."
        action={
          canContinue ? (
            <Button variant="primary" size="lg" onClick={() => setStep("customize")}>
              Personalizar clips <ArrowRight size={17} />
            </Button>
          ) : (
            <Badge tone="warning">
              <AlertTriangle size={12} /> Falta audio o vídeo
            </Badge>
          )
        }
      />

      {capabilities && !capabilities.filters.ass && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/80">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Tu FFmpeg no tiene el filtro ASS: las letras no se podrán quemar en el vídeo. El resto del render funciona igual.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          {/* Project */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="panel-title mb-2 block">Nombre del proyecto</label>
                <input
                  className="field"
                  value={name}
                  placeholder="Ej. Midnight drive"
                  onChange={(event) => setName(event.target.value)}
                  disabled={Boolean(project)}
                  maxLength={80}
                />
              </div>
              {!project ? (
                <Button
                  variant="accent"
                  onClick={async () => {
                    const created = await createProject(name.trim() || "Mi proyecto");
                    if (created) notify("Proyecto creado. Sube el audio para empezar.", "success");
                  }}
                >
                  <Plus size={15} /> Crear proyecto
                </Button>
              ) : (
                <div className="flex items-center gap-2 pb-1 text-[11px] text-white/35">
                  <CheckCircle2 size={13} className="text-emerald-300" />
                  {project.id}
                </div>
              )}
            </div>
            {!project && (
              <p className="mt-2 text-[11px] text-white/30">
                También puedes soltar un archivo directamente: el proyecto se crea solo.
              </p>
            )}
          </Card>

          {/* Audio */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-lime/20 bg-lime/[0.08] text-lime">
                  <Music2 size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">Música</p>
                  <p className="text-[11px] text-white/35">MP3, WAV, M4A, FLAC, OGG…</p>
                </div>
              </div>
              {project?.audio && <Badge tone="success">Audio listo</Badge>}
            </div>

            <Dropzone
              accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.aif,audio/*"
              onFile={handleAudio}
              title="Arrastra tu canción aquí"
              hint="Hasta 600 MB · se queda en tu disco"
              icon={<Disc3 size={20} />}
              disabled={audioUploading}
              busy={audioUploading}
              progress={audioProgress}
              fileName={project?.audio?.filename}
            />

            {project?.audio && audioUrl && (
              <div className="mt-4">
                <Waveform
                  url={audioUrl}
                  start={fragment.start}
                  end={fragment.end}
                  duration={project.audio.duration}
                  onChange={setFragment}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[11px] text-white/40">
                    Inicio
                    <input
                      type="number"
                      min={0}
                      max={project.audio.duration}
                      step={0.1}
                      value={fragment.start}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setFragment(
                          Math.max(0, Math.min(value, fragment.end - 1)),
                          fragment.end,
                        );
                      }}
                      className="field mt-1 py-1.5 text-xs"
                    />
                  </label>
                  <label className="text-[11px] text-white/40">
                    Fin
                    <input
                      type="number"
                      min={0}
                      max={project.audio.duration}
                      step={0.1}
                      value={fragment.end}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setFragment(
                          fragment.start,
                          Math.min(project.audio!.duration, Math.max(value, fragment.start + 1)),
                        );
                      }}
                      className="field mt-1 py-1.5 text-xs"
                    />
                  </label>
                  <div className="text-[11px] text-white/40">
                    Duración
                    <div className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-mono text-xs text-lime/90">
                      {formatTime(fragment.end - fragment.start, true)}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/40">
                    Archivo
                    <div className="mt-1 truncate rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/60">
                      {formatBytes(project.audio.size)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {audioSummary && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">BPM</p>
                  <p className="font-mono text-lg font-semibold text-lime">
                    {Math.round(audioSummary.bpm)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Beats</p>
                  <p className="font-mono text-lg font-semibold text-white/80">
                    {audioSummary.beats}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Eventos</p>
                  <p className="font-mono text-lg font-semibold text-white/80">
                    {audioSummary.events}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Secciones</p>
                  <p className="font-mono text-lg font-semibold text-white/80">
                    {audioSummary.sections.length}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Video */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/[0.08] text-cyan">
                  <Film size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">Vídeo de origen</p>
                  <p className="text-[11px] text-white/35">MP4, MOV, MKV, WEBM, AVI…</p>
                </div>
              </div>
              {project?.video && <Badge tone="success">Vídeo listo</Badge>}
            </div>

            <Dropzone
              accept=".mp4,.mov,.mkv,.webm,.avi,.m4v,.mpeg,.mpg,.wmv,video/*"
              onFile={handleVideo}
              title="Arrastra el vídeo que tienes derecho a usar"
              hint="Hasta 600 MB · se normaliza una sola vez"
              icon={<Video size={20} />}
              disabled={videoUploading}
              busy={videoUploading}
              progress={videoProgress}
              fileName={project?.video?.filename}
            />

            {project?.video && videoUrl && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <video
                  src={videoUrl}
                  className="h-32 w-full rounded-xl border border-white/10 object-cover sm:w-52"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="min-w-0 flex-1 space-y-1.5 text-[11px] text-white/45">
                  <p>
                    <span className="text-white/30">
                      {project.video.source_width ? "Resolución original" : "Resolución del máster"}
                    </span>{" "}
                    {project.video.source_width ?? project.video.width}×
                    {project.video.source_height ?? project.video.height} ·{" "}
                    {(project.video.source_fps ?? project.video.fps).toFixed(0)} fps
                  </p>
                  <p>
                    <span className="text-white/30">Duración</span>{" "}
                    {formatTime(project.video.duration)} · {formatBytes(project.video.size)}
                  </p>
                  <p>
                    <span className="text-white/30">Origen</span>{" "}
                    {project.video.source_kind === "youtube" ? "YouTube autorizado" : "Archivo local"}
                  </p>
                  {videoSummary && (
                    <p className="text-cyan/80">
                      {videoSummary.scenes} escenas detectadas · {videoSummary.width}×
                      {videoSummary.height} máster
                    </p>
                  )}
                  {project.video.attribution?.url && (
                    <p className="truncate text-white/30">
                      {project.video.attribution.title} · {project.video.attribution.uploader}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015]">
              <button
                onClick={() => setYoutubeOpen((value) => !value)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <span className="inline-flex items-center gap-2 text-xs font-medium text-white/55">
                  <Youtube size={14} className="text-rose-300" />
                  Importar desde YouTube (solo material autorizado)
                </span>
                <span className="text-[10px] text-white/25">
                  {capabilities?.youtube_available ? (youtubeOpen ? "Ocultar" : "Abrir") : "No disponible"}
                </span>
              </button>
              {youtubeOpen && (
                <div className="space-y-3 border-t border-white/[0.06] px-3.5 py-3">
                  {!capabilities?.youtube_available && (
                    <p className="text-[11px] text-amber-200/80">
                      yt-dlp no está instalado. Usa la subida local de vídeo.
                    </p>
                  )}
                  <input
                    className="field text-xs"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                  />
                  <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-white/50">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(event) => setRights(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-lime"
                    />
                    <span>
                      Confirmo que tengo derechos o permiso para usar este material. La herramienta no
                      aloja ni distribuye contenido de terceros.
                    </span>
                  </label>
                  {preflight && (
                    <div className="rounded-lg border border-cyan/20 bg-cyan/[0.05] px-3 py-2 text-[11px] text-cyan/80">
                      <p className="font-medium text-cyan">{String(preflight.title || "Vídeo")}</p>
                      <p className="text-white/40">
                        {String(preflight.uploader || "")} ·{" "}
                        {formatTime(Number(preflight.duration || 0))}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={preflightVideo}
                      loading={youtubeBusy && !preflight}
                      disabled={!capabilities?.youtube_available || !youtubeUrl || !rights}
                    >
                      <ShieldCheck size={13} /> Comprobar
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={importVideo}
                      loading={youtubeBusy && Boolean(preflight)}
                      disabled={!capabilities?.youtube_available || !preflight}
                    >
                      <Youtube size={13} /> Importar vídeo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Analysis */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white/90">Análisis real</p>
                <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/35">
                  Detecta BPM, beats, onsets, secciones y drops con librosa. En vídeo, escenas con
                  PySceneDetect y métricas de movimiento, luz y nitidez con OpenCV.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={analyze}
                loading={analyzing}
                disabled={!project?.audio || !project?.video}
              >
                <Sparkles size={15} /> {audioReady && videoReady ? "Reanalizar" : "Analizar ahora"}
              </Button>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <JobRow
                label="Música"
                job={audioJob}
                onCancel={audioJob ? () => api.cancelJob(audioJob.id).catch(() => undefined) : undefined}
              />
              <JobRow
                label="Vídeo"
                job={videoJob}
                onCancel={videoJob ? () => api.cancelJob(videoJob.id).catch(() => undefined) : undefined}
              />
              {!audioJob && !videoJob && (
                <div className="sm:col-span-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-[11px] text-white/30">
                  Aún no has analizado. Puedes generar directamente: el análisis se ejecutará antes de
                  planificar.
                </div>
              )}
            </div>
            {(audioReady || videoReady) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {audioReady && (
                  <Badge tone="success">
                    <CheckCircle2 size={11} /> Audio analizado
                  </Badge>
                )}
                {videoReady && (
                  <Badge tone="success">
                    <CheckCircle2 size={11} /> Vídeo analizado
                  </Badge>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="panel-title">Proyectos recientes</p>
              <FolderOpen size={14} className="text-white/25" />
            </div>
            <div className="mt-3 space-y-2">
              {recent.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-white/30">
                  No hay otros proyectos. Este es tu punto de partida.
                </p>
              )}
              {recent.map((item) => (
                <ProjectRow
                  key={item.id}
                  item={item}
                  active={false}
                  onOpen={() => openProject(item.id)}
                />
              ))}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="panel-title">Cómo funciona</p>
            <ol className="mt-3 space-y-3">
              {[
                ["01", "Sube audio y vídeo", "Se guardan en projects/<id>/source, en tu disco."],
                ["02", "Elige el fragmento", "La onda y la selección definen el clip."],
                ["03", "Analiza de verdad", "BPM y escenas reales, sin datos inventados."],
                ["04", "Personaliza y renderiza", "FFmpeg produce MP4 H.264 con audio AAC."],
              ].map(([num, title, text]) => (
                <li key={num} className="flex gap-3">
                  <span className="mt-0.5 font-mono text-[10px] text-lime/70">{num}</span>
                  <div>
                    <p className="text-xs font-medium text-white/75">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="panel-title">Sistema</p>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-white/45">
                <span>FFmpeg</span>
                <span className="max-w-[150px] truncate text-right text-white/30">
                  {capabilities?.ffmpeg?.replace("ffmpeg version ", "") || "Comprobando…"}
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span>Encoder H.264</span>
                <span className="text-emerald-300/80">
                  {capabilities?.encoders.libx264 ? "disponible" : "no disponible"}
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span>QSV (opcional)</span>
                <span className={capabilities?.encoders.h264_qsv ? "text-emerald-300/80" : "text-white/25"}>
                  {capabilities?.encoders.h264_qsv ? "disponible" : "no detectado"}
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span>Whisper</span>
                <span className={capabilities?.extras.faster_whisper ? "text-emerald-300/80" : "text-white/25"}>
                  {capabilities?.extras.faster_whisper ? "instalado" : "opcional"}
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span>Espacio libre</span>
                <span className="text-white/30">{capabilities?.disk.free_gb ?? "—"} GB</span>
              </div>
            </div>
          </Card>

          {!project && (
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[11px] text-white/35">
                <Skeleton className="h-2 w-2 rounded-full" />
                Crea un proyecto o suelta un archivo para empezar.
              </div>
            </Card>
          )}
        </div>
      </div>

      {!canContinue && project && (
        <EmptyState
          icon={<Film size={20} />}
          title="Falta una de las dos fuentes"
          description="Necesitas audio y vídeo para generar clips. El vídeo debe ser material propio o que tengas derecho a usar."
        />
      )}
    </div>
  );
}
