import { AudioLines, Loader2 } from "lucide-react";
import { useEffect } from "react";

import { Shell } from "./components/Shell";
import { ToastHost, SkipLink } from "./components/ui";
import { CustomizeScreen } from "./screens/CustomizeScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { GeneratingScreen } from "./screens/GeneratingScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { useStudio } from "./store/studio";

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lime via-emerald-300 to-cyan text-ink-950 shadow-glow">
        <AudioLines size={30} strokeWidth={2.4} />
        <span className="absolute -inset-3 -z-10 rounded-[28px] bg-lime/10 blur-2xl" />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold tracking-[0.22em] text-white">LUMEN</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.34em] text-white/35">clip studio</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Loader2 size={14} className="animate-spin" />
        Preparando el estudio local…
      </div>
    </div>
  );
}

function CurrentScreen() {
  const step = useStudio((state) => state.step);

  switch (step) {
    case "customize":
      return <CustomizeScreen />;
    case "generating":
      return <GeneratingScreen />;
    case "results":
      return <ResultsScreen />;
    case "editor":
      return <EditorScreen />;
    case "setup":
    default:
      return <SetupScreen />;
  }
}

export default function App() {
  const booted = useStudio((state) => state.booted);
  const init = useStudio((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <>
      <SkipLink />
      {booted ? (
        <Shell>
          <main id="main-content">
            <CurrentScreen />
          </main>
        </Shell>
      ) : (
        <BootScreen />
      )}
      <ToastHost />
    </>
  );
}
