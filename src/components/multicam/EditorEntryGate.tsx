import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/**
 * Keep all Editor media and tools, but mount the heavy subtree only after
 * responsive Chromium frames. Android emulators can falsely report
 * document.hidden even while their visible WebView is painting; the old
 * visibility guard left the Editor stuck on "Opening editor" forever.
 *
 * A real background WebView suspends RAF. The responsive-paint scheduler
 * resumes on foreground, never force-mounts media on a background timer,
 * and cancels stale mounts when the user leaves Editor.
 */
export function EditorEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("editor: waiting for outgoing media to release");
    let active = true;
    const cancel = scheduleAfterResponsivePaint(() => {
      if (!active) return;
      traceUiAction("editor: mounting after responsive frames");
      setReady(true);
    }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => {
      active = false;
      cancel();
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">
      Открываю редактор…
    </div>;
}
