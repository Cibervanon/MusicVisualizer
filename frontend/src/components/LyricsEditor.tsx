import {
  AlertTriangle,
  Captions,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { List } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";

import { api, ApiError, waitForJob } from "../lib/validatedApi";
import type { Job, LyricsLine, LyricsStyle, TextPreset } from "../lib/types";
import { clamp, cn, formatTime, uid } from "../lib/utils";
import { useStudio } from "../store/studio";
import { Badge, Button, LabeledSlider, ProgressBar, Toggle } from "./ui";

interface LyricsEditorProps {
  projectId: string;
  duration: number;
  lines: LyricsLine[];
  style: LyricsStyle;
  enabled: boolean;
  presets: TextPreset[];
  animations: string[];
  fonts: string[];
  onChangeLines: (lines: LyricsLine[]) => void;
  onChangeStyle: (style: LyricsStyle) => void;
  onChangeEnabled: (enabled: boolean) => void;
}

interface NormalizedLine extends LyricsLine {
  id: string;
  isValid: boolean;
}

function normalizeLines(lines: LyricsLine[], duration: number): NormalizedLine[] {
  return lines
    .map((line, index) => {
      const start = clamp(Number(line.start) || 0, 0, Math.max(0, duration - 0.2));
      const end = clamp(Number(line.end) || start + 2, start + 0.2, duration);
      const isValid = end > start + 0.05 && start >= 0 && end <= duration;
      return { ...line, id: line.id || uid(`line_${index}`), start, end, isValid };
    })
    .sort((a, b) => a.start - b.start);
}

const ROW_HEIGHT = 48;

interface LineRowProps {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  rows: NormalizedLine[];
  duration: number;
  draggedId: string | null;
  dragOverId: string | null;
  setDraggedId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
  patchLine: (id: string, patch: Partial<LyricsLine>) => void;
  moveLine: (fromIndex: number, toIndex: number) => void;
  seekToTime: (time: number) => void;
}

const LineRow = ({
  index,
  style: rowStyle,
  rows,
  duration,
  draggedId,
  dragOverId,
  setDraggedId,
  setDragOverId,
  patchLine,
  moveLine,
  seekToTime,
}: LineRowProps) => {
  const line = rows[index];
  const isDragging = draggedId === line.id;
  const isOver = dragOverId === line.id;

  const handleDragStart = () => {
    setDraggedId(line.id);
    document.body.style.userSelect = "none";
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    document.body.style.userSelect = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (line.id !== draggedId) setDragOverId(line.id);
  };

  const handleDragLeave = () => {
    if (dragOverId === line.id) setDragOverId(null);
  };

  const handleDrop = () => {
    if (!draggedId || draggedId === line.id) return;
    const fromIndex = rows.findIndex((r) => r.id === draggedId);
    const toIndex = rows.findIndex((r) => r.id === line.id);
    moveLine(fromIndex, toIndex);
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "grid grid-cols-[40px_60px_60px_1fr_48px] items-center gap-2 px-3",
        "rounded-lg border transition-colors",
        isDragging && "opacity-50 bg-white/[0.03]",
        isOver && !isDragging && "bg-lime/[0.05] border-l-lime/50",
        !line.isValid && "bg-rose-500/10 border-rose-500/30",
      )}
      style={rowStyle}
    >
      <div className="flex items-center justify-center text-white/30 cursor-grab">
        <GripVertical size={14} />
      </div>

      <input
        type="number"
        min={0}
        max={duration}
        step={0.1}
        value={Number(line.start.toFixed(2))}
        onChange={(event) => patchLine(line.id, { start: Number(event.target.value) })}
        className={cn("field px-2 py-1.5 text-[11px] text-center", !line.isValid && "border-rose-500/50 focus:border-rose-500")}
        title="Inicio"
      />
      <input
        type="number"
        min={0}
        max={duration}
        step={0.1}
        value={Number(line.end.toFixed(2))}
        onChange={(event) => patchLine(line.id, { end: Number(event.target.value) })}
        className={cn("field px-2 py-1.5 text-center", !line.isValid && "border-rose-500/50 focus:border-rose-500")}
        title="Fin"
      />
      <input
        value={line.text}
        onChange={(event) => patchLine(line.id, { text: event.target.value })}
        className="field px-2 py-1.5 text-xs"
        placeholder="Texto de la línea"
      />
      <button
        onClick={() => seekToTime(line.start)}
        className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
        title="Reproducir desde aquí"
      >
        <Play size={14} />
      </button>
    </div>
  );
};

interface LyricsEditorProps {
  projectId: string;
  duration: number;
  lines: LyricsLine[];
  style: LyricsStyle;
  enabled: boolean;
  presets: TextPreset[];
  animations: string[];
  fonts: string[];
  onChangeLines: (lines: LyricsLine[]) => void;
  onChangeStyle: (style: LyricsStyle) => void;
  onChangeEnabled: (enabled: boolean) => void;
}

export function LyricsEditor({
  projectId,
  duration,
  lines,
  style,
  enabled,
  presets,
  animations,
  fonts,
  onChangeLines,
  onChangeStyle,
  onChangeEnabled,
}: LyricsEditorProps) {
  const notify = useStudio((state) => state.notify);
  const capabilities = useStudio((state) => state.capabilities);
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<"srt" | "lrc" | "text">("srt");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<NormalizedLine[]>([]);
  const [busy, setBusy] = useState<"import" | "transcribe" | null>(null);
  const [transcribeJob, setTranscribeJob] = useState<Job | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rows = useMemo(() => normalizeLines(lines, duration), [lines, duration]);

  const VirtualizedList = (props: any) => <List {...props} />;

  const VirtualizedListWithTypes = (props: any) => <List {...props} />;

  const patchLine = useCallback((id: string, patch: Partial<LyricsLine>) => {
    const next = rows.map((line) => (line.id === id ? { ...line, ...patch } : line));
    onChangeLines(normalizeLines(next, duration));
  }, [rows, duration, onChangeLines]);

  const removeLine = useCallback((id: string) => {
    onChangeLines(normalizeLines(rows.filter((line) => line.id !== id), duration));
  }, [rows, duration, onChangeLines]);

  const addLine = useCallback(() => {
    const last = rows[rows.length - 1];
    const start = last ? Math.min(duration - 0.5, last.end) : 0;
    const end = Math.min(duration, start + 3);
    onChangeLines(
      normalizeLines(
        [...rows, { id: uid(), start, end, text: "Nueva línea" }],
        duration,
      ),
    );
  }, [rows, duration, onChangeLines]);

  const moveLine = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...rows];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    onChangeLines(normalizeLines(next, duration));
  }, [rows, duration, onChangeLines]);

  const applyPreset = useCallback((preset: TextPreset) => {
    onChangeStyle({ ...preset });
  }, [onChangeStyle]);

  const updateImportPreview = useCallback(() => {
    if (!importText.trim()) {
      setImportPreview([]);
      return;
    }
    try {
      let parsed: Array<{ start: number; end: number; text: string }> = [];
      if (importKind === "srt") {
        parsed = parseSRT(importText);
      } else if (importKind === "lrc") {
        parsed = parseLRC(importText);
      } else {
        parsed = parseText(importText);
      }
      setImportPreview(
        parsed.map((p, i) => ({
          id: uid(`import_${i}`),
          start: clamp(p.start, 0, duration),
          end: clamp(p.end, p.start + 0.2, duration),
          text: p.text,
          isValid: p.end > p.start + 0.05,
        })),
      );
    } catch {
      setImportPreview([]);
    }
  }, [importText, importKind, duration]);

  const doImport = async () => {
    if (!importPreview.length) {
      notify("No hay líneas válidas para importar.", "error");
      return;
    }
    setBusy("import");
    try {
      const validLines = importPreview.filter((l) => l.isValid);
      onChangeLines(validLines);
      onChangeEnabled(true);
      setImportText("");
      setImportPreview([]);
      setImportOpen(false);
      notify(`${validLines.length} línea(s) importadas. Revísalas.`, "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const doTranscribe = async () => {
    setBusy("transcribe");
    try {
      const { job } = await api.transcribe(projectId, null, "small");
      setTranscribeJob(job);
      const final = await waitForJob(job.id, setTranscribeJob);
      if (final.status !== "done") {
        throw new ApiError(final.error || "La transcripción falló.", "transcribe_error");
      }
      const { lyrics } = await api.getLyrics(projectId);
      onChangeLines(lyrics.lines);
      onChangeStyle(lyrics.style);
      onChangeEnabled(true);
      notify("Transcripción lista. Revisa siempre el texto antes de exportar.", "success");
    } catch (error) {
      notify((error as ApiError).message, "error");
    } finally {
      setBusy(null);
      setTranscribeJob(null);
    }
  };

  const seekToTime = useCallback((time: number) => {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.currentTime = time;
      video.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    updateImportPreview();
  }, [importText, importKind, duration]);

  const previewStyle: React.CSSProperties = {
    fontFamily: `"${style.font}", "Segoe UI", sans-serif`,
    fontWeight: style.bold ? 800 : 500,
    color: style.color,
    fontSize: `${Math.max(16, Math.min(30, style.size * 0.38))}px`,
    letterSpacing: `${style.spacing}px`,
    textTransform: style.uppercase ? "uppercase" : "none",
    textShadow:
      style.glow > 0
        ? `0 0 ${style.glow}px ${style.active_color}, 0 2px 8px rgba(0,0,0,0.8)`
        : style.shadow > 0
          ? `0 ${Math.min(4, style.shadow)}px ${style.shadow * 2}px rgba(0,0,0,0.9)`
          : "0 2px 10px rgba(0,0,0,0.7)",
    WebkitTextStroke: style.outline > 0 ? `${Math.min(2, style.outline / 2)}px ${style.outline_color}` : undefined,
    background: style.background
      ? `rgba(0,0,0,${style.background_opacity})`
      : "transparent",
    padding: style.background ? "4px 10px" : undefined,
    borderRadius: 6,
  };

  const lineRowData = useMemo(() => ({
    rows,
    duration,
    draggedId,
    dragOverId,
    setDraggedId,
    setDragOverId,
    patchLine,
    moveLine,
    seekToTime,
  }), [rows, duration, draggedId, dragOverId]);

  const VirtualizedLines = ({ height, width }: { height: number; width: number }) => (
    <VirtualizedList
      className="max-h-[400px] rounded-xl border border-white/10 bg-black/20"
      height={height}
      width={width}
      itemCount={rows.length}
      itemSize={ROW_HEIGHT}
      rowProps={lineRowData}
      rowComponent={LineRow as any}
      overscanCount={3}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <div>
          <p className="text-sm font-semibold text-white/85">Letras animadas</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Se queman con libass sobre el clip. Arrastra ⋮⋮ para reordenar. Importa SRT/LRC o transcribe.
          </p>
        </div>
        <Toggle checked={enabled} onChange={onChangeEnabled} label="" />
      </div>

      {/* Style preview */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-ink-800 to-black px-4 py-8">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.18),transparent_50%)]" />
        <div className="relative flex h-16 items-center justify-center text-center">
          <span style={previewStyle}>
            {rows[0]?.text || "Así se verá tu letra"}
          </span>
        </div>
        <div className="relative mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/25">
          Vista previa del estilo · {style.animation_in.replaceAll("_", " ")}
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="panel-title mb-2">Presets</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition",
                style.id === preset.id
                  ? "border-lime/35 bg-lime/[0.07]"
                  : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
              )}
            >
              <span
                className="block truncate text-[11px] font-semibold"
                style={{ color: preset.active_color }}
              >
                {preset.name}
              </span>
              <span className="mt-0.5 block truncate text-[9px] text-white/30">
                {preset.font} · {preset.size}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Style controls */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-white/40">
          Fuente
          <select
            className="field mt-1 py-1.5 text-xs"
            value={style.font}
            onChange={(event) => onChangeStyle({ ...style, font: event.target.value })}
          >
            {fonts.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-white/40">
          Animación de entrada
          <select
            className="field mt-1 py-1.5 text-xs"
            value={style.animation_in}
            onChange={(event) => onChangeStyle({ ...style, animation_in: event.target.value })}
          >
            {animations.map((animation) => (
              <option key={animation} value={animation}>
                {animation.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-white/40">
          Color
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5">
            <input
              type="color"
              value={style.color}
              onChange={(event) => onChangeStyle({ ...style, color: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
            />
            <span className="font-mono text-[10px] text-white/50">{style.color}</span>
          </div>
        </label>
        <label className="text-[11px] text-white/40">
          Color activo
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5">
            <input
              type="color"
              value={style.active_color}
              onChange={(event) => onChangeStyle({ ...style, active_color: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
            />
            <span className="font-mono text-[10px] text-white/50">{style.active_color}</span>
          </div>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledSlider
          label="Tamaño"
          value={style.size}
          min={24}
          max={110}
          step={1}
          onChange={(value) => onChangeStyle({ ...style, size: value })}
          format={(value) => `${value}px`}
        />
        <LabeledSlider
          label="Posición vertical"
          value={style.pos_y}
          min={0.1}
          max={0.95}
          step={0.01}
          onChange={(value) => onChangeStyle({ ...style, pos_y: value })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <LabeledSlider
          label="Glow"
          value={style.glow}
          min={0}
          max={30}
          step={1}
          onChange={(value) => onChangeStyle({ ...style, glow: value })}
          format={(value) => `${value}px`}
        />
        <LabeledSlider
          label="Contorno"
          value={style.outline}
          min={0}
          max={8}
          step={0.5}
          onChange={(value) => onChangeStyle({ ...style, outline: value })}
          format={(value) => value.toFixed(1)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-[11px] text-white/50">
          <input
            type="checkbox"
            checked={style.uppercase}
            onChange={(event) => onChangeStyle({ ...style, uppercase: event.target.checked })}
            className="h-4 w-4 accent-lime"
          />
          MAYÚSCULAS
        </label>
        <label className="flex items-center gap-2 text-[11px] text-white/50">
          <input
            type="checkbox"
            checked={style.background}
            onChange={(event) => onChangeStyle({ ...style, background: event.target.checked })}
            className="h-4 w-4 accent-lime"
          />
          Fondo
        </label>
        <button
          onClick={() => setAdvancedOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/35 hover:text-white/70"
        >
          Avanzado <ChevronDown size={12} className={advancedOpen ? "rotate-180" : ""} />
        </button>
      </div>

      {advancedOpen && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledSlider
            label="Opacidad"
            value={style.opacity}
            min={0.1}
            max={1}
            step={0.01}
            onChange={(value) => onChangeStyle({ ...style, opacity: value })}
            format={(value) => `${Math.round(value * 100)}%`}
          />
          <LabeledSlider
            label="Espaciado"
            value={style.spacing}
            min={-2}
            max={8}
            step={0.5}
            onChange={(value) => onChangeStyle({ ...style, spacing: value })}
            format={(value) => `${value}px`}
          />
          <label className="text-[11px] text-white/40">
            Animación de salida
            <select
              className="field mt-1 py-1.5 text-xs"
              value={style.animation_out}
              onChange={(event) => onChangeStyle({ ...style, animation_out: event.target.value })}
            >
              {animations.map((animation) => (
                <option key={animation} value={animation}>
                  {animation.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-white/40">
            Alineación
            <select
              className="field mt-1 py-1.5 text-xs"
              value={style.align}
              onChange={(event) => onChangeStyle({ ...style, align: event.target.value })}
            >
              <option value="center">Centro</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </label>
        </div>
      )}

      {/* Lines */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="panel-title">Líneas · {rows.length}</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="quiet" onClick={() => setImportOpen((value) => !value)}>
              <Upload size={12} /> Importar
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={doTranscribe}
              loading={busy === "transcribe"}
              disabled={!capabilities?.extras.faster_whisper || busy !== null}
              title={
                capabilities?.extras.faster_whisper
                  ? "Transcribir con faster-whisper"
                  : "Instala faster-whisper para transcribir"
              }
            >
              <Sparkles size={12} /> Transcribir
            </Button>
            <Button size="sm" variant="ghost" onClick={addLine}>
              <Plus size={12} /> Línea
            </Button>
          </div>
        </div>

        {busy === "transcribe" && transcribeJob && (
          <div className="mb-2 rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2">
            <p className="text-[10px] text-white/45">{transcribeJob.message}</p>
            <ProgressBar value={transcribeJob.progress} height="h-1" className="mt-1.5" />
          </div>
        )}

        {importOpen && (
          <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-white/35" />
              <select
                className="field w-auto py-1 text-xs"
                value={importKind}
                onChange={(event) => setImportKind(event.target.value as "srt" | "lrc" | "text")}
              >
                <option value="srt">SRT</option>
                <option value="lrc">LRC</option>
                <option value="text">Texto plano</option>
              </select>
              <Button size="sm" variant="accent" onClick={doImport} loading={busy === "import"} disabled={!importPreview.some(l => l.isValid)}>
                <Download size={12} /> Importar {importPreview.filter(l => l.isValid).length} línea(s)
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-white/40">
              <div className="rounded bg-black/30 p-2">Validas: <span className="text-lime">{importPreview.filter(l => l.isValid).length}</span></div>
              <div className="rounded bg-black/30 p-2">Inválidas: <span className="text-rose-300">{importPreview.filter(l => !l.isValid).length}</span></div>
            </div>
            <textarea
              className="field min-h-[90px] text-xs"
              placeholder={
                importKind === "srt"
                  ? "1\n00:00:00,000 --> 00:00:03,500\nPrimera línea…"
                  : importKind === "lrc"
                    ? "[00:00.00]Primera línea…"
                    : "Una línea por verso…"
              }
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            {importPreview.length && (
              <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 text-[10px]">
                {importPreview.slice(0, 10).map((p) => (
                  <div key={p.id} className={cn("flex gap-2 px-1 py-0.5", !p.isValid && "text-rose-300")}>
                    <span className="text-white/40 w-16">{formatTime(p.start)} – {formatTime(p.end)}</span>
                    <span className="truncate">{p.text}</span>
                    {!p.isValid && <AlertTriangle size={10} className="text-rose-300" />}
                  </div>
                ))}
                {importPreview.length > 10 && <div className="text-white/30">… y {importPreview.length - 10} más</div>}
              </div>
            )}
          </div>
        )}

<AutoSizer
          ChildComponent={({ height, width }: { height: number | undefined; width: number | undefined }) => {
            if (height === undefined || width === undefined) {
              return null;
            }
            return (
              <VirtualizedListWithTypes
                className="max-h-[400px] rounded-xl border border-white/10 bg-black/20"
                height={height}
                width={width}
                itemCount={rows.length}
                itemSize={ROW_HEIGHT}
                rowProps={lineRowData}
                rowComponent={LineRow as any}
                overscanCount={3}
              />
            );
          }}
        />

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
            <Captions size={18} className="text-white/25" />
            <p className="text-[11px] text-white/30">
              Sin letras. Añade una línea o importa un archivo.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-200/60">
            <AlertTriangle size={11} />
            Revisa los tiempos: la letra se quema tal cual en el MP4. Arrastra ⋮⋮ para reordenar.
          </p>
        )}
      </div>
    </div>
  );
}

function parseSRT(content: string): Array<{ start: number; end: number; text: string }> {
  const blocks = content.trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 3) return null;
      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (!match) return null;
      const start = timeToSeconds(match[1]);
      const end = timeToSeconds(match[2]);
      const text = lines.slice(2).join("\n").trim();
      return { start, end, text };
    })
    .filter((x): x is { start: number; end: number; text: string } => x !== null);
}

function parseLRC(content: string): Array<{ start: number; end: number; text: string }> {
  const lines = content.trim().split("\n");
  const entries: Array<{ start: number; text: string }> = [];
  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      entries.push({ start: minutes * 60 + seconds, text: match[3].trim() });
    }
  }
  return entries.map((e, i) => ({
    start: e.start,
    end: entries[i + 1] ? entries[i + 1].start : e.start + 3,
    text: e.text,
  }));
}

function parseText(content: string): Array<{ start: number; end: number; text: string }> {
  const lines = content.trim().split("\n").filter((l) => l.trim());
  const duration = 3;
  return lines.map((text, i) => ({
    start: i * duration,
    end: (i + 1) * duration,
    text: text.trim(),
  }));
}

function timeToSeconds(time: string): number {
  const [h, m, s] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}