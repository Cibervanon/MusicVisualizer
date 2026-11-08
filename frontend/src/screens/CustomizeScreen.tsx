import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  Cpu,
  Film,
  Gauge,
  Layers,
  Minus,
  MonitorPlay,
  Plus,
  Rocket,
  Sparkles,
  Timer,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "../lib/api";
import type { Format, LyricsLine, LyricsStyle, Quality, Resolution } from "../lib/types";
import { cn, formatBytes, targetDims } from "../lib/utils";
import { useStudio } from "../store/studio";
import { LyricsEditor } from "../components/LyricsEditor";
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  SectionHeading,
} from "../components/ui";

const FORMATS: Array<{ id: Format; label: string; hint: string }> = [
  { id: "9:16", label: "Vertical", hint: "Reels · TikTok · Shorts" },
  { id: "1:1", label: "Cuadrado", hint: "Feed clásico" },
  { id: "16:9", label: "Horizontal", hint: "YouTube · web" },
  { id: "4:5", label: "Retrato", hint: "Instagram feed" },
];

const RESOLUTIONS: Resolution[] = ["720p", "1080p", "1440p"];
const QUALITIES: Array<{ id: Quality; label: string; hint: string }> = [
  { id: "fast", label: "Rápida", hint: "CRF 22 · veryfast" },
  { id: "balanced", label: "Equilibrada", hint: "CRF 20 · veryfast" },
  { id: "high", label: "Alta", hint: "CRF 18 · medium" },
];

const BITRATE_MBPS: Record<Quality, number> = { fast: 4, balanced: 6, high: 10 };

export function CustomizeScreen() {
  const project = useStudio((state) => state.project);
  const styles = useStudio((state) => state.styles);
  const lyricPresets = useStudio((state) => state.lyricPresets);
  const animations = useStudio((state) => state.animations);
  const fonts = useStudio((state) => state.fonts);
  const config = useStudio((state) => state.config);
  const fragment = useStudio((state) => state.fragment);
  const capabilities = useStudio((state) => state.capabilities);
  const setConfig = useStudio((state) => state.setConfig);
  const setStep = useStudio((state) => state.setStep);
  const setJob = useStudio((state) => state.setJob);
  const notify = useStudio((state) => state.notify);

  const [lines, setLines] = useState<LyricsLine[]>([]);
  const [lyricsStyle, setLyricsStyle] = useState<LyricsStyle | null>(null);
  const [lyricsEnabled, setLyricsEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!project) return;
    setLines(project.lyrics.lines || []);
    setLyricsStyle(project.lyrics.style);
    setLyricsEnabled(project.lyrics.enabled);
  }, [project?.id, project?.lyrics.updated_at]);

  useEffect(() => {
    if (!styles.length) return;
    if (config.styles.length === 0) {
      setConfig({ styles: styles.slice(0, 3).map((style) => style.id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles.length]);

  const [outWidth, outHeight] = useMemo(
    () => targetDims(config.format, config.resolution),
    [config.format, config.resolution],
  );

  const toggleStyle = (id: string) => {
    const has = config.styles.includes(id);
    if (has && config.styles.length === 1) {
      notify("Debe haber al menos un estilo seleccionado.", "info");
      return;
    }
    setConfig({
      styles: has ? config.styles.filter((item) => item !== id) : [...config.styles, id],
    });
  };

  const generate = async () => {
    if (!project) return;
    if (!project.audio || !project.video) {
      notify("Faltan el audio o el vídeo.", "error");
      return;
    }
    const chosen = config.styles.length ? config.styles : styles.slice(0, 3).map((style) => style.id);
    if (!chosen.length) {
      notify("Elige al menos un estilo.", "error");
      return;
    }
    setGenerating(true);
    try {
      await api.configure({
        project_id: project.id,
        count: config.count,
        duration: Math.max(3, fragment.end - fragment.start),
        format: config.format,
        resolution: config.resolution,
        fps: config.fps,
        quality: config.quality,
        encoder: config.encoder,
        seed: config.seed,
        styles: chosen,
      });
      if (lyricsStyle) {
        await api.updateLyrics({
          project_id: project.id,
          lines,
          source: project.lyrics.source || "manual",
          style: lyricsStyle as unknown as Record<string, unknown>,
          enabled: lyricsEnabled,
        });
      }
      const { job } = await api.generate({
        project_id: project.id,
        count: config.count,
        duration: Math.max(3, fragment.end - fragment.start),
        format: config.format,
        resolution: config.resolution,
        fps: config.fps,
        quality: config.quality,
        encoder: config.encoder,
        seed: config.seed,
        styles: chosen,
        lyrics: lyricsStyle
          ? {
              enabled: lyricsEnabled,
              style: lyricsStyle as unknown as Record<string, unknown>,
            }
          : null,
      });
      setJob(job);
      setStep("generating");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const duration = Math.max(0, fragment.end - fragment.start);
  const estimatedBytes =
    ((BITRATE_MBPS[config.quality] * 1_000_000) / 8) * duration * config.count * 1.06;
  const styleRepeat = config.count > config.styles.length && config.styles.length > 0;

  if (!project) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-white/60">Crea un proyecto y sube las fuentes primero.</p>
        <Button className="mt-4" variant="ghost" onClick={() => setStep("setup")}>
          <ArrowLeft size={15} /> Volver a fuente
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-7 animate-rise">
      <SectionHeading
        eyebrow="Paso 02 · Personalizar"
        title="Diseña la tanda. El motor hace el resto."
        description="Cada clip se planifica sobre los beats reales y las escenas detectadas. Elige formatos, estilos y letras; el render es un MP4 real, no una simulación."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("setup")}>
              <ArrowLeft size={15} /> Fuente
            </Button>
            <Button variant="primary" size="lg" onClick={generate} loading={generating}>
              <Rocket size={16} /> Generar {config.count} clip{config.count === 1 ? "" : "s"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* Format */}
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <MonitorPlay size={16} className="text-lime" />
              <p className="text-sm font-semibold text-white/90">Formato y calidad</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {FORMATS.map((format) => {
                const active = config.format === format.id;
                return (
                  <button
                    key={format.id}
                    onClick={() => setConfig({ format: format.id })}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition",
                      active
                        ? "border-lime/40 bg-lime/[0.07]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                    )}
                  >
                    <span className="flex h-10 items-center justify-center">
                      <span
                        className={cn(
                          "block rounded border-2 transition",
                          active ? "border-lime" : "border-white/25 group-hover:border-white/50",
                        )}
                        style={{
                          width: format.id === "9:16" ? 18 : format.id === "16:9" ? 38 : 28,
                          height: format.id === "16:9" ? 22 : format.id === "4:5" ? 35 : format.id === "1:1" ? 28 : 32,
                        }}
                      />
                    </span>
                    <span className="text-center">
                      <span className="block text-[11px] font-semibold text-white/80">
                        {format.label}
                      </span>
                      <span className="block text-[9px] text-white/30">{format.id}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="panel-title mb-2">Resolución</p>
                <div className="flex gap-1.5">
                  {RESOLUTIONS.map((resolution) => (
                    <button
                      key={resolution}
                      onClick={() => setConfig({ resolution })}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition",
                        config.resolution === resolution
                          ? "border-cyan/35 bg-cyan/[0.08] text-cyan"
                          : "border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/20",
                      )}
                    >
                      {resolution}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-white/25">
                  Salida {outWidth}×{outHeight} · {config.fps} fps
                </p>
              </div>
              <div>
                <p className="panel-title mb-2">Fotogramas por segundo</p>
                <div className="flex gap-1.5">
                  {([24, 25, 30, 60] as const).map((fps) => (
                    <button
                      key={fps}
                      onClick={() => setConfig({ fps })}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition",
                        config.fps === fps
                          ? "border-cyan/35 bg-cyan/[0.08] text-cyan"
                          : "border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/20",
                      )}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-white/25">
                  Más fps = más fluidez y más tiempo de render.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="panel-title mb-2">Calidad de encode</p>
                <div className="space-y-1.5">
                  {QUALITIES.map((quality) => (
                    <button
                      key={quality.id}
                      onClick={() => setConfig({ quality: quality.id })}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                        config.quality === quality.id
                          ? "border-lime/30 bg-lime/[0.06]"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-white/20",
                      )}
                    >
                      <span className="text-xs font-medium text-white/75">{quality.label}</span>
                      <span className="font-mono text-[10px] text-white/30">{quality.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="panel-title mb-2">Encoder</p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setConfig({ encoder: "cpu" })}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                      config.encoder === "cpu"
                        ? "border-lime/30 bg-lime/[0.06]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/20",
                    )}
                  >
                    <Cpu size={15} className="text-white/50" />
                    <span className="flex-1">
                      <span className="block text-xs font-medium text-white/75">CPU · libx264</span>
                      <span className="block text-[10px] text-white/30">Compatible siempre</span>
                    </span>
                    {config.encoder === "cpu" && <Check size={14} className="text-lime" />}
                  </button>
                  <button
                    onClick={() => setConfig({ encoder: "qsv" })}
                    disabled={!capabilities?.encoders.h264_qsv}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                      config.encoder === "qsv"
                        ? "border-lime/30 bg-lime/[0.06]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/20",
                      !capabilities?.encoders.h264_qsv && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <Zap size={15} className="text-white/50" />
                    <span className="flex-1">
                      <span className="block text-xs font-medium text-white/75">QSV · Intel</span>
                      <span className="block text-[10px] text-white/30">
                        {capabilities?.encoders.h264_qsv
                          ? "Con fallback automático a CPU"
                          : "No detectado en este equipo"}
                      </span>
                    </span>
                    {config.encoder === "qsv" && <Check size={14} className="text-lime" />}
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Count */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Layers size={16} className="text-accent" />
                <div>
                  <p className="text-sm font-semibold text-white/90">Número de clips</p>
                  <p className="text-[11px] text-white/35">
                    Se generan versiones distintas con semillas y estilos diferentes.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfig({ count: Math.max(1, config.count - 1) })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]"
                  aria-label="Menos clips"
                >
                  <Minus size={15} />
                </button>
                <span className="w-10 text-center font-mono text-2xl font-semibold text-lime">
                  {config.count}
                </span>
                <button
                  onClick={() => setConfig({ count: Math.min(10, config.count + 1) })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]"
                  aria-label="Más clips"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar value={config.count / 10} tone="accent" height="h-1.5" />
            </div>
          </Card>

          {/* Styles */}
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Wand2 size={16} className="text-lime" />
                <div>
                  <p className="text-sm font-semibold text-white/90">Estilos de montaje</p>
                  <p className="text-[11px] text-white/35">
                    Cada estilo define ritmo, cortes, transiciones y grade reales.
                  </p>
                </div>
              </div>
              <Badge tone="accent">{config.styles.length} seleccionados</Badge>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {styles.map((style) => {
                const active = config.styles.includes(style.id);
                return (
                  <button
                    key={style.id}
                    onClick={() => toggleStyle(style.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border p-3 text-left transition",
                      active
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ background: active ? style.accent : "transparent" }}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-white/85">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: style.accent }}
                          />
                          {style.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/40">{style.tagline}</p>
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                          active
                            ? "border-lime bg-lime text-ink-950"
                            : "border-white/15 text-transparent group-hover:border-white/35",
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="chip">{style.transition}</span>
                      <span className="chip">
                        {style.density_min.toFixed(1)}–{style.density_max.toFixed(1)} c/s
                      </span>
                      <span className="chip">{style.max_shot.toFixed(1)}s max</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {styleRepeat && (
              <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200/70">
                Has pedido {config.count} clips con {config.styles.length} estilos: los estilos se
                repetirán en ciclo con semillas distintas.
              </p>
            )}
          </Card>

          {/* Lyrics */}
          <Card className="p-4 sm:p-5">
            {lyricsStyle ? (
              <LyricsEditor
                projectId={project.id}
                duration={duration}
                lines={lines}
                style={lyricsStyle}
                enabled={lyricsEnabled}
                presets={lyricPresets}
                animations={animations}
                fonts={fonts}
                onChangeLines={setLines}
                onChangeStyle={setLyricsStyle}
                onChangeEnabled={setLyricsEnabled}
              />
            ) : (
              <p className="text-xs text-white/35">Cargando editor de letras…</p>
            )}
          </Card>
        </div>

        {/* Summary rail */}
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card strong className="overflow-hidden">
            <div className="border-b border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent px-5 py-4">
              <p className="panel-title">Resumen de la tanda</p>
              <p className="mt-1 font-display text-xl font-semibold text-white">
                {config.count} clip{config.count === 1 ? "" : "s"} · {config.format}
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Timer size={13} /> Fragmento
                </span>
                <span className="font-mono text-white/75">{duration.toFixed(2)} s</span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <MonitorPlay size={13} /> Salida
                </span>
                <span className="font-mono text-white/75">
                  {outWidth}×{outHeight} · {config.fps}fps
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Gauge size={13} /> Calidad
                </span>
                <span className="text-white/75">{config.quality}</span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Clapperboard size={13} /> Estilos
                </span>
                <span className="text-white/75">{config.styles.length}</span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={13} /> Letras
                </span>
                <span className={lyricsEnabled ? "text-lime" : "text-white/30"}>
                  {lyricsEnabled ? `${lines.length} líneas` : "desactivadas"}
                </span>
              </div>
              <div className="flex items-center justify-between text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Film size={13} /> Peso estimado
                </span>
                <span className="font-mono text-white/60">{formatBytes(estimatedBytes)}</span>
              </div>
            </div>
            <div className="space-y-2 border-t border-white/[0.07] px-5 py-4">
              <Button variant="primary" className="w-full" onClick={generate} loading={generating}>
                <Rocket size={16} /> Generar ahora
              </Button>
              <p className="text-center text-[10px] leading-relaxed text-white/25">
                El render usa FFmpeg en tu equipo. Tiempo aproximado:{" "}
                {Math.max(1, Math.round((duration * config.count) / 8))}–{Math.max(2, Math.round((duration * config.count) / 3))} min.
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <AudioLines size={13} className="text-lime/70" />
              {project.analysis_summary.audio
                ? `${Math.round(project.analysis_summary.audio.bpm)} BPM · ${project.analysis_summary.audio.beats} beats detectados`
                : "El audio se analizará antes de planificar."}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/40">
              <Clapperboard size={13} className="text-cyan/70" />
              {project.analysis_summary.video
                ? `${project.analysis_summary.video.scenes} escenas · ${project.analysis_summary.video.width}×${project.analysis_summary.video.height} máster`
                : "El vídeo se normalizará y analizará antes de planificar."}
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-white/30">
              <ArrowRight size={11} className="mr-1 inline" />
              La generación crea un EDL por clip con cortes anclados a beats, elige escenas por
              movimiento y calidad, y renderiza cada versión por separado.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
