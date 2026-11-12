import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/**
 * Opening Settings must never wait for an Android WebView GPU frame-commit
 * callback. On Android 15 WebView 124 + software GPU, even an isolated plain
 * WebView sometimes fails to commit a frame. An additional
 * postVisualStateCallback/registerFrameCommitCallback in the tab transition
 * can hold the whole Settings screen on "Открываю настройки" for 10+ seconds.
 *
 * The Settings tab already mounts optional camera/network/storage controls
 * in stages. Wait only for three responsive browser frames to retire the
 * outgoing screen, then display its lightweight controls immediately.
 *
 * Native UiFreezeMonitor still runs independently and retains the ability
 * to record renderer unresponsiveness. No Settings, Camera2, recording,
 * diagnostics or recovery feature is removed.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("settings: waiting for responsive tab transition");
    let alive = true;
    const cancel = scheduleAfterResponsivePaint(() => {
      if (!alive) return;
      traceUiAction("settings: opening without waiting for GPU frame commit");
      setReady(true);
    }, { stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => {
      alive = false;
      cancel();
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">
      Открываю настройки…
    </div>;
}
