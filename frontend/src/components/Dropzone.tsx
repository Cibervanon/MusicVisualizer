import { FileUp, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { cn } from "../lib/utils";
import { ProgressBar } from "./ui";

export function Dropzone({
  accept,
  onFile,
  title,
  hint,
  icon,
  disabled = false,
  busy = false,
  progress = 0,
  fileName,
  children,
}: {
  accept: string;
  onFile: (file: File) => void;
  title: string;
  hint: string;
  icon: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  progress?: number;
  fileName?: string | null;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "relative overflow-hidden rounded-2xl border transition-all duration-300",
        dragging
          ? "border-lime/50 bg-lime/[0.06] shadow-glow"
          : fileName
            ? "border-white/10 bg-white/[0.03]"
            : "border-dashed border-white/12 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.035]",
        disabled && "opacity-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {busy && (
        <div className="absolute inset-x-0 top-0 z-10">
          <ProgressBar value={progress} height="h-1" />
        </div>
      )}
      <div className="flex items-center gap-3.5 px-4 py-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            fileName
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border-white/10 bg-white/[0.04] text-white/55",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/85">{fileName || title}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/35">
            {busy ? `Subiendo… ${Math.round(progress * 100)}%` : hint}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          {fileName ? <RefreshCw size={13} /> : <FileUp size={13} />}
          {fileName ? "Cambiar" : "Elegir"}
        </button>
      </div>
      {children}
    </div>
  );
}
