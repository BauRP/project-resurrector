import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/**
 * Android regression #175: the first Settings -> Camera click blocked Chromium
 * even with every CSS paint effect removed or a software WebView layer.
 * Keep the incoming Camera's complete functionality, but do not mount its
 * media-heavy React subtree in the SAME turn as Settings teardown.
 *
 * Camera2 recording safety is still controlled by MulticamApp navigation
 * guards; this only delays mounting the live Camera UI by responsive frames.
 * No camera, microphone, fold, or editor feature is disabled.
 */
export function CameraEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("camera: waiting for prior screen to release");
    let active = true;
    const cancel = scheduleAfterResponsivePaint(() => {
      if (!active) return;
      traceUiAction("camera: mounting after responsive paint");
      setReady(true);
    }, { stableFrames: 3, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
    return () => {
      active = false;
      cancel();
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">
      Открываю камеру…
    </div>;
}
