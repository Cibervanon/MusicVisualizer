import { Captions, ChevronLeft, ChevronRight, Clapperboard, RotateCcw, Save, Scissors, SlidersHorizontal, Volume2, Wand2 } from "lucide-react";
import { useMemo } from "react";

import { Badge, Button, Card, LabeledSlider, SectionHeading } from "../ui";
import { cn, clamp, formatTime } from "../../lib/utils";
import type { EDL, Segment, LyricsStyle, TextPreset } from "../../lib/types";
import { LyricsEditor } from "../LyricsEditor";
import { useStudio } from "../../store/studio";

interface EditorInspectorProps {
  edit: EDL;
  doc: { segments: Segment[]; grade: Record<string, number>; effects: Record<string, number>; volume: number } | null;
  selectedId: string | null;
  selectedIndex: number;
  totalDuration: number;
  targetDuration: number;
  masterDuration: number;
  timelineDuration: number;
  accent: string;
  lyricsLines: Array<{ id?: string; start: number; end: number; text: string }>;
  lyricsStyle: LyricsStyle | null;
  lyricsEnabled: boolean;
  tab: "timeline" | "effects" | "lyrics";
  setTab: (tab: "timeline" | "effects" | "lyrics") => void;
  onUpdateSelected: (patch: Partial<Segment>) => void;
  onMoveSelected: (direction: -1 | 1) => void;
  onUpdateDoc: (doc: { segments: Segment[]; grade: Record<string, number>; effects: Record<string, number>; volume: number }) => void;
  onResetEffects: () => void;
  onSaveLyrics: () => void;
  savingLyrics: boolean;
  lyricsPresets: TextPreset[];
  animations: string[];
  fonts: string[];
  onChangeLyricsLines: (lines: Array<{ id?: string; start: number; end: number; text: string }>) => void;
  onChangeLyricsStyle: (style: LyricsStyle) => void;
  onChangeLyricsEnabled: (enabled: boolean) => void;
}

export function EditorInspector({
  edit,
  doc,
  selectedId,
  selectedIndex,
  totalDuration,
  targetDuration,
  masterDuration,
  timelineDuration,
  accent,
  lyricsLines,
  lyricsStyle,
  lyricsEnabled,
  tab,
  setTab,
  onUpdateSelected,
  onMoveSelected,
  onUpdateDoc,
  onResetEffects,
  onSaveLyrics,
  savingLyrics,
  lyricsPresets,
  animations,
  fonts,
  onChangeLyricsLines,
  onChangeLyricsStyle,
  onChangeLyricsEnabled,
}: EditorInspectorProps) {
  const segments = doc?.segments || [];
  const selected = selectedId ? segments.find((s) => s.id === selectedId) : null;

  const allowed = (name: string) => !edit.allowed_effects?.length || edit.allowed_effects.includes(name);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
        {([
          ["timeline", "Montaje", <Scissors key="t" size={14} />],
          ["effects", "Efectos", <SlidersHorizontal key="e" size={14} />],
          ["lyrics", "Letras", <Captions key="l" size={14} />],
        ] as Array<["timeline" | "effects" | "lyrics", string, React.ReactNode]>).map(([id, label, icon]) => (
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
                    onClick={() => onMoveSelected(-1)}
                    disabled={selectedIndex === 0}
                    aria-label="Mover a la izquierda"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => onMoveSelected(1)}
                    disabled={selectedIndex === segments.length - 1}
                    aria-label="Mover a la derecha"
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
                    max={Math.max(0, masterDuration - selected.source_duration)}
                    step={0.05}
                    value={Number(selected.source_start.toFixed(3))}
                    onChange={(event) => {
                      const value = clamp(
                        Number(event.target.value),
                        0,
                        Math.max(0, masterDuration - selected.source_duration),
                      );
                      onUpdateSelected({
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
                    max={Math.max(
                      0.2,
                      Math.min(
                        masterDuration - selected.source_start,
                        targetDuration - (totalDuration - selected.duration),
                      ),
                    )}
                    step={0.05}
                    value={Number(selected.duration.toFixed(3))}
                    onChange={(event) => {
                      const value = clamp(
                        Number(event.target.value),
                        0.12,
                        Math.max(
                          0.12,
                          Math.min(
                            masterDuration - selected.source_start,
                            targetDuration - (totalDuration - selected.duration),
                          ),
                        ),
                      );
                      onUpdateSelected({
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
                quepa en el máster. La duración del montaje es la suma de sus segmentos y no
                puede superar el fragmento de audio ({formatTime(targetDuration)}).
              </div>
            </>
          )}
        </div>
      )}

      {tab === "effects" && doc && (
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
                onChange={(value) => onUpdateDoc({ ...doc, grade: { ...doc.grade, contrast: value } })}
              />
              <LabeledSlider
                label="Saturación"
                value={Number(doc.grade.saturation ?? 1)}
                min={0}
                max={2}
                onChange={(value) => onUpdateDoc({ ...doc, grade: { ...doc.grade, saturation: value } })}
              />
              <LabeledSlider
                label="Brillo"
                value={Number(doc.grade.brightness ?? 0)}
                min={-0.4}
                max={0.4}
                onChange={(value) => onUpdateDoc({ ...doc, grade: { ...doc.grade, brightness: value } })}
              />
              <LabeledSlider
                label="Volumen"
                value={doc.volume}
                min={0}
                max={2}
                onChange={(value) => onUpdateDoc({ ...doc, volume: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="panel-title">Efectos visuales</p>
              <Button size="sm" variant="quiet" onClick={onResetEffects}>
                <RotateCcw size={12} /> Neutro
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["sharpen", "Nitidez", 0, 1],
                ["vignette", "Viñeta", 0, 1],
                ["grain", "Grano", 0, 1],
                ["glow", "Glow", 0, 1],
                ["rgb_split", "RGB split", 0, 1],
              ] as const).map(([key, label, min, max]) => (
                <div key={key} className={cn(!allowed(key) && "opacity-40")}>
                  <LabeledSlider
                    label={`${label}${!allowed(key) ? " · no permitido" : ""}`}
                    value={Number(doc.effects[key] ?? 0)}
                    min={min}
                    max={max}
                    onChange={(value) => {
                      if (!allowed(key)) return;
                      onUpdateDoc({ ...doc, effects: { ...doc.effects, [key]: value } });
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
            projectId={edit.project_id}
            duration={totalDuration}
            lines={lyricsLines}
            style={lyricsStyle}
            enabled={lyricsEnabled}
            presets={lyricsPresets}
            animations={animations}
            fonts={fonts}
            onChangeLines={onChangeLyricsLines}
            onChangeStyle={onChangeLyricsStyle}
            onChangeEnabled={onChangeLyricsEnabled}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            <Button variant="primary" onClick={onSaveLyrics} loading={savingLyrics}>
              <Save size={15} /> Guardar letras
            </Button>
            <span className="text-[10px] text-white/30">
              Se queman con libass en la preview y en el render final.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}