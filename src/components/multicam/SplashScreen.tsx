import { useEffect } from "react";
import { emptyCapabilityMatrix, loadMatrix, type CapabilityMatrix } from "@/lib/capabilities";

/** Do not race camera permission requests against the Android WebView preview.
 * Device diagnostics remain available by explicit user request. */
export function SplashScreen({ onDone }: { onDone: (matrix: CapabilityMatrix) => void }) {
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      if (alive) onDone(loadMatrix() ?? emptyCapabilityMatrix({
        camera: "not-requested", microphone: "not-requested", storage: "unavailable",
      }));
    }, 80);
    return () => { alive = false; window.clearTimeout(id); };
  }, [onDone]);

  return <div role="status" className="app-splash absolute inset-0 z-[100] flex flex-col items-center justify-center gap-5 px-8 text-center">
    <div className="multicam-brand-mark app-splash-logo" aria-hidden="true" />
    <p className="app-splash-title text-sm font-semibold uppercase tracking-[.25em]">MULTI-CAM POV</p>
    <div className="app-splash-progress h-1.5 w-full max-w-xs overflow-hidden rounded-full"><div className="h-full w-1/3 rounded-full" /></div>
    <p className="text-xs text-muted-foreground">Подготовка интерфейса…</p>
  </div>;
}
