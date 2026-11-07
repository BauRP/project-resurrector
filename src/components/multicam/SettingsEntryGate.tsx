import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/** Allow the outgoing camera/editor DOM to retire and the navigation shell
 * to traverse two frame boundaries before mounting another GPU-heavy screen.
 * This is NOT a feature switch: every Settings control remains accessible.
 *
 * Actual emulator #1585: an 1100ms fallback mounted the heavy Settings
 * module while 4.8s HardwareRenderer frames were still stalled. Only allow
 * mounting after three timely frames while visible; background/hidden WebViews
 * still enter after a bounded timeout. The native recovery dialog protects
 * users when a foreground WebView renderer never recovers.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("settings: prior tab released; two-paint boundary pending");
    const cancel = scheduleAfterResponsivePaint(() => {
      traceUiAction("settings: after responsive paint boundaries");
      setReady(true);
    }, { stableFrames: 3, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
    return cancel;
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">Открываю настройки…</div>;
}
