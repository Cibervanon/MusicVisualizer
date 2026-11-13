import {
  AlertTriangle,
  Captions,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

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

function normalizeLines(lines: LyricsLine[], duration: number): Array<LyricsLine & { id: string }> {
  return lines
    .map((line, index) => {
      const start = clamp(Number(line.start) || 0, 0, Math.max(0, duration - 0.2));
      const end = clamp(Number(line.end) || start + 2, start + 0.2, duration);
      return { ...line, id: line.id || uid(`line_${index}`), start, end };
    })
    .sort((a, b) => a.start - b.start);
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
  const [busy, setBusy] = useState<"import" | "transcribe" | null>(null);
  const [transcribeJob, setTranscribeJob] = useState<Job | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Las líneas se ordenan por inicio, así que parcheamos por id estable en vez
  // de por índice para que reordenar durante la edición no afecte a otra línea.
  const rows = useMemo(() => normalizeLines(lines, duration), [lines, duration]);

  const patchLine = (id: string, patch: Partial<LyricsLine>) => {
    const next = rows.map((line) => (line.id === id ? { ...line, ...patch } : line));
    onChangeLines(normalizeLines(next, duration));
  };

  const removeLine = (id: string) => {
    onChangeLines(normalizeLines(rows.filter((line) => line.id !== id), duration));
  };

  const addLine = () => {
    const last = rows[rows.length - 1];
    const start = last ? Math.min(duration - 0.5, last.end) : 0;
    const end = Math.min(duration, start + 3);
    onChangeLines(
      normalizeLines(
        [...rows, { id: uid(), start, end, text: "Nueva línea" }],
        duration,
      ),
    );
  };

  const applyPreset = (preset: TextPreset) => {
    onChangeStyle({ ...preset });
  };

  const doImport = async () => {
    if (!importText.trim()) {
      notify("Pega el contenido SRT, LRC o texto.", "error");
      return;
    }
    setBusy("import");
    try {
      const result = await api.importLyrics(projectId, importText, importKind);
      onChangeLines(result.lyrics.lines);
      onChangeStyle(result.lyrics.style);
      onChangeEnabled(true);
      setImportText("");
      setImportOpen(false);
      notify(`${result.count} línea(s) importadas. Revísalas.`, "success");
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <div>
          <p className="text-sm font-semibold text-white/85">Letras animadas</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Se queman con libass sobre el clip. Puedes escribirlas, importar SRT/LRC o transcribir.
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
          <p className="panel-title">Líneas · {lines.length}</p>
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
              <Button size="sm" variant="accent" onClick={doImport} loading={busy === "import"}>
                <Download size={12} /> Importar
              </Button>
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
          </div>
        )}

        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
              <Captions size={18} className="text-white/25" />
              <p className="text-[11px] text-white/30">
                Sin letras. Añade una línea o importa un archivo.
              </p>
            </div>
          )}
          {rows.map((line) => (
            <div
              key={line.id}
              className="grid grid-cols-[54px_54px_1fr_28px] items-center gap-1.5"
            >
              <input
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={Number(line.start.toFixed(2))}
                onChange={(event) => patchLine(line.id, { start: Number(event.target.value) })}
                className="field px-2 py-1 text-[11px]"
                title="Inicio"
              />
              <input
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={Number(line.end.toFixed(2))}
                onChange={(event) => patchLine(line.id, { end: Number(event.target.value) })}
                className="field px-2 py-1 text-[11px]"
                title="Fin"
              />
              <input
                value={line.text}
                onChange={(event) => patchLine(line.id, { text: event.target.value })}
                className="field px-2 py-1 text-xs"
                placeholder="Texto de la línea"
              />
              <button
                onClick={() => removeLine(line.id)}
                className="rounded-lg p-1.5 text-white/25 transition hover:bg-rose-500/10 hover:text-rose-300"
                aria-label="Eliminar línea"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-200/60">
            <AlertTriangle size={11} />
            Revisa los tiempos: la letra se quema tal cual en el MP4.
          </p>
        )}
      </div>
    </div>
  );
}
