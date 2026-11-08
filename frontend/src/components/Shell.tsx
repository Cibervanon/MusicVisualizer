import {
  AudioLines,
  Check,
  Clapperboard,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  Scissors,
  Settings2,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { useStudio } from "../store/studio";
import type { Step } from "../lib/types";
import { Badge } from "./ui";

const NAV: Array<{ id: Step; label: string; hint: string; icon: ReactNode }> = [
  { id: "setup", label: "Fuente", hint: "Audio y vídeo", icon: <FolderPlus size={17} /> },
  { id: "customize", label: "Personalizar", hint: "Estilo y formato", icon: <Settings2 size={17} /> },
  { id: "results", label: "Resultados", hint: "Clips renderizados", icon: <LayoutGrid size={17} /> },
  { id: "editor", label: "Editor", hint: "Ajuste fino", icon: <Scissors size={17} /> },
];

function available(step: Step): boolean {
  const { project, step: current } = useStudio.getState();
  if (step === "setup") return true;
  if (!project) return false;
  if (step === "customize") return Boolean(project.audio && project.video);
  if (step === "results") return (project.edits || []).length > 0 || (project.renders || []).length > 0;
  if (step === "editor") return (project.edits || []).length > 0 || current === "editor";
  return true;
}

export function Shell({ children }: { children: ReactNode }) {
  const step = useStudio((state) => state.step);
  const project = useStudio((state) => state.project);
  const capabilities = useStudio((state) => state.capabilities);
  const setStep = useStudio((state) => state.setStep);
  const setSelectedEdit = useStudio((state) => state.setSelectedEdit);

  const go = (target: Step) => {
    if (!available(target)) return;
    if (target === "editor" && project && !useStudio.getState().selectedEditId && project.edits[0]) {
      setSelectedEdit(project.edits[0].id);
    }
    setStep(target);
  };

  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => item.id === step),
  );

  return (
    <div className="relative flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/60 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-lime via-emerald-300 to-cyan text-ink-950 shadow-glow">
            <AudioLines size={20} strokeWidth={2.4} />
          </div>
          <div>
            <p className="font-display text-[15px] font-bold tracking-[0.16em] text-white">LUMEN</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/35">
              clip studio
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
            Flujo de trabajo
          </p>
          {NAV.map((item, index) => {
            const enabled = available(item.id);
            const active = step === item.id;
            const done = enabled && index < activeIndex;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                disabled={!enabled}
                className={cn(
                  "nav-step group",
                  active
                    ? "border border-white/10 bg-white/[0.06] text-white"
                    : enabled
                      ? "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                      : "cursor-not-allowed text-white/20",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border transition",
                    active
                      ? "border-lime/30 bg-lime/10 text-lime"
                      : done
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                        : "border-white/10 bg-white/[0.02]",
                  )}
                >
                  {done ? <Check size={16} /> : item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                  <span className="block text-[10px] text-white/30">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {project && (
          <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Proyecto</p>
            <p className="mt-1 truncate text-sm font-semibold text-white/85">{project.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {project.analysis_summary.audio && (
                <span className="chip">
                  <Zap size={11} className="text-lime" />
                  {Math.round(project.analysis_summary.audio.bpm)} BPM
                </span>
              )}
              {project.analysis_summary.video && (
                <span className="chip">
                  <Clapperboard size={11} className="text-cyan" />
                  {project.analysis_summary.video.scenes} planos
                </span>
              )}
              {project.fragment && (
                <span className="chip">{Math.round(project.fragment.duration)}s</span>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-3 pt-6">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px]">
            <div className="flex items-center justify-between text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={12} className="text-lime" /> 100% local
              </span>
              <span className="text-emerald-300/80">sin nube</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-white/35">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive size={12} /> Disco
              </span>
              <span>{capabilities ? `${capabilities.disk.free_gb} GB libres` : "—"}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-white/35">
              <span className="inline-flex items-center gap-1.5">
                <Wand2 size={12} /> Motor
              </span>
              <span className="truncate pl-2 text-right">
                {capabilities?.ffmpeg?.split(" ")[2] || "FFmpeg"}
              </span>
            </div>
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-white/20">
            FFmpeg, librosa y OpenCV en tu equipo. Nada sale de aquí.
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-lime to-cyan text-ink-950">
                <AudioLines size={17} />
              </div>
              <span className="font-display text-sm font-bold tracking-[0.16em]">LUMEN</span>
            </div>
            {project && <Badge tone="accent">{project.name}</Badge>}
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                disabled={!available(item.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  step === item.id
                    ? "bg-white/10 text-white"
                    : available(item.id)
                      ? "text-white/45"
                      : "text-white/15",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          {children}
        </main>

        <footer className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[10px] text-white/20 sm:px-7 lg:px-10">
          <span>Lumen Studio · render real con FFmpeg</span>
          <span>Hecho para material propio o con derechos</span>
        </footer>
      </div>
    </div>
  );
}
