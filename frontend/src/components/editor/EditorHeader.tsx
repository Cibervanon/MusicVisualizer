import { Download, Eye, Redo2, Save, Undo2 } from "lucide-react";
import { useMemo } from "react";

import { Button, SectionHeading } from "../ui";
import { formatTime } from "../../lib/utils";
import type { EDL } from "../../lib/types";

interface EditorHeaderProps {
  edit: EDL;
  totalDuration: number;
  dirty: boolean;
  saving: boolean;
  renderingType: "preview" | "final" | null;
  pastLength: number;
  futureLength: number;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPreview: () => void;
  onRenderFinal: () => void;
}

export function EditorHeader({
  edit,
  totalDuration,
  dirty,
  saving,
  renderingType,
  pastLength,
  futureLength,
  onUndo,
  onRedo,
  onSave,
  onPreview,
  onRenderFinal,
}: EditorHeaderProps) {
  const renderBusy = renderingType !== null;

  const actionButtons = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button
          onClick={onUndo}
          disabled={pastLength === 0}
          className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={onRedo}
          disabled={futureLength === 0}
          className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
        >
          <Redo2 size={15} />
        </button>
      </div>
      <Button variant="ghost" onClick={onSave} loading={saving} disabled={!dirty}>
        <Save size={15} /> {dirty ? "Guardar" : "Guardado"}
      </Button>
      <Button
        variant="ghost"
        onClick={onPreview}
        loading={renderingType === "preview"}
        disabled={renderBusy}
      >
        <Eye size={15} /> Preview
      </Button>
      <Button
        variant="primary"
        onClick={onRenderFinal}
        loading={renderingType === "final"}
        disabled={renderBusy}
      >
        <Download size={15} /> Render final
      </Button>
    </div>
  ), [dirty, saving, renderingType, renderBusy, pastLength, futureLength, onUndo, onRedo, onSave, onPreview, onRenderFinal]);

  return (
    <SectionHeading
      eyebrow="Paso 05 · Editor"
      title={`${edit.style_name} · ${formatTime(totalDuration)}`}
      description="Ajusta cortes, efectos y letras sobre el EDL real. Guarda, previsualiza a media resolución y renderiza el MP4 final."
      action={actionButtons}
    />
  );
}