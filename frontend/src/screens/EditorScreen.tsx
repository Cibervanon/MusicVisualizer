import { ArrowLeft, Check, Download, Eye, Film, History, Loader2, Pause, Play, Redo2, RotateCcw, Save, Scissors, SlidersHorizontal, Split, Trash2, Undo2, Volume2, Wand2, Zap, Clapperboard, Copy, Captions } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, downloadUrl, mediaUrl, waitForJob } from "../lib/validatedApi";
import {
  docDuration,
  duplicateSegment,
  ensureSegmentIds,
  moveSegment,
  reflowSegments,
  removeSegment,
  segmentIndexById,
  sourceToTimeline,
  splitSegmentAt,
  timelineToSource,
} from "../lib/edit";
import type { EDL, Job, LyricsLine, LyricsStyle, RenderInfo, Segment } from "../lib/types";
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
import {
  EditorHeader,
  EditorPreview,
  EditorTimeline,
  EditorInspector,
  EditorSidebar,
} from "../components/editor";

interface Doc {
  segments: Segment[];
  grade: Record<string, number>;
  effects: Record<string, number>;
  volume: number;
}

function docFromEdit(edit: EDL): Doc {
  return {
    segments: ensureSegmentIds(edit.segments || []),
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const seqRef = useRef(0);
  const loadRef = useRef(0);

  useEffect(() => {
    if (!project) return;
    if (!selectedEditId && project.edits[0]) {
      setSelectedEdit(project.edits[0].id);
    }
  }, [project?.id]);

  const editId = selectedEditId || project?.edits[0]?.id || null;

  useEffect(() => {
    if (!project || !editId) return;
    const requestId = ++loadRef.current;
    setLoading(true);
    api
      .getEdit(project.id, editId)
      .then(({ edit: loaded }) => {
        if (requestId !== loadRef.current) return;
        const normalized: EDL = { ...loaded, segments: ensureSegmentIds(loaded.segments || []) };
        const initial = docFromEdit(normalized);
        setEdit(normalized);
        setDoc(initial);
        setBaseline(JSON.stringify(initial));
        setPast([]);
        setFuture([]);
        setSelectedId(normalized.segments[0]?.id ?? null);
        setPlayhead(0);
        setPlaying(false);
        setRendered(null);
        setVideoSrc("");
        setRenderJob(null);
        setRenderingType(null);
        seqRef.current += 1;
      })
      .catch((error) => notify((error as ApiError).message, "error"))
      .finally(() => {
        if (requestId === loadRef.current) setLoading(false);
      });
    return () => {
      if (requestId === loadRef.current) loadRef.current += 1;
    };
  }, [project?.id, editId]);

  useEffect(() => {
    if (!project) return;
    setLyricsLines(project.lyrics.lines || []);
    setLyricsStyle(project.lyrics.style);
    setLyricsEnabled(project.lyrics.enabled);
  }, [project?.id, project?.lyrics.updated_at]);

  useEffect(() => {
    if (!project || !edit) {
      setRendered(null);
      return;
    }
    const forEdit = project.renders.filter((render) => render.edit_id === edit.id);
    const preview = forEdit.find((render) => render.type === "preview");
    const final = forEdit.find((render) => render.type === "final");
    setRendered((current) => {
      if (current && current.edit_id === edit.id && forEdit.some((r) => r.id === current.id)) {
        return current;
      }
      return preview || final || null;
    });
  }, [edit?.id, project?.renders]);

  useEffect(() => {
    if (!project || !edit) return;
    const path = rendered?.path || edit.master;
    setVideoSrc(path ? mediaUrl(project.id, path) : "");
  }, [project?.id, edit?.master, rendered?.path]);

  const fragmentDuration = Number(project?.fragment?.duration || edit?.duration || 30);
  const masterDuration = Number(
    project?.analysis_summary.video?.duration || edit?.duration || 30,
  );
  const targetDuration = fragmentDuration;
  const totalDuration = doc ? docDuration(doc.segments) : targetDuration;
  const timelineDuration = Math.max(targetDuration, totalDuration, 0.2);
  const accent = edit?.style === "flash" ? "#FFFFFF" : "#D6FF3D";
  const usingRender = Boolean(rendered);
  const renderStale = Boolean(
    rendered && edit?.edited_at && rendered.created_at < edit.edited_at,
  );

  const pushHistory = () => {
    const current = docRef.current;
    if (!current) return;
    const snapshot = JSON.parse(JSON.stringify(current)) as Doc;
    setPast((items) => {
      const last = items[items.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return items;
      return [...items.slice(-39), snapshot];
    });
    setFuture([]);
  };

  const applyDoc = (next: Doc) => {
    seqRef.current += 1;
    setDoc(next);
    if (!next.segments.some((segment) => segment.id === selectedId)) {
      setSelectedId(next.segments[0]?.id ?? null);
    }
  };

  const updateDoc = (next: Doc) => applyDoc(next);

  const setSegments = (segments: Segment[]) => {
    const current = docRef.current;
    if (!current) return;
    applyDoc({
      ...current,
      segments: reflowSegments(
        segments,
        targetDuration,
        masterDuration,
        Number(edit?.transition?.duration || 0),
      ),
    });
  };

  const undo = () => {
    if (!past.length || !doc) return;
    const previous = past[past.length - 1];
    setFuture((items) => [JSON.parse(JSON.stringify(doc)) as Doc, ...items]);
    setPast((items) => items.slice(0, -1));
    applyDoc(previous);
  };

  const redo = () => {
    if (!future.length || !doc) return;
    const next = future[0];
    setPast((items) => [...items, JSON.parse(JSON.stringify(doc)) as Doc]);
    setFuture((items) => items.slice(1));
    applyDoc(next);
  };

  useEffect(() => {
    if (!doc) return;
    if (selectedId && doc.segments.some((segment) => segment.id === selectedId)) return;
    setSelectedId(doc.segments[0]?.id ?? null);
  }, [doc, selectedId]);

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

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const save = async (
    silent = false,
  ): Promise<{ edit: EDL; clean: boolean } | null> => {
    if (!project || !edit || !doc) return null;
    if (!dirty) return { edit, clean: true };
    const seqAtStart = seqRef.current;
    const snapshot = JSON.parse(JSON.stringify(doc)) as Doc;
    setSaving(true);
    try {
      const { edit: updated } = await api.patchEdit(project.id, edit.id, {
        segments: snapshot.segments,
        grade: snapshot.grade,
        effects: snapshot.effects,
        volume: snapshot.volume,
      });
      const fresh = docFromEdit(updated);
      setEdit(updated);
      const clean = seqRef.current === seqAtStart;
      if (clean) {
        seqRef.current += 1;
        setDoc(fresh);
        setBaseline(JSON.stringify(fresh));
        setPast([]);
        setFuture([]);
        if (!fresh.segments.some((segment) => segment.id === selectedId)) {
          setSelectedId(fresh.segments[0]?.id ?? null);
        }
      } else {
        setBaseline(JSON.stringify(snapshot));
      }
      await refreshProject();
      if (!silent) notify("Montaje guardado. Ya puedes renderizar.", "success");
      return { edit: updated, clean };
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
      if (!saved.clean) {
        notify(
          "Se guardó una versión anterior porque seguiste editando. Guarda los cambios actuales antes de renderizar.",
          "info",
        );
        return;
      }
      const { job } = await api.render({
        project_id: project.id,
        edit_id: saved.edit.id,
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

  const segments = doc?.segments || [];
  const selectedIndex = segmentIndexById(segments, selectedId);
  const selected = selectedIndex >= 0 ? segments[selectedIndex] : null;

  const seekTo = (time: number) => {
    const clamped = clamp(time, 0, timelineDuration);
    setPlayhead(clamped);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = usingRender ? clamped : timelineToSource(segments, clamped);
  };

  const selectSegment = (id: string) => {
    setSelectedId(id);
    const segment = segments.find((item) => item.id === id);
    if (segment) seekTo(segment.timeline_start);
  };

  const updateSelected = (patch: Partial<Segment>) => {
    if (!doc || !selected) return;
    const next = doc.segments.map((segment) =>
      segment.id === selected.id ? { ...segment, ...patch } : segment,
    );
    setSegments(next);
  };

  const removeSelected = () => {
    if (!doc || !selected) return;
    if (doc.segments.length <= 1) {
      notify("El montaje debe conservar al menos un segmento.", "info");
      return;
    }
    pushHistory();
    const { segments: next, nextId } = removeSegment(doc.segments, selected.id);
    setSegments(next);
    setSelectedId(nextId);
  };

  const splitSelected = () => {
    if (!doc || !selected) return;
    if (playhead <= selected.timeline_start || playhead >= selected.timeline_end) {
      notify("Mueve el cursor dentro del segmento seleccionado para dividirlo.", "info");
      return;
    }
    pushHistory();
    const next = splitSegmentAt(
      doc.segments,
      selected.id,
      playhead,
      Number(edit?.transition?.duration || 0),
    );
    if (next.length === doc.segments.length) {
      notify("No hay metraje suficiente para dividir en ese punto.", "info");
      return;
    }
    setSegments(next);
    setSelectedId(selected.id);
  };

  const duplicateSelected = () => {
    if (!doc || !selected) return;
    const slack = targetDuration - totalDuration;
    if (slack < 0.12) {
      notify("No queda duración libre en el fragmento para duplicar el clip.", "info");
      return;
    }
    pushHistory();
    const { segments: next, id } = duplicateSegment(doc.segments, selected.id, slack);
    if (!id) {
      notify("No se pudo duplicar el segmento.", "info");
      return;
    }
    setSegments(next);
    setSelectedId(id);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!doc || !selected) return;
    pushHistory();
    setSegments(moveSegment(doc.segments, selected.id, direction));
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

  const renderBusy = renderingType !== null;
  const edits = project.edits;

  const handleVideoTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const current = event.currentTarget.currentTime;
    if (usingRender) {
      setPlayhead(clamp(current, 0, timelineDuration));
    } else {
      const mapped = sourceToTimeline(segments, current);
      if (mapped !== null) setPlayhead(mapped);
    }
  };

  const handleVideoLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    event.currentTarget.currentTime = usingRender
      ? clamp(playhead, 0, timelineDuration)
      : timelineToSource(segments, playhead);
  };

  return (
    <div className="space-y-6 animate-rise">
      <EditorHeader
        edit={edit}
        totalDuration={totalDuration}
        dirty={dirty}
        saving={saving}
        renderingType={renderingType}
        renderJob={renderJob}
        rendered={rendered}
        renderStale={renderStale}
        pastLength={past.length}
        futureLength={future.length}
        onUndo={undo}
        onRedo={redo}
        onSave={save}
        onPreview={() => doRender(true)}
        onRenderFinal={() => doRender(false)}
        onEditSelect={setSelectedEdit}
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

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_300px]">
          <div>
            <EditorPreview
              edit={edit}
              projectId={project.id}
              timelineDuration={timelineDuration}
              usingRender={usingRender}
              renderStale={renderStale}
              dirty={dirty}
              rendered={rendered}
              playhead={playhead}
              playing={playing}
              totalDuration={totalDuration}
              segments={segments}
              renderBusy={renderBusy}
              renderJob={renderJob}
              videoSrc={videoSrc}
              videoRef={videoRef}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
              onVideoTimeUpdate={handleVideoTimeUpdate}
              onVideoLoadedMetadata={handleVideoLoadedMetadata}
            />
          </div>

          <div className="border-t border-white/[0.06] p-4 lg:border-l lg:border-t-0">
            <EditorTimeline
              segments={segments}
              duration={timelineDuration}
              masterDuration={masterDuration}
              playhead={playhead}
              selectedId={selectedId}
              accent={accent}
              onSelect={selectSegment}
              onSeek={seekTo}
              onBeginInteraction={pushHistory}
              onChange={setSegments}
              onSplit={splitSelected}
              onDuplicate={duplicateSelected}
              onRemove={removeSelected}
              onMoveSelection={moveSelected}
              hasSelection={!!selected}
            />
          </div>
        </div>

        <EditorInspector
          edit={edit}
          doc={doc}
          selectedId={selectedId}
          selectedIndex={selectedIndex}
          totalDuration={totalDuration}
          targetDuration={targetDuration}
          masterDuration={masterDuration}
          timelineDuration={timelineDuration}
          accent={accent}
          lyricsLines={lyricsLines}
          lyricsStyle={lyricsStyle}
          lyricsEnabled={lyricsEnabled}
          tab={tab}
          setTab={setTab}
          onUpdateSelected={updateSelected}
          onMoveSelected={moveSelected}
          onUpdateDoc={updateDoc}
          onResetEffects={resetEffects}
          onSaveLyrics={saveLyrics}
          savingLyrics={savingLyrics}
          lyricsPresets={lyricPresets}
          animations={animations}
          fonts={fonts}
          onChangeLyricsLines={setLyricsLines}
          onChangeLyricsStyle={setLyricsStyle}
          onChangeLyricsEnabled={setLyricsEnabled}
        />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="xl:col-span-1" />
        <EditorSidebar
          projectId={project.id}
          edit={edit}
          project={project}
          rendered={rendered}
          renderingType={renderingType}
          renderJob={renderJob}
          renderBusy={renderBusy}
          dirty={dirty}
          pastLength={past.length}
          futureLength={future.length}
          onPreview={() => doRender(true)}
          onRenderFinal={() => doRender(false)}
        />
      </div>
    </div>
  );
}