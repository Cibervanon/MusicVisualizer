import {
  ArrowLeft,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Eye,
  Film,
  History,
  Loader2,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  SlidersHorizontal,
  Split,
  Trash2,
  Undo2,
  Volume2,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, downloadUrl, mediaUrl, waitForJob } from "../lib/api";
import { moveSegment, reflowSegments, splitSegmentAt } from "../lib/edit";
import type {
  EDL,
  Job,
  LyricsLine,
  LyricsStyle,
  RenderInfo,
  Segment,
} from "../lib/types";
import { clamp, cn, formatBytes, formatTime, stageLabel } from "../lib/utils";
import { useStudio } from "../store/studio";
import { LyricsEditor } from "../components/LyricsEditor";
import { Timeline } from "../components/Timeline";
import {
  Badge,
  Button,
  Card,
  LabeledSlider,
  ProgressBar,
  SectionHeading,
  Skeleton,
} from "../components/ui";

interface Doc {
  segments: Segment[];
  grade: Record<string, number>;
  effects: Record<string, number>;
  volume: number;
}

function docFromEdit(edit: EDL): Doc {
  return {
    segments: edit.segments.map((segment) => ({ ...segment })),
    grade: { ...edit.grade },
    effects: { ...edit.effects },
    volume: edit.volume ?? 1,
  };
}

type Tab = "timeline" | "effects" | "lyrics";

export function EditorScreen() {
  const project = useStudio((state) => state.project);
  const selectedEditId = useStudio((state) => state.selectedEditId);
  const setSelectedEdit = useStudio((state) => state.setSelectedEdit);
  const setStep = useStudio((state) => state.setStep);
  const refreshProject = useStudio((state) => state.refreshProject);
  const notify = useStudio((state) => state.notify);
  const lyricPresets = useStudio((state) => state.lyricPresets);
  const animations = useStudio((state) => state.animations);
  const fonts = useStudio((state) => state.fonts);

  const [edit, setEdit] = useState<EDL | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<Tab>("timeline");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renderJob, setRenderJob] = useState<Job | null>(null);
  const [renderingType, setRenderingType] = useState<"preview" | "final" | null>(null);
  const [rendered, setRendered] = useState<RenderInfo | null>(null);
  const [lyricsLines, setLyricsLines] = useState<LyricsLine[]>([]);
  const [lyricsStyle, setLyricsStyle] = useState<LyricsStyle | null>(null);
  const [lyricsEnabled, setLyricsEnabled] = useState(false);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;

  // choose an edit
  useEffect(() => {
    if (!project) return;
    if (!selectedEditId && project.edits[0]) {
      setSelectedEdit(project.edits[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const editId = selectedEditId || project?.edits[0]?.id || null;

  useEffect(() => {
    if (!project || !editId) return;
    let cancelled = false;
    setLoading(true);
    api
      .getEdit(project.id, editId)
      .then(({ edit: loaded }) => {
        if (cancelled) return;
        const initial = docFromEdit(loaded);
        setEdit(loaded);
        setDoc(initial);
        setBaseline(JSON.stringify(initial));
        setPast([]);
        setFuture([]);
        setSelectedIndex(0);
        setPlayhead(0);
      })
      .catch((error) => notify((error as ApiError).message, "error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, editId]);

  // lyrics
  useEffect(() => {
    if (!project) return;
    setLyricsLines(project.lyrics.lines || []);
    setLyricsStyle(project.lyrics.style);
    setLyricsEnabled(project.lyrics.enabled);
  }, [project?.id, project?.lyrics.updated_at]);

  // existing render for this edit
  useEffect(() => {
    if (!project || !edit) return;
    const preview = project.renders.find(
      (render) => render.edit_id === edit.id && render.type === "preview",
    );
    const final = project.renders.find(
      (render) => render.edit_id === edit.id && render.type === "final",
    );
    setRendered((current) => current && current.edit_id === edit.id ? current : preview || final || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.id, project?.renders]);

  // video source: preview/final render if available, otherwise the normalized master
  useEffect(() => {
    if (!project || !edit) return;
    const path = rendered?.path || edit.master;
    setVideoSrc(mediaUrl(project.id, path));
  }, [project?.id, edit?.master, rendered?.path]);

  const masterDuration = Number(project?.analysis_summary.video?.duration || edit?.duration || 30);
  const duration = edit?.duration || 30;
  const accent = edit?.style === "flash" ? "#FFFFFF" : "#D6FF3D";

  const pushHistory = () => {
    const current = docRef.current;
    if (!current) return;
    setPast((items) => [...items.slice(-39), JSON.parse(JSON.stringify(current)) as Doc]);
    setFuture([]);
  };

  const updateDoc = (next: Doc) => setDoc(next);

  const setSegments = (segments: Segment[]) => {
    const current = docRef.current;
    if (!current) return;
    updateDoc({ ...current, segments: reflowSegments(segments, duration, masterDuration) });
  };

  const undo = () => {
    if (!past.length || !doc) return;
    const previous = past[past.length - 1];
    setFuture((items) => [JSON.parse(JSON.stringify(doc)) as Doc, ...items]);
    setPast((items) => items.slice(0, -1));
    setDoc(previous);
  };

  const redo = () => {
    if (!future.length || !doc) return;
    const next = future[0];
    setPast((items) => [...items, JSON.parse(JSON.stringify(doc)) as Doc]);
    setFuture((items) => items.slice(1));
    setDoc(next);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const dirty = useMemo(
    () => Boolean(doc && baseline && JSON.stringify(doc) !== baseline),
    [doc, baseline],
  );

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const save = async (silent = false): Promise<EDL | null> => {
    if (!project || !edit || !doc) return null;
    setSaving(true);
    try {
      const { edit: updated } = await api.patchEdit(project.id, edit.id, {
        segments: doc.segments,
        grade: doc.grade,
        effects: doc.effects,
        volume: doc.volume,
      });
      const fresh = docFromEdit(updated);
      setEdit(updated);
      setDoc(fresh);
      setBaseline(JSON.stringify(fresh));
      setPast([]);
      setFuture([]);
      await refreshProject();
      if (!silent) notify("Montaje guardado. Ya puedes renderizar.", "success");
      return updated;
    } catch (error) {
      notify((error as ApiError).message, "error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const doRender = async (preview: boolean) => {
    if (!project || !edit) return;
    setRenderingType(preview ? "preview" : "final");
    try {
      const saved = await save(true);
      if (!saved) return;
      const { job } = await api.render({
        project_id: project.id,
        edit_id: saved.id,
        preview,
        quality: project.config.quality,
        encoder: project.config.encoder,
      });
      setRenderJob(job);
      const final = await waitForJob(job.id, setRenderJob);
      if (final.status !== "done") {
        throw new ApiError(final.error || "El render no terminó correctamente.", "render_error");
      }
      await refreshProject();
      const result = final.result?.render || null;
      if (result) setRendered(result);
      notify(
        preview ? "Preview renderizada con los cambios." : "Clip final renderizado y validado.",
        "success",
      );
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setRenderingType(null);
      setRenderJob(null);
    }
  };

  const saveLyrics = async () => {
    if (!project || !lyricsStyle) return;
    setSavingLyrics(true);
    try {
      await api.updateLyrics({
        project_id: project.id,
        lines: lyricsLines,
        source: project.lyrics.source || "manual",
        style: lyricsStyle as unknown as Record<string, unknown>,
        enabled: lyricsEnabled,
      });
      await refreshProject();
      notify("Letras guardadas. Se quemarán en el próximo render.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setSavingLyrics(false);
    }
  };

  const selected = doc?.segments[selectedIndex] || null;

  const updateSelected = (patch: Partial<Segment>) => {
    if (!doc || !selected) return;
    const next = doc.segments.map((segment, index) =>
      index === selectedIndex ? { ...segment, ...patch } : segment,
    );
    setSegments(next);
  };

  const removeSelected = () => {
    if (!doc || !selected || doc.segments.length <= 1) {
      notify("El montaje debe conservar al menos un segmento.", "info");
      return;
    }
    pushHistory();
    setSegments(doc.segments.filter((_, index) => index !== selectedIndex));
    setSelectedIndex((index) => Math.max(0, index - 1));
  };

  const splitSelected = () => {
    if (!doc || !selected) return;
    if (playhead <= selected.timeline_start || playhead >= selected.timeline_end) {
      notify("Mueve el cursor dentro del segmento seleccionado para dividirlo.", "info");
      return;
    }
    pushHistory();
    setSegments(splitSegmentAt(doc.segments, selectedIndex, playhead));
  };

  const duplicateSelected = () => {
    if (!doc || !selected) return;
    pushHistory();
    const copy = { ...selected };
    const next = [...doc.segments];
    next.splice(selectedIndex + 1, 0, copy);
    setSegments(next);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!doc || !selected) return;
    pushHistory();
    setSegments(moveSegment(doc.segments, selectedIndex, direction));
    setSelectedIndex((index) => clamp(index + direction, 0, doc.segments.length - 1));
  };

  const resetEffects = () => {
    if (!doc) return;
    pushHistory();
    updateDoc({
      ...doc,
      volume: 1,
      effects: { sharpen: 0, vignette: 0, grain: 0, glow: 0, rgb_split: 0 },
    });
    notify("Efectos restablecidos a neutro.", "info");
  };

  const allowed = (name: string) => !edit?.allowed_effects?.length || edit.allowed_effects.includes(name);

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

  if (loading || !edit || !doc) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-[360px] w-full" />
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const usingRender = Boolean(rendered);
  const renderBusy = renderingType !== null;
  const edits = project.edits;

  return (
    <div className="space-y-6 animate-rise">
      <SectionHeading
        eyebrow="Paso 05 · Editor"
        title={`${edit.style_name} · ${formatTime(duration)}`}
        description="Ajusta cortes, efectos y letras sobre el EDL real. Guarda, previsualiza a media resolución y renderiza el MP4 final."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={undo}
                disabled={!past.length}
                className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                title="Deshacer (Ctrl+Z)"
              >
                <Undo2 size={15} />
              </button>
              <button
                onClick={redo}
                disabled={!future.length}
                className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                title="Rehacer (Ctrl+Y)"
              >
                <Redo2 size={15} />
              </button>
            </div>
            <Button variant="ghost" onClick={() => save()} loading={saving} disabled={!dirty}>
              <Save size={15} /> {dirty ? "Guardar" : "Guardado"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => doRender(true)}
              loading={renderingType === "preview"}
              disabled={renderBusy}
            >
              <Eye size={15} /> Preview
            </Button>
            <Button
              variant="primary"
              onClick={() => doRender(false)}
              loading={renderingType === "final"}
              disabled={renderBusy}
            >
              <Download size={15} /> Render final
            </Button>
          </div>
        }
      />

      {edits.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {edits.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedEdit(item.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition",
                item.id === edit.id
                  ? "border-lime/35 bg-lime/[0.08] text-lime"
                  : "border-white/10 bg-white/[0.02] text-white/45 hover:border-white/25 hover:text-white/75",
              )}
            >
              {item.style_name}
              <span className="ml-1.5 text-white/25">{item.segments} cortes</span>
            </button>
          ))}
        </div>
      )}

      {/* Preview + timeline */}
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_300px]">
          <div className="relative flex min-h-[280px] items-center justify-center bg-black/50 p-3">
            <video
              ref={videoRef}
              key={videoSrc}
              src={videoSrc}
              className="max-h-[46vh] w-full rounded-lg object-contain"
              controls
              playsInline
              onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = 0;
              }}
            />
            <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
              <Badge tone={usingRender ? "success" : "warning"}>
                {usingRender ? (
                  <>
                    <Check size={10} /> {rendered?.type === "preview" ? "preview real" : "render final"}
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
                Estás viendo el máster normalizado. Renderiza una preview para ver el montaje real.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-white/[0.06] p-4 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between">
              <p className="panel-title">Reproducción</p>
              <button
                onClick={togglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-lime/30 bg-lime/10 text-lime transition hover:bg-lime/20"
                aria-label={playing ? "Pausa" : "Play"}
              >
                {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
              </button>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-2xl font-semibold text-white">{formatTime(playhead, true)}</span>
              <span className="text-xs text-white/30">/ {formatTime(duration)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-white/30">Segmentos</p>
                <p className="font-mono text-white/80">{doc.segments.length}</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-white/30">Cortes/s</p>
                <p className="font-mono text-white/80">
                  {(doc.segments.length / Math.max(0.1, duration)).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-white/30">Escenas</p>
                <p className="font-mono text-white/80">
                  {new Set(doc.segments.map((segment) => segment.scene_id)).size}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-white/30">Salida</p>
                <p className="font-mono text-white/80">
                  {edit.width}×{edit.height}
                </p>
              </div>
            </div>
            {rendered && (
              <a
                href={downloadUrl(project.id, rendered.id)}
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

        <div className="border-t border-white/[0.06] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="panel-title">Timeline</p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="quiet" onClick={splitSelected} title="Dividir en el cursor">
                <Split size={13} /> Dividir
              </Button>
              <Button size="sm" variant="quiet" onClick={duplicateSelected}>
                <Copy size={13} /> Duplicar
              </Button>
              <Button size="sm" variant="quiet" onClick={removeSelected}>
                <Trash2 size={13} /> Eliminar
              </Button>
            </div>
          </div>
          <Timeline
            segments={doc.segments}
            duration={duration}
            masterDuration={masterDuration}
            playhead={playhead}
            selectedIndex={selectedIndex}
            accent={accent}
            onSelect={setSelectedIndex}
            onSeek={(time) => {
              setPlayhead(time);
              if (videoRef.current) videoRef.current.currentTime = time;
            }}
            onBeginInteraction={pushHistory}
            onChange={setSegments}
          />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
            {(
              [
                ["timeline", "Montaje", <Scissors key="t" size={14} />],
                ["effects", "Efectos", <SlidersHorizontal key="e" size={14} />],
                ["lyrics", "Letras", <Captions key="l" size={14} />],
              ] as Array<[Tab, string, React.ReactNode]>
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                  tab === id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {tab === "timeline" && (
            <div className="space-y-4">
              {!selected && (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/30">
                  Selecciona un bloque en la timeline.
                </p>
              )}
              {selected && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white/85">
                        Segmento {selectedIndex + 1} · {selected.scene_id}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/35">
                        Escena {selected.scene_start.toFixed(2)}–{selected.scene_end.toFixed(2)}s ·{" "}
                        {selected.cut_type}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => moveSelected(-1)}
                        disabled={selectedIndex === 0}
                      >
                        <ChevronLeft size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => moveSelected(1)}
                        disabled={selectedIndex === doc.segments.length - 1}
                      >
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] text-white/40">
                      Entrada en el máster (s)
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, masterDuration - selected.duration)}
                        step={0.05}
                        value={Number(selected.source_start.toFixed(3))}
                        onFocus={pushHistory}
                        onChange={(event) => {
                          const value = clamp(
                            Number(event.target.value),
                            0,
                            Math.max(0, masterDuration - selected.duration),
                          );
                          updateSelected({
                            source_start: value,
                            source_end: value + selected.source_duration,
                          });
                        }}
                        className="field mt-1 py-1.5 text-xs"
                      />
                    </label>
                    <label className="text-[11px] text-white/40">
                      Duración en el clip (s)
                      <input
                        type="number"
                        min={0.12}
                        max={Math.max(0.2, masterDuration - selected.source_start)}
                        step={0.05}
                        value={Number(selected.duration.toFixed(3))}
                        onFocus={pushHistory}
                        onChange={(event) => {
                          const value = clamp(
                            Number(event.target.value),
                            0.12,
                            Math.max(0.2, masterDuration - selected.source_start),
                          );
                          updateSelected({
                            duration: value,
                            source_duration: Math.max(value, selected.source_duration),
                          });
                        }}
                        className="field mt-1 py-1.5 text-xs"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                      <p className="text-white/30">Timeline</p>
                      <p className="font-mono text-white/75">
                        {formatTime(selected.timeline_start)} – {formatTime(selected.timeline_end)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                      <p className="text-white/30">Máster</p>
                      <p className="font-mono text-white/75">
                        {selected.source_start.toFixed(2)} – {selected.source_end.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                      <p className="text-white/30">Transición</p>
                      <p className="font-mono text-white/75">{selected.transition}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-white/30">
                    Los cambios se aplican al EDL. Al guardar, el backend revalida que cada segmento
                    quepa en el máster y que el montaje dure exactamente {formatTime(duration)}.
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "effects" && (
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="panel-title">Color</p>
                  <span className="text-[10px] text-white/25">grade real con eq</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LabeledSlider
                    label="Contraste"
                    value={Number(doc.grade.contrast ?? 1)}
                    min={0.5}
                    max={1.6}
                    onChange={(value) => {
                      updateDoc({ ...doc, grade: { ...doc.grade, contrast: value } });
                    }}
                  />
                  <LabeledSlider
                    label="Saturación"
                    value={Number(doc.grade.saturation ?? 1)}
                    min={0}
                    max={2}
                    onChange={(value) => {
                      updateDoc({ ...doc, grade: { ...doc.grade, saturation: value } });
                    }}
                  />
                  <LabeledSlider
                    label="Brillo"
                    value={Number(doc.grade.brightness ?? 0)}
                    min={-0.4}
                    max={0.4}
                    onChange={(value) => {
                      updateDoc({ ...doc, grade: { ...doc.grade, brightness: value } });
                    }}
                  />
                  <LabeledSlider
                    label="Volumen"
                    value={doc.volume}
                    min={0}
                    max={2}
                    onChange={(value) => updateDoc({ ...doc, volume: value })}
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="panel-title">Efectos visuales</p>
                  <Button size="sm" variant="quiet" onClick={resetEffects}>
                    <RotateCcw size={12} /> Neutro
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["sharpen", "Nitidez", 0, 1],
                    ["vignette", "Viñeta", 0, 1],
                    ["grain", "Grano", 0, 1],
                    ["glow", "Glow", 0, 1],
                    ["rgb_split", "RGB split", 0, 1],
                  ].map(([key, label, min, max]) => (
                    <div key={key as string} className={cn(!allowed(key as string) && "opacity-40")}>
                      <LabeledSlider
                        label={`${label}${!allowed(key as string) ? " · no permitido" : ""}`}
                        value={Number(doc.effects[key as string] ?? 0)}
                        min={Number(min)}
                        max={Number(max)}
                        onChange={(value) => {
                          if (!allowed(key as string)) return;
                          updateDoc({ ...doc, effects: { ...doc.effects, [key as string]: value } });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <p className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-white/30">
                Los límites de efectos los define el estilo del EDL. Guarda antes de renderizar: el
                render usa el EDL persistido, no el estado local.
              </p>
            </div>
          )}

          {tab === "lyrics" && lyricsStyle && (
            <div className="space-y-4">
              <LyricsEditor
                projectId={project.id}
                duration={duration}
                lines={lyricsLines}
                style={lyricsStyle}
                enabled={lyricsEnabled}
                presets={lyricPresets}
                animations={animations}
                fonts={fonts}
                onChangeLines={setLyricsLines}
                onChangeStyle={setLyricsStyle}
                onChangeEnabled={setLyricsEnabled}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                <Button variant="primary" onClick={saveLyrics} loading={savingLyrics}>
                  <Save size={15} /> Guardar letras
                </Button>
                <span className="text-[10px] text-white/30">
                  Se queman con libass en la preview y en el render final.
                </span>
              </div>
            </div>
          )}
        </Card>

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
                onClick={() => doRender(true)}
                loading={renderingType === "preview"}
                disabled={renderBusy}
              >
                <Eye size={15} /> Preview a media resolución
              </Button>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => doRender(false)}
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
                <span className="font-mono text-white/60">{past.length}</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Rehacer</span>
                <span className="font-mono text-white/60">{future.length}</span>
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
      </div>
    </div>
  );
}
