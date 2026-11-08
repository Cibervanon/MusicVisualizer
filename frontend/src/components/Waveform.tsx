import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";

import { clamp, formatTime } from "../lib/utils";

interface WaveformProps {
  url: string;
  start: number;
  end: number;
  duration: number;
  onChange: (start: number, end: number) => void;
}

export function Waveform({ url, start, end, duration, onChange }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const syncingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setError(null);
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 92,
      waveColor: "rgba(255,255,255,0.18)",
      progressColor: "rgba(214,255,61,0.55)",
      cursorColor: "#D6FF3D",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      dragToSeek: true,
    });
    ws.registerPlugin(regions);
    regions.enableDragSelection({ color: "rgba(214,255,61,0.14)" });

    const addRegion = () => {
      const total = ws.getDuration() || duration;
      const safeStart = clamp(start, 0, Math.max(0, total - 0.5));
      const safeEnd = clamp(end || total, safeStart + 0.5, total);
      regions.clearRegions();
      regions.addRegion({
        start: safeStart,
        end: safeEnd,
        color: "rgba(214,255,61,0.14)",
        drag: true,
        resize: true,
      });
    };

    regions.on("region-updated", (region) => {
      if (syncingRef.current) return;
      const total = ws.getDuration() || duration;
      const s = clamp(region.start, 0, total - 0.3);
      const e = clamp(region.end, s + 0.3, total);
      onChange(Number(s.toFixed(3)), Number(e.toFixed(3)));
    });
    regions.on("region-created", (region) => {
      if (syncingRef.current) return;
      const total = ws.getDuration() || duration;
      const s = clamp(region.start, 0, total - 0.3);
      const e = clamp(region.end, s + 0.3, total);
      if (region.end - region.start < 0.3) region.setOptions({ end: s + 0.3 });
      onChange(Number(s.toFixed(3)), Number(Math.min(total, Math.max(e, s + 0.3)).toFixed(3)));
    });

    ws.on("ready", () => {
      setReady(true);
      addRegion();
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    ws.on("timeupdate", (value) => setTime(value));
    ws.on("error", () => setError("No se pudo cargar el audio para la onda."));

    ws.load(url);
    wsRef.current = ws;
    regionsRef.current = regions;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws || !ready) return;
    const current = regions.getRegions()[0];
    if (!current) return;
    if (Math.abs(current.start - start) < 0.05 && Math.abs(current.end - end) < 0.05) return;
    syncingRef.current = true;
    current.setOptions({ start, end });
    syncingRef.current = false;
  }, [start, end, ready]);

  const toggle = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.isPlaying()) ws.pause();
    else ws.play();
  };

  return (
    <div>
      <div className="relative rounded-xl border border-white/[0.07] bg-black/25 px-2 py-2">
        <div ref={containerRef} className="min-h-[92px] w-full" />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/35">
            Cargando onda…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? "Pausa" : "Escuchar"}
        </button>
        <button
          type="button"
          onClick={() => {
            wsRef.current?.seekTo(0);
            wsRef.current?.pause();
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-white/50 transition hover:text-white"
          aria-label="Volver al inicio"
        >
          <RotateCcw size={13} />
        </button>
        <span className="font-mono text-[11px] text-white/40">
          {formatTime(time, true)} / {formatTime(duration)}
        </span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-lime/20 bg-lime/[0.07] px-2.5 py-1 text-[11px] text-lime/90">
          Fragmento {formatTime(start)} – {formatTime(end)}
          <span className="text-lime/50">({(end - start).toFixed(1)}s)</span>
        </span>
      </div>
      <p className="mt-2 text-[11px] text-white/30">
        Arrastra sobre la onda para elegir el fragmento. Mueve o redimensiona la selección.
      </p>
    </div>
  );
}
