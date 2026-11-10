import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/** On Android, the old Camera2/WebView video surface may still be retiring
 * while the user navigates to Editor. Start Editor media metadata, timeline
 * and video decoder only after four steady paint frames. Slow software\n * WebViews may render only 5fps, so the gap must not be a 60fps assumption. Navigation or
 * backgrounding cancels a pending start. No editor feature is disabled. */
export function EditorEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("editor: waiting for outgoing media to release");
    let active = true;
    let cancelFrames: (() => void) | null = null;
    const begin = () => {
      cancelFrames?.();
      cancelFrames = null;
      if (!active || document.hidden) return;
      cancelFrames = scheduleAfterResponsivePaint(() => {
        if (!active || document.hidden) return;
        traceUiAction("editor: mounting after responsive frames");
        setReady(true);
      }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800 });
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelFrames?.();
        cancelFrames = null;
      } else begin();
    };
    document.addEventListener("visibilitychange", onVisibility);
    begin();
    return () => {
      active = false;
      cancelFrames?.();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">
      Открываю редактор…
    </div>;
}
